-- Restrict share metadata and RPCs to the Pages service role.
-- Verified against synthetic PostgreSQL 17 staging on 2026-10-11.
-- Does not enable PIN throttling or public/anonymous Pages access.
revoke all privileges on function public.auto3d_create_share(uuid, uuid, boolean, text, boolean) from public, anon, authenticated;
revoke all privileges on function public.auto3d_verify_share(uuid, text) from public, anon, authenticated;
grant execute on function public.auto3d_create_share(uuid, uuid, boolean, text, boolean) to service_role;
grant execute on function public.auto3d_verify_share(uuid, text) to service_role;

-- Table-level REVOKE alone does not remove the old column-level grants.
revoke all privileges on table public.auto3d_share_links from public, anon, authenticated;
revoke select (token, item_id, allow_download, code_required, created_at, expires_at),
       insert (token, item_id, allow_download, code_required, expires_at)
    on table public.auto3d_share_links from public, anon, authenticated;
revoke all privileges on table auto3d_private.auto3d_share_codes from public, anon, authenticated;
-- Defensive: remove any additional direct column grants on both tables.
do $$
declare relation text; columns text;
begin
    foreach relation in array array['public.auto3d_share_links', 'auto3d_private.auto3d_share_codes'] loop
        select string_agg(format('%I', attname), ', ' order by attnum) into columns
        from pg_attribute where attrelid = relation::regclass and attnum > 0 and not attisdropped;
        execute format('revoke all privileges (%s) on table %s from public, anon, authenticated', columns, relation);
    end loop;
end $$;
grant usage on schema auto3d_private to service_role;
grant select, insert, update, delete on table public.auto3d_share_links, auto3d_private.auto3d_share_codes to service_role;

-- Old code policies accidentally compare share.token with itself. They are
-- unnecessary for service-only tables; remove them rather than broaden access.
drop policy if exists "Read active share link metadata" on public.auto3d_share_links;
drop policy if exists "Create links for published library items" on public.auto3d_share_links;
drop policy if exists "Share code insert" on auto3d_private.auto3d_share_codes;
drop policy if exists "Share code verify" on auto3d_private.auto3d_share_codes;
