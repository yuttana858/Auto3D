-- Synthetic fixture only; all job writes roll back.
begin;
do $$ begin
 if has_table_privilege('authenticated','public.auto3d_conversion_jobs','SELECT')
 or has_table_privilege('anon','public.auto3d_conversion_jobs','INSERT')
 or has_function_privilege('authenticated','public.auto3d_conversion_create(uuid,jsonb)','EXECUTE')
 or has_function_privilege('anon','public.auto3d_conversion_transition(uuid,uuid,text,integer,uuid,jsonb)','EXECUTE')
 then raise exception 'Browser role can access private conversion state'; end if;
end $$;
set local role service_role;
do $$
declare a uuid:='00000000-0000-4000-8000-000000000001'; b uuid:='00000000-0000-4000-8000-000000000002'; j jsonb; second jsonb; request jsonb; r jsonb; attempt uuid:=gen_random_uuid();
begin
 request:=jsonb_build_object('requestKey',gen_random_uuid(),'sourceName','public-synthetic.step','extension','step','sourceBytes',100,'sourceSha256',repeat('a',64),'sourceUnit',null,'quality','standard','origin',jsonb_build_object('windowId',gen_random_uuid(),'tabId',gen_random_uuid(),'revision',0));
 j:=public.auto3d_conversion_create(a,request);
 if (public.auto3d_conversion_create(a,request)->>'id')<>j->>'id' then raise exception 'Idempotency failed'; end if;
 begin perform public.auto3d_conversion_create(a,request||jsonb_build_object('sourceBytes',101)); raise exception 'Mismatched replay accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'cancel'); raise exception 'Cross-owner mutation accepted'; exception when sqlstate 'PT404' then null; end;
 second:=public.auto3d_conversion_create(a,request||jsonb_build_object('requestKey',gen_random_uuid()));
 begin perform public.auto3d_conversion_create(a,request||jsonb_build_object('requestKey',gen_random_uuid())); raise exception 'Active-owner quota not enforced'; exception when sqlstate 'PT429' then null; end;
 perform public.auto3d_conversion_transition(a,(second->>'id')::uuid,'cancel');
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'uploaded');
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('b',64)));
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'claim',null,attempt);
 if (r->>'claimed')::boolean is not true then raise exception 'Initial claim failed'; end if;
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'claim',null,attempt);
 if (r->>'claimed')::boolean is not false then raise exception 'Duplicate claim accepted'; end if;
 begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'progress',null,gen_random_uuid(),jsonb_build_object('stage','converting')); raise exception 'Superseded attempt accepted'; exception when sqlstate 'PT409' then null; end;
 update public.auto3d_conversion_jobs set lease_until=null where id=(j->>'id')::uuid;
 begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'complete',null,attempt,jsonb_build_object('summary','{}'::jsonb,'artifacts','{}'::jsonb)); raise exception 'Null lease accepted'; exception when sqlstate 'PT409' then null; end;
 update public.auto3d_conversion_jobs set lease_until=now()+interval '2 minutes' where id=(j->>'id')::uuid;
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'cancel');
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'progress',null,attempt,jsonb_build_object('stage','converting'));
 if r->'job'->>'state'<>'cancelling' then raise exception 'Cancellation not visible'; end if;
 begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'complete',null,attempt,jsonb_build_object('summary','{}'::jsonb,'artifacts','{}'::jsonb)); raise exception 'Cancelled result accepted'; exception when sqlstate 'PT409' then null; end;
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'failure',null,attempt,jsonb_build_object('code','cancelled'));
 if r->'job'->>'state'<>'cancelled' or r->'job'->>'token_hash' is not null then raise exception 'Terminal capability retained'; end if;
 -- A transient failure can retry once; unsupported/native failures cannot.
 j:=public.auto3d_conversion_create(b,request||jsonb_build_object('requestKey',gen_random_uuid()));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'uploaded');
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('b',64)));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'failure',null,attempt,jsonb_build_object('code','transfer_failed'));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'retry'); attempt:=gen_random_uuid();
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('c',64)));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'failure',null,attempt,jsonb_build_object('code','transfer_failed'));
 begin perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'retry'); raise exception 'Attempt limit exceeded'; exception when sqlstate 'PT409' then null; end;
end $$;
rollback;
