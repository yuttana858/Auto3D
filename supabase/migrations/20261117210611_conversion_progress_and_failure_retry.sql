-- Service-only progress and one bounded retry of previously unclassified worker failures.
begin;
create or replace function public.auto3d_conversion_transition(
    p_owner uuid,p_job uuid,p_event text,p_revision integer default null,p_attempt uuid default null,p_data jsonb default '{}'
)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    job public.auto3d_conversion_jobs;
    was_claimed boolean:=false;
begin
    select * into job from public.auto3d_conversion_jobs where id=p_job and owner_id=p_owner for update;
    if not found or job.state='deleted' then raise exception using errcode='PT404',message='Job unavailable'; end if;
    if p_revision is not null and job.revision<>p_revision then raise exception using errcode='PT409',message='Job changed'; end if;
    if p_event not in ('uploaded','dispatch','ack','claim','progress','complete','failure','cancel','delete','expire','retry') then
        raise exception using errcode='22023',message='Invalid job event';
    end if;
    if p_event in ('ack','claim','progress','complete','failure') and (p_attempt is null or p_attempt is distinct from job.active_attempt) then
        raise exception using errcode='PT409',message='Attempt superseded';
    end if;
    if p_event not in ('delete','expire','cancel','retry') and (job.expires_at<=now() or job.deadline_at<=now()) then
        raise exception using errcode='PT410',message='Job expired';
    end if;
    case p_event
    when 'uploaded' then
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conversion-capacity',0));
        if (select count(*) from public.auto3d_conversion_jobs where state in ('queued','running') and deadline_at>now())>=8 then raise exception using errcode='PT429',message='Conversion queue limit reached'; end if;
        if job.state<>'awaiting_upload' then raise exception using errcode='PT409',message='Upload already finalized'; end if;
        job.state:='queued';job.stage:='queued';
    when 'dispatch' then
        if job.state<>'queued' or job.attempts>=2 or (job.dispatched_at is not null and job.dispatched_at>now()-interval '2 minutes') then
            raise exception using errcode='PT409',message='Dispatch already active';
        end if;
        job.active_attempt:=(p_data->>'attemptId')::uuid;job.token_hash:=p_data->>'tokenHash';job.attempts:=job.attempts+1;
        if job.active_attempt is null or job.token_hash is null then raise exception using errcode='22023',message='Attempt required'; end if;
        job.dispatched_at:=now();job.dispatch_state:='pending';job.provider_call_id:=null;job.lease_until:=null;
    when 'ack' then
        if coalesce(p_data->>'callId','') !~ '^fc-[A-Za-z0-9]+$' then raise exception using errcode='22023',message='Call reference invalid'; end if;
        job.provider_call_id:=p_data->>'callId';job.dispatch_state:='sent';
    when 'claim' then
        if job.state='queued' then job.state:='running';job.stage:='downloading';job.lease_until:=now()+interval '2 minutes';was_claimed:=true;
        else return pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),'claimed',false); end if;
    when 'progress' then
        if job.state not in ('running','cancelling') or (job.lease_until is null or job.lease_until<=now()) then raise exception using errcode='PT409',message='Lease inactive'; end if;
        if job.state='running' then
            if coalesce(p_data->>'stage','') not in ('downloading','converting','uploading') then raise exception using errcode='22023',message='Invalid stage'; end if;
            if p_data ? 'progress' then
                if jsonb_typeof(p_data->'progress') is distinct from 'object' or octet_length((p_data->'progress')::text)>512 then
                    raise exception using errcode='22023',message='Invalid progress';
                end if;
                if (select count(*) from pg_catalog.jsonb_object_keys(p_data->'progress'))<>4
                   or not (p_data->'progress' ?& array['phase','completed','total','unit'])
                   or coalesce(p_data#>>'{progress,phase}','') not in ('download_source','read_source','build_geometry','validate_geometry','write_step','validate_step','tessellate','build_mesh','validate_mesh','upload_artifacts','finalizing') then
                    raise exception using errcode='22023',message='Invalid progress';
                end if;
                if not (p_data#>'{progress,completed}'='null'::jsonb and p_data#>'{progress,total}'='null'::jsonb and p_data#>'{progress,unit}'='null'::jsonb) then
                    if jsonb_typeof(p_data#>'{progress,completed}') is distinct from 'number' or jsonb_typeof(p_data#>'{progress,total}') is distinct from 'number'
                       or (p_data#>>'{progress,completed}') !~ '^[0-9]+$' or (p_data#>>'{progress,total}') !~ '^[0-9]+$'
                       or coalesce(p_data#>>'{progress,unit}','') not in ('bytes','faces','files') then
                        raise exception using errcode='22023',message='Invalid work count';
                    end if;
                    if (p_data#>>'{progress,total}')::numeric<=0 or (p_data#>>'{progress,total}')::numeric>1000000000000
                       or (p_data#>>'{progress,completed}')::numeric>(p_data#>>'{progress,total}')::numeric then
                        raise exception using errcode='22023',message='Invalid work count';
                    end if;
                end if;
                if (p_data#>>'{progress,phase}'='download_source' and p_data->>'stage'<>'downloading')
                   or (p_data#>>'{progress,phase}' in ('upload_artifacts','finalizing') and p_data->>'stage'<>'uploading')
                   or (p_data#>>'{progress,phase}' not in ('download_source','upload_artifacts','finalizing') and p_data->>'stage'<>'converting') then
                    raise exception using errcode='22023',message='Progress stage mismatch';
                end if;
                if coalesce(pg_catalog.array_position(array['download_source','read_source','build_geometry','validate_geometry','write_step','validate_step','tessellate','build_mesh','validate_mesh','upload_artifacts','finalizing'],job.summary#>>'{progress,phase}'),0)
                   <=pg_catalog.array_position(array['download_source','read_source','build_geometry','validate_geometry','write_step','validate_step','tessellate','build_mesh','validate_mesh','upload_artifacts','finalizing'],p_data#>>'{progress,phase}') then
                    if job.summary#>>'{progress,phase}' is distinct from p_data#>>'{progress,phase}'
                       or job.summary#>>'{progress,total}' is null
                       or (job.summary#>>'{progress,total}'=p_data#>>'{progress,total}' and job.summary#>>'{progress,unit}'=p_data#>>'{progress,unit}' and (p_data#>>'{progress,completed}')::numeric>=(job.summary#>>'{progress,completed}')::numeric) then
                        job.stage:=p_data->>'stage';job.summary:=pg_catalog.jsonb_set(job.summary,'{progress}',p_data->'progress');
                    end if;
                end if;
            elsif not (job.summary ? 'progress') then job.stage:=p_data->>'stage'; end if;
            job.lease_until:=now()+interval '2 minutes';
        end if;
    when 'complete' then
        if job.state<>'running' or (job.lease_until is null or job.lease_until<=now()) then raise exception using errcode='PT409',message='Result publication refused'; end if;
        if jsonb_typeof(p_data->'artifacts') is distinct from 'object' or jsonb_typeof(p_data->'summary') is distinct from 'object' then raise exception using errcode='22023',message='Evidence required'; end if;
        job.state:='ready';job.stage:='ready';job.artifacts:=p_data->'artifacts';job.summary:=p_data->'summary';job.completed_at:=now();job.token_hash:=null;job.lease_until:=null;
    when 'failure' then
        if coalesce(p_data->>'code','') !~ '^[a-z_]{1,64}$' then raise exception using errcode='22023',message='Failure code required'; end if;
        if job.state not in ('queued','running','cancelling') then raise exception using errcode='PT409',message='Job finished'; end if;
        job.state:=case when job.state='cancelling' or p_data->>'code'='cancelled' then 'cancelled' else 'failed' end;
        if p_data ? 'diagnostic' then
            if jsonb_typeof(p_data->'diagnostic') is distinct from 'object' or octet_length((p_data->'diagnostic')::text)>1024
               or (select count(*) from pg_catalog.jsonb_object_keys(p_data->'diagnostic'))<>2
               or coalesce(p_data#>>'{diagnostic,exception}','') not in ('TypeError','ValueError','AttributeError','RuntimeError','MemoryError','OSError','ConversionError','SchemaError','ParseError','LimitExceededError','OcctConversionError','InteropError','NativeError')
               or jsonb_typeof(p_data#>'{diagnostic,frames}') is distinct from 'array' then
                raise exception using errcode='22023',message='Invalid diagnostic';
            end if;
            if jsonb_array_length(p_data#>'{diagnostic,frames}')>4 or exists(select 1 from pg_catalog.jsonb_array_elements_text(p_data#>'{diagnostic,frames}') f where f !~ '^[A-Za-z0-9_]{1,64}:[0-9]{1,8}$') then
                raise exception using errcode='22023',message='Invalid diagnostic';
            end if;
            job.summary:=pg_catalog.jsonb_set(job.summary,'{diagnostic}',p_data->'diagnostic');
        end if;
        job.stage:=job.state;job.error_code:=p_data->>'code';job.completed_at:=now();job.token_hash:=null;job.lease_until:=null;
    when 'cancel' then
        if job.state='running' then job.state:='cancelling';job.stage:='cancelling';
        elsif job.state in ('queued','awaiting_upload') then job.state:='cancelled';job.stage:='cancelled';job.token_hash:=null;job.completed_at:=now(); end if;
    when 'retry' then
        if job.state<>'failed' or job.attempts>=2 or job.error_code not in ('transfer_failed','lease_expired','dispatch_failed','conversion_failed','worker_failed') or job.expires_at<=now() then
            raise exception using errcode='PT409',message='Retry unavailable';
        end if;
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conversion-capacity',0));
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conversion-owner:'||p_owner::text,0));
        if (select count(*) from public.auto3d_conversion_jobs where owner_id=p_owner and state in ('awaiting_upload','queued','running','cancelling') and deadline_at>now())>=2
           or (select count(*) from public.auto3d_conversion_jobs where state in ('queued','running') and deadline_at>now())>=8 then
            raise exception using errcode='PT429',message='Conversion queue limit reached';
        end if;
        job.state:='queued';job.stage:='queued';job.dispatched_at:=null;job.error_code:=null;job.lease_until:=null;job.token_hash:=null;
        job.summary:='{}'::jsonb;job.deadline_at:=least(job.expires_at,now()+interval '30 minutes');
    when 'delete' then job.state:='deleted';job.stage:='deleted';job.token_hash:=null;job.lease_until:=null;
    when 'expire' then
        if job.expires_at<=now() or (job.state in ('awaiting_upload','queued','running','cancelling') and job.deadline_at<=now()) then
            job.state:='expired';job.stage:='expired';job.token_hash:=null;job.lease_until:=null;
        elsif job.state in ('running','cancelling') and (job.lease_until is null or job.lease_until<=now()) then
            job.state:=case when job.state='cancelling' then 'cancelled' else 'failed' end;job.stage:=job.state;
            job.error_code:='lease_expired';job.token_hash:=null;job.lease_until:=null;job.completed_at:=now();
        end if;
    end case;
    job.revision:=job.revision+1;job.updated_at:=now();
    update public.auto3d_conversion_jobs set state=job.state,stage=job.stage,revision=job.revision,active_attempt=job.active_attempt,
        token_hash=job.token_hash,attempts=job.attempts,dispatch_state=job.dispatch_state,dispatched_at=job.dispatched_at,
        provider_call_id=job.provider_call_id,lease_until=job.lease_until,artifacts=job.artifacts,summary=job.summary,
        error_code=job.error_code,updated_at=job.updated_at,completed_at=job.completed_at,deadline_at=job.deadline_at where id=p_job and owner_id=p_owner;
    return pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),'claimed',was_claimed);
end;
$$;
notify pgrst,'reload schema';
commit;
