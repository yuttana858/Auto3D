-- Account identity always comes from the verified Supabase user UUID.
create table public.auto3d_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 preferences jsonb not null default '{"units":"metric","theme":1}',
 folders jsonb not null default '["Uncategorized"]',
 updated_at timestamptz not null default now()
);
create table public.auto3d_personal_library (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 100), category text not null,
 kind text not null check(kind in ('model','session')), object_count integer not null check(object_count between 1 and 1000),
 archive_key text not null unique, thumbnail_key text not null unique,
 file_size bigint not null check(file_size between 1 and 34603008),
 status text not null default 'pending' check(status in ('pending','ready')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index auto3d_personal_library_owner on public.auto3d_personal_library(user_id,created_at desc,id);
alter table public.auto3d_preferences enable row level security;
alter table public.auto3d_personal_library enable row level security;
create policy preferences_owner on public.auto3d_preferences for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy personal_library_owner on public.auto3d_personal_library for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.auto3d_preferences,public.auto3d_personal_library from anon,authenticated;
grant all on public.auto3d_preferences,public.auto3d_personal_library to service_role;
-- Serialize reservations for an owner so concurrent saves cannot exceed the 1 GiB quota.
create or replace function public.auto3d_reserve_personal_item(p_user_id uuid,p_id uuid,p_name text,p_category text,p_kind text,p_object_count integer,p_file_size bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if (select count(*) from public.auto3d_personal_library where user_id=p_user_id)>=1000 or (select coalesce(sum(file_size),0) from public.auto3d_personal_library where user_id=p_user_id)+p_file_size > 1073741824 then raise exception 'Account library quota exceeded' using errcode='P0001'; end if;
 insert into public.auto3d_personal_library(id,user_id,name,category,kind,object_count,file_size,archive_key,thumbnail_key)
 values(p_id,p_user_id,p_name,p_category,p_kind,p_object_count,p_file_size,'users/'||p_user_id||'/'||p_id||'/session.auto3d','users/'||p_user_id||'/'||p_id||'/thumbnail.png');
end; $$;
revoke all on function public.auto3d_reserve_personal_item(uuid,uuid,text,text,text,integer,bigint) from public,anon,authenticated;
grant execute on function public.auto3d_reserve_personal_item(uuid,uuid,text,text,text,integer,bigint) to service_role;
