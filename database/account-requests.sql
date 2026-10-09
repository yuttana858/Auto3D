-- Server-only access; never grant browser roles privileges on these tables/RPC.
create table public.auto3d_admin_emails (email text primary key check (email = lower(email)));
alter table public.auto3d_admin_emails enable row level security;
revoke all on public.auto3d_admin_emails from public, anon, authenticated;
grant select on public.auto3d_admin_emails to service_role;
insert into public.auto3d_admin_emails values ('yuttana.chiaravalloti@smurfitwestrock.com');
create table public.auto3d_access_requests (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 name text not null check(length(name) between 1 and 100),
 reason text not null default '' check(length(reason) <= 1000),
 status text not null default 'pending' check(status in ('pending','processing','approved','rejected')),
 ip_hash text not null, created_at timestamptz not null default now(),
 reviewed_at timestamptz, reviewed_by uuid, user_id uuid
);
alter table public.auto3d_access_requests enable row level security;
revoke all on public.auto3d_access_requests from public, anon, authenticated;
grant select, insert, update on public.auto3d_access_requests to service_role;
create index auto3d_request_rate on public.auto3d_access_requests(ip_hash, created_at);
create function public.auto3d_request_account(p_email text,p_name text,p_reason text,p_ip_hash text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));
 if (select count(*) from public.auto3d_access_requests where ip_hash=p_ip_hash and created_at > now()-interval '1 hour') >= 3 then return; end if;
 insert into public.auto3d_access_requests(email,name,reason,ip_hash)
 values(p_email,p_name,p_reason,p_ip_hash) on conflict(email) do nothing;
end; $$;
revoke all on function public.auto3d_request_account(text,text,text,text) from public,anon,authenticated;
grant execute on function public.auto3d_request_account(text,text,text,text) to service_role;
