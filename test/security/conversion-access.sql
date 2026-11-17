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
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'progress',null,attempt,jsonb_build_object('stage','converting','progress',jsonb_build_object('phase','build_mesh','completed',1,'total',4,'unit','faces')));
 if r#>>'{job,summary,progress,completed}'<>'1' then raise exception 'Measured progress lost'; end if;
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'progress',null,attempt,jsonb_build_object('stage','converting','progress',jsonb_build_object('phase','read_source','completed',null,'total',null,'unit',null)));
 if r#>>'{job,summary,progress,phase}'<>'build_mesh' then raise exception 'Late heartbeat regressed phase'; end if;
 r:=public.auto3d_conversion_transition(a,(j->>'id')::uuid,'progress',null,attempt,jsonb_build_object('stage','converting','progress',jsonb_build_object('phase','build_mesh','completed',0,'total',4,'unit','faces')));
 if r#>>'{job,summary,progress,completed}'<>'1' then raise exception 'Late heartbeat regressed measured count'; end if;
 begin perform public.auto3d_conversion_transition(a,(j->>'id')::uuid,'progress',null,attempt,jsonb_build_object('stage','converting','progress',jsonb_build_object('phase','build_mesh','completed',-1,'total',4,'unit','faces'))); raise exception 'Invalid counter accepted'; exception when sqlstate '22023' then null; end;
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
 -- Transient and old unclassified failures can retry once; known unsupported failures cannot.
 j:=public.auto3d_conversion_create(b,request||jsonb_build_object('requestKey',gen_random_uuid()));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'uploaded');
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('b',64)));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'failure',null,attempt,jsonb_build_object('code','transfer_failed'));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'retry'); attempt:=gen_random_uuid();
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('c',64)));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'failure',null,attempt,jsonb_build_object('code','transfer_failed'));
 begin perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'retry'); raise exception 'Attempt limit exceeded'; exception when sqlstate 'PT409' then null; end;
 j:=public.auto3d_conversion_create(b,request||jsonb_build_object('requestKey',gen_random_uuid())); attempt:=gen_random_uuid();
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'uploaded');
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('d',64)));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'ack',null,attempt,jsonb_build_object('callId','fc-OldRetry123456'));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'failure',null,attempt,jsonb_build_object('code','conversion_failed'));
 update public.auto3d_conversion_jobs set deadline_at=now()-interval '1 minute' where id=(j->>'id')::uuid;
 r:=public.auto3d_conversion_transition(b,(j->>'id')::uuid,'retry');
 if (r#>>'{job,deadline_at}')::timestamptz<=now() or r#>>'{job,state}'<>'queued' then raise exception 'Bounded retry did not renew its processing deadline'; end if;
 if r#>>'{job,dispatch_state}'<>'pending' or r#>>'{job,provider_call_id}' is not null or r#>>'{job,active_attempt}' is not null then raise exception 'Retry retained old dispatch identity'; end if;
 begin perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'ack',null,attempt,jsonb_build_object('callId','fc-LateOldRetry123456')); raise exception 'Late acknowledgement restored the old dispatch'; exception when sqlstate 'PT409' then null; end;
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'cancel');
 j:=public.auto3d_conversion_create(b,request||jsonb_build_object('requestKey',gen_random_uuid())); attempt:=gen_random_uuid();
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'uploaded');
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'dispatch',null,null,jsonb_build_object('attemptId',attempt,'tokenHash',repeat('e',64)));
 perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'failure',null,attempt,jsonb_build_object('code','unsupported_schema'));
 begin perform public.auto3d_conversion_transition(b,(j->>'id')::uuid,'retry'); raise exception 'Unsupported schema retry accepted'; exception when sqlstate 'PT409' then null; end;
end $$;
rollback;
