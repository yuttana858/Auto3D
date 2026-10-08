-- Narrow server-only session check; no access to token columns.
grant usage on schema auth to service_role;
grant select(id,user_id) on auth.sessions to service_role;
create function public.auto3d_session_active(p_session_id uuid,p_user_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id);
$$;
revoke all on function public.auto3d_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.auto3d_session_active(uuid,uuid) to service_role;
