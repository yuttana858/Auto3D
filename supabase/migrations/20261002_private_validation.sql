create schema if not exists auto3d_private;
revoke all on schema auto3d_private from public, anon;
grant usage on schema auto3d_private to authenticated;
alter function public.auto3d_files_ready(uuid) set schema auto3d_private;
revoke all on function auto3d_private.auto3d_files_ready(uuid) from public, anon;
grant execute on function auto3d_private.auto3d_files_ready(uuid) to authenticated;
alter policy "Publish complete prototype saves" on public.auto3d_library
with check (auto3d_private.auto3d_files_ready(id) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false);
alter policy "Upload new prototype files" on storage.objects
with check (
    bucket_id = 'auto3d-library'
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(session[.]auto3d|thumbnail[.]png)$'
);
