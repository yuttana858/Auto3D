-- Isolated test database only. Reproduce the old retry bug before its corrective migration.
set role service_role;
do $$
declare j jsonb; attempt uuid:=gen_random_uuid(); owner uuid:='00000000-0000-4000-8000-000000000001';
begin
 j:=public.auto3d_conversion_create(owner,jsonb_build_object('requestKey','00000000-0000-4000-8000-000000000099','sourceName','public-retry.step','extension','step','sourceBytes',100,'sourceSha256',repeat('a',64),'sourceUnit',null,'quality','standard','origin','{}'::jsonb));
 perform public.auto3d_conversion_transition(owner,(j->>'id')::uuid,'uploaded');
 perform public.auto3d_conversion_transition(owner,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('b',64)));
 perform public.auto3d_conversion_transition(owner,(j->>'id')::uuid,'ack',null,attempt,jsonb_build_object('callId','fc-PublicOldRetry123456'));
 perform public.auto3d_conversion_transition(owner,(j->>'id')::uuid,'failure',null,attempt,jsonb_build_object('code','conversion_failed'));
 perform public.auto3d_conversion_transition(owner,(j->>'id')::uuid,'retry');
end $$;
reset role;
