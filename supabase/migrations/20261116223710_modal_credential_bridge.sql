-- Supabase Vault is already installed. No new secret table or encryption key is needed.
-- All entry points are SECURITY INVOKER and executable only by the trusted server role.
-- Browser authorization remains in Pages RequireAdmin, not user-editable JWT metadata.
begin;

create function public.auto3d_modal_connection_read(p_profile text, p_purpose text)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
    if p_profile is null or p_profile not in ('production', 'preview')
       or p_purpose is null or p_purpose not in ('runtime', 'deployment') then
        raise exception using errcode = '22023', message = 'Invalid Modal connection selector';
    end if;
    return (select decrypted_secret::jsonb from vault.decrypted_secrets
            where name = 'auto3d/modal/v1/' || p_profile || '/' || p_purpose);
end;
$$;

create function public.auto3d_modal_connection_save(
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
       or coalesce(p_settings->>'tokenId', '') !~ (case p_purpose when 'runtime' then '^wk-' else '^ak-' end || '[A-Za-z0-9_-]{8,509}$')
       or coalesce(p_settings->>'tokenSecret', '') !~ (case p_purpose when 'runtime' then '^ws-' else '^as-' end || '[A-Za-z0-9_-]{8,509}$')
       or (p_purpose = 'deployment' and coalesce(p_settings->>'endpoint', 'invalid') <> '')
       or (p_purpose = 'runtime' and (coalesce(p_settings->>'endpoint', '') !~ '^https://[a-z0-9][a-z0-9-]{0,190}\.modal\.run$'
            or pg_catalog.left(p_settings->>'endpoint', pg_catalog.length('https://' || (p_settings->>'workspace') || '--')) <> 'https://' || (p_settings->>'workspace') || '--')) then
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

create function public.auto3d_modal_connection_delete(
    p_profile text, p_purpose text, p_expected_revision uuid default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    secret_name text;
    existing_id uuid;
    existing_revision uuid;
begin
    if p_profile is null or p_profile not in ('production', 'preview')
       or p_purpose is null or p_purpose not in ('runtime', 'deployment') then
        raise exception using errcode = '22023', message = 'Invalid Modal connection selector';
    end if;
    secret_name := 'auto3d/modal/v1/' || p_profile || '/' || p_purpose;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(secret_name, 0));
    select id, (decrypted_secret::jsonb->>'revision')::uuid into existing_id, existing_revision
        from vault.decrypted_secrets where name = secret_name;
    if existing_revision is distinct from p_expected_revision then
        raise exception using errcode = 'PT409', message = 'Modal connection changed';
    end if;
    delete from vault.secrets where id = existing_id;
    return '{}'::jsonb;
end;
$$;

revoke all on function public.auto3d_modal_connection_read(text,text) from public, anon, authenticated;
revoke all on function public.auto3d_modal_connection_save(text,text,jsonb,uuid,uuid) from public, anon, authenticated;
revoke all on function public.auto3d_modal_connection_delete(text,text,uuid) from public, anon, authenticated;
grant execute on function public.auto3d_modal_connection_read(text,text) to service_role;
grant execute on function public.auto3d_modal_connection_save(text,text,jsonb,uuid,uuid) to service_role;
grant execute on function public.auto3d_modal_connection_delete(text,text,uuid) to service_role;

comment on function public.auto3d_modal_connection_read(text,text) is 'Server-only credential read; never expose RPC responses to clients or logs.';
notify pgrst, 'reload schema';
commit;
