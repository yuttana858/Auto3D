-- Synthetic fixture only. Run after both Modal migrations. Every write is rolled back.
begin;
set local role service_role;
do $$
declare
    settings jsonb := '{"workspace":"fixture","environment":"main","app":"cloud-3d-studio","endpoint":"https://fixture--gateway.modal.run","tokenId":"wk-fixture123456","tokenSecret":"ws-privatefixture123456"}'::jsonb;
    initial_revision uuid;
    next_revision uuid;
    stored jsonb;
begin
    if public.auto3d_modal_connection_read('preview','runtime') is not null then
        raise exception 'Preview slot occupied; refusing fixture';
    end if;
    initial_revision := (public.auto3d_modal_connection_save('preview','runtime',settings,
        '00000000-0000-4000-8000-000000000001',null)->>'revision')::uuid;
    stored := public.auto3d_modal_connection_read('preview','runtime');
    if stored->'settings' <> settings or stored->>'profile' <> 'preview' then
        raise exception 'Read-back mismatch';
    end if;
    if exists(select 1 from vault.secrets where name='auto3d/modal/v1/preview/runtime'
              and secret like '%privatefixture%') then
        raise exception 'Fixture is not encrypted';
    end if;
    begin
        perform public.auto3d_modal_connection_save('preview','runtime',settings,
            '00000000-0000-4000-8000-000000000001',null);
        raise exception 'Missing revision accepted';
    exception when sqlstate 'PT409' then null;
    end;
    next_revision := (public.auto3d_modal_connection_save('preview','runtime',settings,
        '00000000-0000-4000-8000-000000000001',initial_revision)->>'revision')::uuid;
    if next_revision=initial_revision then raise exception 'Rotation reused revision'; end if;
    begin
        perform public.auto3d_modal_connection_delete('preview','runtime',initial_revision);
        raise exception 'Stale removal accepted';
    exception when sqlstate 'PT409' then null;
    end;
    perform public.auto3d_modal_connection_delete('preview','runtime',next_revision);
    if public.auto3d_modal_connection_read('preview','runtime') is not null then
        raise exception 'Removal failed';
    end if;
end;
$$;
rollback;
select true as vault_roundtrip_rotation_conflict_removal_passed,
    (select count(*) from vault.secrets where name like 'auto3d/modal/v1/%') as stored_modal_records;
