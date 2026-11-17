-- Modal URLs can include an environment web suffix after the workspace slug.
begin;
create or replace function public.auto3d_modal_connection_save(
    p_profile text, p_purpose text, p_settings jsonb, p_actor uuid,
    p_expected_revision uuid default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    secret_name text;
    existing_id uuid;
    existing_revision uuid;
    next_revision uuid := pg_catalog.gen_random_uuid();
    payload jsonb;
begin
    if p_profile is null or p_profile not in ('production', 'preview')
       or p_purpose is null or p_purpose not in ('runtime', 'deployment')
       or p_actor is null or p_settings is null or pg_catalog.jsonb_typeof(p_settings) <> 'object'
       or pg_catalog.octet_length(p_settings::text) > 8192 then
        raise exception using errcode = '22023', message = 'Invalid Modal connection settings';
    end if;
    if not (p_settings ?& array['workspace','environment','app','endpoint','tokenId','tokenSecret'])
       or p_settings - array['workspace','environment','app','endpoint','tokenId','tokenSecret'] <> '{}'::jsonb
       or coalesce(p_settings->>'app', '') <> 'cloud-3d-studio'
       or coalesce(p_settings->>'workspace', '') !~ '^[a-z0-9][a-z0-9-]{0,62}$'
       or coalesce(p_settings->>'environment', '') !~ '^[a-z0-9][a-z0-9-]{0,62}$'
       or pg_catalog.length(p_settings->>'tokenId') > 512
       or pg_catalog.length(p_settings->>'tokenSecret') > 512
       or coalesce(p_settings->>'tokenId', '') !~ (case p_purpose when 'runtime' then '^wk-' else '^ak-' end || '[A-Za-z0-9_-]{8,}$')
       or coalesce(p_settings->>'tokenSecret', '') !~ (case p_purpose when 'runtime' then '^ws-' else '^as-' end || '[A-Za-z0-9_-]{8,}$')
       or (p_purpose = 'deployment' and coalesce(p_settings->>'endpoint', 'invalid') <> '')
       or (p_purpose = 'runtime' and (coalesce(p_settings->>'endpoint', '') !~ '^https://[a-z0-9][a-z0-9-]{0,190}\.modal\.run$'
            or coalesce(p_settings->>'endpoint','') !~ ('^https://' || (p_settings->>'workspace') || '(--|-[a-z0-9-]+--)'))) then
        raise exception using errcode = '22023', message = 'Invalid Modal connection settings';
    end if;
    secret_name := 'auto3d/modal/v1/' || p_profile || '/' || p_purpose;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(secret_name, 0));
    select id, (decrypted_secret::jsonb->>'revision')::uuid into existing_id, existing_revision
        from vault.decrypted_secrets where name = secret_name;
    if existing_revision is distinct from p_expected_revision then
        raise exception using errcode = 'PT409', message = 'Modal connection changed';
    end if;
    payload := pg_catalog.jsonb_build_object('schema', 1, 'profile', p_profile, 'purpose', p_purpose,
        'settings', p_settings, 'revision', next_revision, 'updatedBy', p_actor, 'updatedAt', pg_catalog.now());
    if existing_id is null then
        perform vault.create_secret(payload::text, secret_name, 'Auto3D Modal connection; server only');
    else
        perform vault.update_secret(existing_id, payload::text);
    end if;
    return pg_catalog.jsonb_build_object('revision', next_revision);
end;
$$;

notify pgrst,'reload schema';
commit;
