-- Isolated CI fixture only. No customer data or hosted changes.
begin;
set local role service_role;
do $$
declare
    a uuid:='00000000-0000-4000-8000-000000000001';
    b uuid:='00000000-0000-4000-8000-000000000002';
    j jsonb;r jsonb;bad jsonb;active1 jsonb;active2 jsonb;attempt uuid:=gen_random_uuid();old_attempt uuid:=gen_random_uuid();
    report jsonb:='{"schemaVersion":1,"versions":{"worker":"0.4.0","reader":"0.3.17","occt":"7.9.3.1.1"},"outcome":"error_detected","phase":"build_geometry","failureCode":"invalid_geometry","readerCode":"occt.construction_failed","exception":"Standard_ConstructionError","frames":["conversion:292"],"checks":{"sourceRead":"passed","geometryBuild":"failed","geometryValidation":"not_run","stepExport":"not_run","stepReimport":"not_run"}}';
    request jsonb:=jsonb_build_object('requestKey',gen_random_uuid(),'sourceName','public-diagnostic.x_t','extension','x_t','sourceBytes',100,'sourceSha256',repeat('a',64),'sourceUnit','mm','quality','standard','origin',jsonb_build_object('windowId',gen_random_uuid(),'tabId',gen_random_uuid(),'revision',0));
begin
    perform public.auto3d_conversion_validate_report(report);
    foreach bad in array array[
        report||'{"message":"private content"}'::jsonb,
        jsonb_set(report,'{frames}','["/private/file.x_t:4"]'),
        jsonb_set(report,'{checks,geometryBuild}','"passed"'),
        jsonb_set(report,'{versions,worker}','"private-token"'),
        jsonb_set(report,'{outcome}','"cad_validated"'),
        jsonb_set(report,'{exception}','"private text"')
    ] loop
        begin perform public.auto3d_conversion_validate_report(bad);raise exception 'Private or inconsistent report accepted';exception when sqlstate '22023' then null;end;
    end loop;
    j:=public.auto3d_conversion_create(a,request);
    update public.auto3d_conversion_jobs set state='failed',stage='failed',attempts=2,error_code='invalid_geometry',deadline_at=now()-interval '1 minute',active_attempt=old_attempt,
        summary='{"progress":{"phase":"build_mesh","completed":2,"total":8,"unit":"faces"}}' where id=(j->>'id')::uuid;
    begin perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'diagnose');raise exception 'Cross-owner diagnosis accepted';exception when sqlstate 'PT404' then null;end;
    begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'diagnose',999);raise exception 'Stale diagnosis accepted';exception when sqlstate 'PT409' then null;end;
    r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'diagnose',(j->>'revision')::integer);
    if r#>>'{job,purpose}'<>'diagnostic' or r#>>'{job,attempts}'<>'2' or r#>>'{job,diagnostic_attempts}'<>'0' or r#>>'{job,dispatch_state}'<>'pending' then raise exception 'Diagnostic changed conversion attempts/outbox';end if;
    if (r#>>'{job,deadline_at}')::timestamptz<=now() or (r#>>'{job,deadline_at}')::timestamptz>(r#>>'{job,expires_at}')::timestamptz then raise exception 'Diagnostic retention/deadline failed';end if;
    begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'ack',null,old_attempt,'{"callId":"fc-OldReference123"}');raise exception 'Old conversion ACK accepted';exception when sqlstate 'PT409' then null;end;
    r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('b',64)));
    if r#>>'{job,attempts}'<>'2' or r#>>'{job,diagnostic_attempts}'<>'1' then raise exception 'Diagnostic consumed a conversion attempt';end if;
    r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'claim',null,attempt);
    r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'progress',null,attempt,'{"stage":"converting","progress":{"phase":"read_source","completed":null,"total":null,"unit":null}}');
    if r#>>'{job,summary,progress,phase}'<>'build_mesh' or r#>>'{job,diagnostic_progress,phase}'<>'read_source' then raise exception 'Original conversion progress overwritten';end if;
    begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'complete',null,attempt,jsonb_build_object('report',report||'{"raw":"private"}'));raise exception 'Raw diagnostic accepted';exception when sqlstate '22023' then null;end;
    r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'complete',null,attempt,jsonb_build_object('report',report));
    if r#>>'{job,state}'<>'failed' or r#>>'{job,purpose}'<>'conversion' or r#>>'{job,error_code}'<>'invalid_geometry' or r#>>'{job,attempts}'<>'2' or r#>'{job,diagnostic_report}'<>report or r#>>'{job,token_hash}' is not null then raise exception 'Diagnostic published geometry or lost original failure';end if;
    begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'ack',null,attempt,'{"callId":"fc-LateReference123"}');raise exception 'Late diagnostic ACK accepted';exception when sqlstate 'PT409' then null;end;
    active1:=public.auto3d_conversion_create(a,request||jsonb_build_object('requestKey',gen_random_uuid()));
    active2:=public.auto3d_conversion_create(a,request||jsonb_build_object('requestKey',gen_random_uuid()));
    begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'diagnose');raise exception 'Diagnostic bypassed shared owner capacity';exception when sqlstate 'PT429' then null;end;
    perform public.auto3d_conversion_transition(a,(active1->>'id')::uuid,'cancel');
    perform public.auto3d_conversion_transition(a,(active2->>'id')::uuid,'cancel');
    perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'diagnose');attempt:=gen_random_uuid();
    perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('c',64)));
    perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'claim',null,attempt);
    perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'cancel');
    r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'failure',null,attempt,'{"code":"cancelled"}');
    if r#>>'{job,state}'<>'failed' or r#>>'{job,error_code}'<>'invalid_geometry' or r#>>'{job,diagnostic_error_code}'<>'cancelled' then raise exception 'Diagnostic cancellation lost original failure';end if;
    begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'diagnose');raise exception 'Diagnostic compute limit not enforced';exception when sqlstate 'PT409' then null;end;
    j:=public.auto3d_conversion_create(b,request||jsonb_build_object('requestKey',gen_random_uuid()));
    update public.auto3d_conversion_jobs set state='failed',stage='failed',error_code='invalid_parasolid' where id=(j->>'id')::uuid;
    perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'diagnose');
    update public.auto3d_conversion_jobs set deadline_at=now()-interval '1 minute' where id=(j->>'id')::uuid;
    r:=public.auto3d_conversion_transition(b,(j->>'id')::uuid,'expire');
    if r#>>'{job,state}'<>'failed' or r#>>'{job,error_code}'<>'invalid_parasolid' or r#>>'{job,diagnostic_error_code}'<>'timeout' then raise exception 'Diagnostic deadline expired the original source early';end if;
    perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'diagnose');
    r:=public.auto3d_conversion_transition(b,(j->>'id')::uuid,'delete');
    if r#>>'{job,state}'<>'deleted' or r#>>'{job,diagnostic_report}' is not null or r#>>'{job,token_hash}' is not null then raise exception 'Delete did not revoke diagnostics';end if;
end $$;
reset role;
do $$ begin
    if has_function_privilege('anon','public.auto3d_conversion_validate_report(jsonb)','execute') or has_function_privilege('authenticated','public.auto3d_conversion_transition(uuid,uuid,text,integer,uuid,jsonb)','execute') then raise exception 'Diagnostic RPC exposed to browser role';end if;
end $$;
rollback;
