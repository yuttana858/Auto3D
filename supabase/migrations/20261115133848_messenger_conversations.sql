-- Server-only conversation storage. The Pages API authenticates the actor; no browser role
-- may invoke these service-role functions or read the tables directly.
create table public.auto3d_conversations (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('direct', 'group', 'ai')),
 title text not null default '' check (char_length(title) <= 120),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.auto3d_conversation_members (
 conversation_id uuid not null references public.auto3d_conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key (conversation_id,user_id)
);
create unique index auto3d_conversation_one_ai_per_user on public.auto3d_conversations(created_by) where kind='ai';
create index auto3d_conversation_members_user on public.auto3d_conversation_members(user_id,conversation_id);
create table public.auto3d_conversation_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.auto3d_conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id),
 origin text not null default 'user' check (origin in ('user','agent')),
 body text not null check (char_length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index auto3d_conversation_messages_order on public.auto3d_conversation_messages(conversation_id,created_at,id);
create index auto3d_conversation_messages_sender_rate on public.auto3d_conversation_messages(sender_id,created_at desc);
alter table public.auto3d_conversations enable row level security;
alter table public.auto3d_conversation_members enable row level security;
alter table public.auto3d_conversation_messages enable row level security;
revoke all on public.auto3d_conversations,public.auto3d_conversation_members,public.auto3d_conversation_messages from public,anon,authenticated;
grant select,insert,update,delete on public.auto3d_conversations,public.auto3d_conversation_members,public.auto3d_conversation_messages to service_role;
-- Existing production grants already allow id and banned_until; this additional
-- column is needed to exclude anonymous identities when validating recipients.
grant select (is_anonymous) on auth.users to service_role;

-- The server supplies a previously verified user ID; neither the actor nor sender comes
-- from a browser payload. Keep membership checks and each write in the same transaction.
create function public.auto3d_conversation_create(p_actor uuid,p_kind text,p_title text,p_members uuid[])
returns uuid language plpgsql security invoker set search_path='' as $$
declare new_id uuid; members uuid[]; member uuid;
begin
 if p_actor is null or p_kind not in ('direct','group','ai') or p_title is null or char_length(p_title)>120 or p_members is null or cardinality(p_members)>30 or array_position(p_members,null) is not null then raise exception 'Invalid conversation' using errcode='22023'; end if;
 select array_agg(distinct m) into members from unnest(array_append(p_members,p_actor)) as m;
 if (p_kind='ai' and cardinality(members)<>1) or (p_kind='direct' and cardinality(members)<>2) or (p_kind='group' and cardinality(members)<2) then raise exception 'Invalid conversation members' using errcode='22023'; end if;
 for member in select unnest(members) order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended('messenger-create:'||member::text,0));
  if (select count(*) from public.auto3d_conversation_members m where m.user_id=member)>=500 then raise exception 'Conversation limit reached' using errcode='22023'; end if;
 end loop;
 if exists (select 1 from unnest(members) as m left join auth.users u on u.id=m left join public.auto3d_account_controls c on c.user_id=m where u.id is null or u.email_confirmed_at is null or u.is_anonymous=true or coalesce(c.disabled,false) or (u.banned_until is not null and u.banned_until>now())) then raise exception 'Member unavailable' using errcode='22023'; end if;
 insert into public.auto3d_conversations(kind,title,created_by) values(p_kind,p_title,p_actor) returning id into new_id;
 insert into public.auto3d_conversation_members(conversation_id,user_id) select new_id,m from unnest(members) as m;
 return new_id;
end; $$;
create function public.auto3d_conversation_send(p_actor uuid,p_conversation uuid,p_body text,p_origin text,p_id uuid)
returns public.auto3d_conversation_messages language plpgsql security invoker set search_path='' as $$
declare result public.auto3d_conversation_messages;
begin
 if p_actor is null or p_id is null or p_origin is null or p_origin not in ('user','agent') or p_body is null or char_length(trim(p_body)) not between 1 and 4000 then raise exception 'Conversation unavailable' using errcode='22023'; end if;
 perform 1 from public.auto3d_conversations c where c.id=p_conversation for update;
 if not exists(select 1 from public.auto3d_conversation_members m join public.auto3d_conversations c on c.id=m.conversation_id where m.user_id=p_actor and m.conversation_id=p_conversation and (p_origin='user' or c.kind='ai')) then raise exception 'Conversation unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('messenger-send:'||p_actor::text,0));
 select * into result from public.auto3d_conversation_messages where id=p_id;
 if found then if result.sender_id=p_actor and result.conversation_id=p_conversation and result.body=trim(p_body) and result.origin=p_origin then return result; end if; raise exception 'Message identifier unavailable' using errcode='22023'; end if;
 if (select count(*) from public.auto3d_conversation_messages m where m.sender_id=p_actor and m.created_at>now()-interval '1 minute')>=120 then raise exception 'Message rate limit' using errcode='22023'; end if;
 insert into public.auto3d_conversation_messages(id,conversation_id,sender_id,body,origin) values(p_id,p_conversation,p_actor,trim(p_body),p_origin) returning * into result;
 return result;
end; $$;
revoke all on function public.auto3d_conversation_create(uuid,text,text,uuid[]),public.auto3d_conversation_send(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.auto3d_conversation_create(uuid,text,text,uuid[]),public.auto3d_conversation_send(uuid,uuid,text,text,uuid) to service_role;

create function public.auto3d_conversation_list(p_actor uuid)
returns table(id uuid,kind text,title text,created_at timestamptz) language sql stable security invoker set search_path='' as $$
 select c.id,c.kind,c.title,c.created_at from public.auto3d_conversations c join public.auto3d_conversation_members m on m.conversation_id=c.id
 where m.user_id=p_actor order by c.created_at desc,c.id desc limit 500;
$$;
revoke all on function public.auto3d_conversation_list(uuid) from public,anon,authenticated;
grant execute on function public.auto3d_conversation_list(uuid) to service_role;

-- Leave and send serialize on the conversation row, so a removed member cannot
-- race a write past the membership check. AI history is never removed this way.
create function public.auto3d_conversation_leave(p_actor uuid,p_conversation uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare conversation_kind text;
begin
 select c.kind into conversation_kind from public.auto3d_conversations c where c.id=p_conversation for update;
 if conversation_kind is null or conversation_kind='ai' or not exists(select 1 from public.auto3d_conversation_members m where m.user_id=p_actor and m.conversation_id=p_conversation) then raise exception 'Conversation unavailable' using errcode='22023'; end if;
 delete from public.auto3d_conversation_members m where m.user_id=p_actor and m.conversation_id=p_conversation;
 if not exists(select 1 from public.auto3d_conversation_members m where m.conversation_id=p_conversation) then delete from public.auto3d_conversations c where c.id=p_conversation; end if;
 return true;
end; $$;
revoke all on function public.auto3d_conversation_leave(uuid,uuid) from public,anon,authenticated;
grant execute on function public.auto3d_conversation_leave(uuid,uuid) to service_role;

-- Ordered cursor pages, checked in the same statement as the read. Unauthorized and
-- nonexistent conversations both yield no rows; membership never comes from the client.
create function public.auto3d_conversation_read(p_actor uuid,p_conversation uuid,p_before_time timestamptz,p_before_id uuid,p_limit integer)
returns table(id uuid,conversation_id uuid,sender_id uuid,sender_email text,body text,origin text,created_at timestamptz) language sql stable security invoker set search_path='' as $$
 select msg.id,msg.conversation_id,msg.sender_id,u.email,msg.body,msg.origin,msg.created_at from public.auto3d_conversation_messages msg join auth.users u on u.id=msg.sender_id
 where msg.conversation_id=p_conversation
 and exists(select 1 from public.auto3d_conversation_members m where m.user_id=p_actor and m.conversation_id=msg.conversation_id)
 and ((p_before_time is null and p_before_id is null) or (p_before_time is not null and p_before_id is not null and (msg.created_at,msg.id)<(p_before_time,p_before_id)))
 order by msg.created_at desc,msg.id desc limit least(greatest(coalesce(p_limit,50),1),100);
$$;
revoke all on function public.auto3d_conversation_read(uuid,uuid,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.auto3d_conversation_read(uuid,uuid,timestamptz,uuid,integer) to service_role;

-- Exact-address lookup avoids publishing a global account directory. Attempts are
-- rate limited per actor, including misses. It returns no auth profile or metadata.
create table public.auto3d_messenger_lookup_rate (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 attempts integer not null check (attempts>=0)
);
alter table public.auto3d_messenger_lookup_rate enable row level security;
revoke all on public.auto3d_messenger_lookup_rate from public,anon,authenticated;
grant select,insert,update on public.auto3d_messenger_lookup_rate to service_role;
create function public.auto3d_messenger_find_user(p_actor uuid,p_email text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare count_attempts integer; found uuid;
begin
 if p_actor is null or p_email is null or char_length(p_email)>254 or char_length(p_email)<3 then raise exception 'Invalid lookup' using errcode='22023'; end if;
 insert into public.auto3d_messenger_lookup_rate(user_id,window_start,attempts) values(p_actor,now(),1)
 on conflict(user_id) do update set window_start=case when auto3d_messenger_lookup_rate.window_start<now()-interval '10 minutes' then now() else auto3d_messenger_lookup_rate.window_start end,
 attempts=case when auto3d_messenger_lookup_rate.window_start<now()-interval '10 minutes' then 1 else auto3d_messenger_lookup_rate.attempts+1 end returning attempts into count_attempts;
 if count_attempts>20 then raise exception 'Lookup limit' using errcode='22023'; end if;
 select u.id into found from auth.users u left join public.auto3d_account_controls c on c.user_id=u.id
 where lower(u.email)=lower(trim(p_email)) and u.email_confirmed_at is not null and u.is_anonymous=false and coalesce(c.disabled,false)=false and (u.banned_until is null or u.banned_until<=now()) and u.id<>p_actor limit 1;
 return found;
end; $$;
revoke all on function public.auto3d_messenger_find_user(uuid,text) from public,anon,authenticated;
grant execute on function public.auto3d_messenger_find_user(uuid,text) to service_role;
