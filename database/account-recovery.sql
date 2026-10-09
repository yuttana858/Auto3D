grant select(id,email,email_confirmed_at,banned_until) on auth.users to service_role;
create function public.auto3d_recovery_allowed(p_email text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from auth.users u where lower(u.email)=lower(p_email) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()) and (
 exists(select 1 from public.auto3d_admin_emails a where a.email=lower(u.email)) or
 exists(select 1 from public.auto3d_access_requests r where r.user_id=u.id and r.status='approved') or
 exists(select 1 from public.auto3d_users a where a.auth_user_id=u.id and a.status='active')
 )); $$;
revoke all on function public.auto3d_recovery_allowed(text) from public,anon,authenticated;
grant execute on function public.auto3d_recovery_allowed(text) to service_role;
create table public.auto3d_recovery_attempts(email_hash text not null,ip_hash text not null,created_at timestamptz not null default now());
create index auto3d_recovery_email on public.auto3d_recovery_attempts(email_hash,created_at);
create index auto3d_recovery_ip on public.auto3d_recovery_attempts(ip_hash,created_at);
alter table public.auto3d_recovery_attempts enable row level security;
revoke all on public.auto3d_recovery_attempts from anon,authenticated;
grant all on public.auto3d_recovery_attempts to service_role;
create function public.auto3d_recovery_attempt(p_email_hash text,p_ip_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_ip_hash,1));
 perform pg_advisory_xact_lock(hashtextextended(p_email_hash,2));
 delete from public.auto3d_recovery_attempts where created_at<now()-interval '24 hours';
 if exists(select 1 from public.auto3d_recovery_attempts where email_hash=p_email_hash and created_at>now()-interval '60 seconds') or
 (select count(*) from public.auto3d_recovery_attempts where email_hash=p_email_hash and created_at>now()-interval '1 hour')>=5 or
 (select count(*) from public.auto3d_recovery_attempts where ip_hash=p_ip_hash and created_at>now()-interval '1 hour')>=20 then return false; end if;
 insert into public.auto3d_recovery_attempts(email_hash,ip_hash) values(p_email_hash,p_ip_hash); return true;
end; $$;
revoke all on function public.auto3d_recovery_attempt(text,text) from public,anon,authenticated;
grant execute on function public.auto3d_recovery_attempt(text,text) to service_role;
