-- Disposable synthetic database only.
begin;
set local role service_role;
do $$
declare
    a uuid:='00000000-0000-4000-8000-000000000001';j jsonb;result jsonb;attempt uuid:=gen_random_uuid();bad jsonb;
    inventory jsonb:='{"schemaVersion":1,"sourceFormat":"step","colors":{"detected":2,"glb":"not_run","step":"not_run"},"transparency":{"detected":1,"glb":"not_run","step":"not_run"},"materials":{"detected":0,"glb":"not_run","step":"not_run"},"imageTextures":{"detected":null,"status":"not_exposed_by_reader"},"stl":"geometry_only","validation":"not_run"}';
    report jsonb:='{"schemaVersion":1,"versions":{"worker":"0.5.0","reader":"0.3.17","occt":"7.9.3.1.1"},"outcome":"cad_validated","phase":"validate_step","failureCode":null,"readerCode":null,"exception":null,"frames":[],"checks":{"sourceRead":"passed","geometryBuild":"passed","geometryValidation":"passed","stepExport":"passed","stepReimport":"passed"}}';
begin
    perform public.auto3d_conversion_validate_appearance(inventory,true);
    foreach bad in array array[inventory||'{"private":"model"}',jsonb_set(inventory,'{colors,rgb}','[1,0,0]'),jsonb_set(inventory,'{colors,detected}','8193'),jsonb_set(inventory,'{transparency,detected}','3'),jsonb_set(inventory,'{imageTextures,detected}','0'),jsonb_set(inventory,'{colors,glb}','"preserved"')] loop
        begin perform public.auto3d_conversion_validate_appearance(bad,true);raise exception 'Private or inconsistent inventory accepted';exception when sqlstate '22023' then null;end;
    end loop;
    j:=public.auto3d_conversion_create(a,jsonb_build_object('requestKey',gen_random_uuid(),'sourceName','public.step','extension','step','sourceBytes',100,'sourceSha256',repeat('a',64),'sourceUnit',null,'quality','standard','origin',jsonb_build_object('windowId',gen_random_uuid(),'tabId',gen_random_uuid(),'revision',0)));
    update public.auto3d_conversion_jobs set state='failed',stage='failed',error_code='validation_failed',attempts=1 where id=(j->>'id')::uuid;
    perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'diagnose');
    perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('c',64)));
    perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'claim',null,attempt);
    result:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'complete',null,attempt,jsonb_build_object('report',report,'appearance',inventory));
    if result#>'{job,summary,appearanceSource}' is distinct from inventory or result#>>'{job,state}'<>'failed' or result#>>'{job,attempts}'<>'1' or result#>>'{job,diagnostic_attempts}'<>'1' or result#>'{job,artifacts}'<>'{}'::jsonb then raise exception 'Inventory changed conversion state or lost evidence';end if;
end $$;
reset role;
do $$ begin
    if has_function_privilege('anon','public.auto3d_conversion_validate_appearance(jsonb,boolean)','execute') or has_function_privilege('authenticated','public.auto3d_conversion_validate_appearance(jsonb,boolean)','execute') then raise exception 'Appearance validator exposed to browser';end if;
end $$;
rollback;
