-- Dedicated audience snapshots; existing published/account Library permissions stay intact.
create table public.auto3d_audience_shares (
    token uuid primary key,
    owner_id uuid not null references auth.users(id) on delete cascade,
    source text not null check (source in ('account','device','published')),
    source_item_id text not null,
    name text not null check (length(name) between 1 and 100),
    archive_key text not null unique,
    file_size bigint not null check (file_size between 0 and 33554432),
    code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
    allow_download boolean not null default false,
    status text not null default 'pending' check (status in ('pending','ready','revoked')),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    window_started timestamptz not null default now(),
    failed_count integer not null default 0,
    locked_until timestamptz
);
create index auto3d_audience_owner_idx on public.auto3d_audience_shares(owner_id,created_at desc);
create table public.auto3d_audience_attempts (
    token uuid not null references public.auto3d_audience_shares(token) on delete cascade,
    actor_hash text not null check (actor_hash ~ '^[0-9a-f]{64}$'),
    window_started timestamptz not null default now(),
    failed_count integer not null default 0,
    locked_until timestamptz,
    primary key(token,actor_hash)
);
alter table public.auto3d_audience_shares enable row level security;
alter table public.auto3d_audience_attempts enable row level security;
revoke all on public.auto3d_audience_shares,public.auto3d_audience_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.auto3d_audience_shares,public.auto3d_audience_attempts to service_role;

-- Service-only invoker RPC: the authenticated Pages route supplies the verified owner.
create function public.auto3d_reserve_audience_share(p_owner uuid,p_token uuid,p_source text,p_item text,p_name text,p_size bigint,p_hash text,p_download boolean,p_days integer)
returns void language plpgsql security invoker set search_path = pg_catalog,public as $$
begin
    if p_days not between 1 and 90 or p_size not between 4 and 33554432 then raise exception 'Invalid share limits'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text,1706));
    if (select count(*) from public.auto3d_audience_shares where owner_id=p_owner and file_size>0)>=1000
       or (select coalesce(sum(file_size),0) from public.auto3d_audience_shares where owner_id=p_owner)+p_size>1073741824 then
       raise exception 'Share storage limit reached';
    end if;
    insert into public.auto3d_audience_shares(token,owner_id,source,source_item_id,name,archive_key,file_size,code_hash,allow_download,expires_at)
    values(p_token,p_owner,p_source,p_item,p_name,'audience/'||p_owner||'/'||p_token||'/session.auto3d',p_size,p_hash,p_download,now()+make_interval(days=>p_days));
end $$;

-- Lock the share before the actor: limits are atomic, including across distributed actors.
-- Five failures per actor / fifteen minutes; thirty failures per share / fifteen minutes.
-- Either lock lasts thirty minutes. Successful unlocks do not reset aggregate failures.
create function public.auto3d_verify_audience_share(p_token uuid,p_hash text,p_actor text)
returns table(archive_key text,name text,allow_download boolean,retry_after integer)
language plpgsql security invoker set search_path = pg_catalog,public as $$
declare s public.auto3d_audience_shares%rowtype; a public.auto3d_audience_attempts%rowtype; until_time timestamptz;
begin
    if p_actor is null or p_actor !~ '^[0-9a-f]{64}$' or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return; end if;
    select * into s from public.auto3d_audience_shares where token=p_token and status='ready' and expires_at>now() for update;
    if not found then return; end if;
    insert into public.auto3d_audience_attempts(token,actor_hash) values(p_token,p_actor) on conflict do nothing;
    select * into a from public.auto3d_audience_attempts where token=p_token and actor_hash=p_actor for update;
    until_time:=greatest(s.locked_until,a.locked_until);
    if until_time>now() then retry_after:=greatest(1,ceil(extract(epoch from until_time-now()))::integer); return next; return; end if;
    if s.window_started<=now()-interval '15 minutes' then s.failed_count:=0; update public.auto3d_audience_shares set failed_count=0,window_started=now(),locked_until=null where token=p_token; end if;
    if a.window_started<=now()-interval '15 minutes' then a.failed_count:=0; update public.auto3d_audience_attempts set failed_count=0,window_started=now(),locked_until=null where token=p_token and actor_hash=p_actor; end if;
    if s.code_hash<>p_hash then
        update public.auto3d_audience_shares set failed_count=s.failed_count+1,locked_until=case when s.failed_count+1>=30 then now()+interval '30 minutes' else null end where token=p_token;
        update public.auto3d_audience_attempts set failed_count=a.failed_count+1,locked_until=case when a.failed_count+1>=5 then now()+interval '30 minutes' else null end where token=p_token and actor_hash=p_actor;
        if a.failed_count+1>=5 or s.failed_count+1>=30 then retry_after:=1800; return next; end if;
        return;
    end if;
    update public.auto3d_audience_attempts set failed_count=0,locked_until=null,window_started=now() where token=p_token and actor_hash=p_actor;
    archive_key:=s.archive_key; name:=s.name; allow_download:=s.allow_download; retry_after:=0; return next;
end $$;
revoke all on function public.auto3d_reserve_audience_share(uuid,uuid,text,text,text,bigint,text,boolean,integer) from public,anon,authenticated;
revoke all on function public.auto3d_verify_audience_share(uuid,text,text) from public,anon,authenticated;
grant execute on function public.auto3d_reserve_audience_share(uuid,uuid,text,text,text,bigint,text,boolean,integer) to service_role;
grant execute on function public.auto3d_verify_audience_share(uuid,text,text) to service_role;
