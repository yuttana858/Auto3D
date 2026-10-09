-- Server-only access controls and a session cutoff; no credential/token columns.
create table public.auto3d_account_controls (
 user_id uuid primary key references auth.users(id) on delete cascade,
 disabled boolean not null default false,
 sessions_after timestamptz,
 updated_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.auto3d_account_controls enable row level security;
revoke all on public.auto3d_account_controls from public,anon,authenticated;
grant all on public.auto3d_account_controls to service_role;
grant select(created_at) on auth.sessions to service_role;
create or replace function public.auto3d_session_active(p_session_id uuid,p_user_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from auth.sessions s
 left join public.auto3d_account_controls c on c.user_id=s.user_id
 where s.id=p_session_id and s.user_id=p_user_id and coalesce(c.disabled,false)=false
 and (c.sessions_after is null or s.created_at>c.sessions_after));
$$;
revoke all on function public.auto3d_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.auto3d_session_active(uuid,uuid) to service_role;
