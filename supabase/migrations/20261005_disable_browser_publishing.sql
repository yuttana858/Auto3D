-- Auto3D corporate identity transition.
-- Shared library browsing stays read-only from the browser.
-- Publishing will be reintroduced only through a trusted backend authenticated by corporate identity.

revoke insert on public.auto3d_library from authenticated;

drop policy if exists "Publish complete prototype saves" on public.auto3d_library;
drop policy if exists "Upload new prototype files" on storage.objects;

revoke execute on function auto3d_private.auto3d_files_ready(uuid) from authenticated;
revoke usage on schema auto3d_private from authenticated;
