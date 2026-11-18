-- Verify the corrective migration repaired the seeded outbox without spending another attempt.
set role service_role;
do $$
declare j public.auto3d_conversion_jobs;
begin
 select * into strict j from public.auto3d_conversion_jobs where owner_id='00000000-0000-4000-8000-000000000001' and request_key='00000000-0000-4000-8000-000000000099';
 if j.state<>'queued' or j.dispatch_state<>'pending' or j.attempts<>1 or j.active_attempt is not null or j.provider_call_id is not null then raise exception 'Stuck retry was not safely repaired'; end if;
 delete from public.auto3d_conversion_jobs where id=j.id;
end $$;
reset role;
