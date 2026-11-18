-- Private, bounded server diagnostics reuse the same source, worker and capacity limits.
begin;
alter table public.auto3d_conversion_jobs
    add column purpose text not null default 'conversion' check (purpose in ('conversion','diagnostic')),
    add column diagnostic_attempts integer not null default 0 check (diagnostic_attempts between 0 and 2),
    add column diagnostic_report jsonb check (diagnostic_report is null or (jsonb_typeof(diagnostic_report)='object' and octet_length(diagnostic_report::text)<=8192)),
    add column diagnostic_error_code text check (diagnostic_error_code is null or diagnostic_error_code ~ '^[a-z_]{1,64}$'),
    add column diagnostic_progress jsonb check (diagnostic_progress is null or octet_length(diagnostic_progress::text)<=512);

create function public.auto3d_conversion_validate_report(r jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare
    key text;
    i integer;
    phases text[]:=array['download_source','read_source','build_geometry','validate_geometry','write_step','validate_step','tessellate','build_mesh','validate_mesh','upload_artifacts','finalizing'];
    checks text[]:=array['sourceRead','geometryBuild','geometryValidation','stepExport','stepReimport'];
    expected text;
begin
    if jsonb_typeof(r) is distinct from 'object' or octet_length(r::text)>8192 then raise exception using errcode='22023',message='Invalid diagnostic report'; end if;
    if (select count(*) from pg_catalog.jsonb_object_keys(r))<>9 or not(r ?& array['schemaVersion','versions','outcome','phase','failureCode','readerCode','exception','frames','checks'])
       or r->'schemaVersion'<>'1'::jsonb or coalesce(r->>'outcome','') not in ('error_detected','cad_validated')
       or coalesce(r->>'phase','')<>all(phases) or jsonb_typeof(r->'versions') is distinct from 'object' or jsonb_typeof(r->'checks') is distinct from 'object' then raise exception using errcode='22023',message='Invalid diagnostic report'; end if;
    if (select count(*) from pg_catalog.jsonb_object_keys(r->'versions'))<>3 or not(r->'versions' ?& array['worker','reader','occt'])
       or (select count(*) from pg_catalog.jsonb_object_keys(r->'checks'))<>5 or not(r->'checks' ?& checks) then raise exception using errcode='22023',message='Invalid diagnostic report'; end if;
    foreach key in array array['worker','reader','occt'] loop
        if not(key<>'worker' and r#>array['versions',key]='null'::jsonb) and
           (jsonb_typeof(r#>array['versions',key]) is distinct from 'string' or (r#>>array['versions',key]) !~ '^[0-9]{1,5}(\.[0-9]{1,5}){1,5}$') then raise exception using errcode='22023',message='Invalid version'; end if;
    end loop;
    if not(r->'readerCode'='null'::jsonb) and coalesce(r->>'readerCode','') not in ('occt.bodies_failed','occt.construction_failed','occt.faces_dropped','occt.healing_unavailable','occt.invalid_geometry','occt.invalid_reference','occt.invalid_shape','occt.invalid_topology','occt.limit_exceeded','occt.source_incomplete','occt.unknown_orientation','occt.unsupported_body','occt.unsupported_curve','occt.unsupported_surface','occt.unsupported_topology') then raise exception using errcode='22023',message='Invalid reader code'; end if;
    if jsonb_typeof(r->'frames') is distinct from 'array' then raise exception using errcode='22023',message='Invalid frames'; end if;
    if jsonb_array_length(r->'frames')>4 or exists(select 1 from pg_catalog.jsonb_array_elements(r->'frames') f where jsonb_typeof(f) is distinct from 'string' or (f#>>'{}') !~ '^[A-Za-z0-9_]{1,64}:[0-9]{1,8}$') then raise exception using errcode='22023',message='Invalid frames'; end if;
    if r->>'outcome'='cad_validated' then
        if r->>'phase'<>'validate_step' or r->'failureCode'<>'null'::jsonb or r->'readerCode'<>'null'::jsonb or r->'exception'<>'null'::jsonb or jsonb_array_length(r->'frames')<>0 then raise exception using errcode='22023',message='Invalid success evidence'; end if;
    else
        if coalesce(r->>'failureCode','') not in ('cancelled','transfer_failed','lease_expired','dispatch_failed','unsupported_entity','unsupported_format','source_units_required','unsupported_schema','invalid_parasolid','invalid_geometry','complexity_limit','timeout','worker_failed','validation_failed','conversion_failed')
           or coalesce(r->>'exception','') not in ('TypeError','ValueError','AttributeError','RuntimeError','MemoryError','OSError','ConversionError','SchemaError','ParseError','LimitExceededError','OcctConversionError','InteropError','NativeError','Standard_ConstructionError','Standard_DomainError','Standard_Failure','Standard_OutOfRange','Standard_NullObject','Standard_NoSuchObject','StdFail_NotDone') then raise exception using errcode='22023',message='Invalid failure evidence'; end if;
    end if;
    for i in 1..5 loop
        expected:=case when r->>'outcome'='cad_validated' or i+1<pg_catalog.array_position(phases,r->>'phase') then 'passed' when phases[i+1]=r->>'phase' then 'failed' else 'not_run' end;
        if r#>>array['checks',checks[i]] is distinct from expected then raise exception using errcode='22023',message='Invalid check evidence'; end if;
    end loop;
    return true;
end;
$$;
revoke all on function public.auto3d_conversion_validate_report(jsonb) from public,anon,authenticated;
grant execute on function public.auto3d_conversion_validate_report(jsonb) to service_role;

create or replace function public.auto3d_conversion_transition(
    p_owner uuid,p_job uuid,p_event text,p_revision integer default null,p_attempt uuid default null,p_data jsonb default '{}'
)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    job public.auto3d_conversion_jobs;
    was_claimed boolean:=false;
    diagnosing boolean;
    last_progress jsonb;
begin
    select * into job from public.auto3d_conversion_jobs where id=p_job and owner_id=p_owner for update;
    diagnosing:=job.purpose='diagnostic';
    last_progress:=case when diagnosing then job.diagnostic_progress else job.summary->'progress' end;
    if not found or job.state='deleted' then raise exception using errcode='PT404',message='Job unavailable'; end if;
    if p_revision is not null and job.revision<>p_revision then raise exception using errcode='PT409',message='Job changed'; end if;
    if p_event not in ('uploaded','dispatch','ack','claim','progress','complete','failure','cancel','delete','expire','retry','diagnose') then
        raise exception using errcode='22023',message='Invalid job event';
    end if;
    if p_event in ('ack','claim','progress','complete','failure') and (p_attempt is null or p_attempt is distinct from job.active_attempt) then
        raise exception using errcode='PT409',message='Attempt superseded';
    end if;
    if p_event not in ('delete','expire','cancel','retry','diagnose') and (job.expires_at<=now() or job.deadline_at<=now()) then
        raise exception using errcode='PT410',message='Job expired';
    end if;
    case p_event
    when 'uploaded' then
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conversion-capacity',0));
        if (select count(*) from public.auto3d_conversion_jobs where state in ('queued','running') and deadline_at>now())>=8 then raise exception using errcode='PT429',message='Conversion queue limit reached'; end if;
        if job.state<>'awaiting_upload' then raise exception using errcode='PT409',message='Upload already finalized'; end if;
        job.state:='queued';job.stage:='queued';
    when 'dispatch' then
        if job.state<>'queued' or (case when diagnosing then job.diagnostic_attempts else job.attempts end)>=2 or (job.dispatched_at is not null and job.dispatched_at>now()-interval '2 minutes') then
            raise exception using errcode='PT409',message='Dispatch already active';
        end if;
        job.active_attempt:=(p_data->>'attemptId')::uuid;job.token_hash:=p_data->>'tokenHash';
        if diagnosing then job.diagnostic_attempts:=job.diagnostic_attempts+1; else job.attempts:=job.attempts+1; end if;
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
                if coalesce(pg_catalog.array_position(array['download_source','read_source','build_geometry','validate_geometry','write_step','validate_step','tessellate','build_mesh','validate_mesh','upload_artifacts','finalizing'],last_progress->>'phase'),0)
                   <=pg_catalog.array_position(array['download_source','read_source','build_geometry','validate_geometry','write_step','validate_step','tessellate','build_mesh','validate_mesh','upload_artifacts','finalizing'],p_data#>>'{progress,phase}') then
                    if last_progress->>'phase' is distinct from p_data#>>'{progress,phase}'
                       or last_progress->>'total' is null
                       or (last_progress->>'total'=p_data#>>'{progress,total}' and last_progress->>'unit'=p_data#>>'{progress,unit}' and (p_data#>>'{progress,completed}')::numeric>=(last_progress->>'completed')::numeric) then
                        job.stage:=p_data->>'stage';
                        if diagnosing then job.diagnostic_progress:=p_data->'progress';
                        else job.summary:=pg_catalog.jsonb_set(job.summary,'{progress}',p_data->'progress'); end if;
                    end if;
                end if;
            elsif last_progress is null then job.stage:=p_data->>'stage'; end if;
            job.lease_until:=now()+interval '2 minutes';
        end if;
    when 'complete' then
        if job.state<>'running' or (job.lease_until is null or job.lease_until<=now()) then raise exception using errcode='PT409',message='Result publication refused'; end if;
        if diagnosing then
            perform public.auto3d_conversion_validate_report(p_data->'report');
            job.diagnostic_report:=p_data->'report';job.diagnostic_error_code:=null;
            job.state:='failed';job.stage:='failed';job.purpose:='conversion';job.active_attempt:=null;
        else
            if jsonb_typeof(p_data->'artifacts') is distinct from 'object' or jsonb_typeof(p_data->'summary') is distinct from 'object' then raise exception using errcode='22023',message='Evidence required'; end if;
            job.state:='ready';job.stage:='ready';job.artifacts:=p_data->'artifacts';job.summary:=p_data->'summary';
        end if;
        job.completed_at:=now();job.token_hash:=null;job.lease_until:=null;
    when 'failure' then
        if coalesce(p_data->>'code','') !~ '^[a-z_]{1,64}$' then raise exception using errcode='22023',message='Failure code required'; end if;
        if job.state not in ('queued','running','cancelling') then raise exception using errcode='PT409',message='Job finished'; end if;
        job.state:=case when job.state='cancelling' or p_data->>'code'='cancelled' then 'cancelled' else 'failed' end;
        if p_data ? 'report' then
            perform public.auto3d_conversion_validate_report(p_data->'report');
            if p_data#>>'{report,outcome}'<>'error_detected' or p_data#>>'{report,failureCode}'<>p_data->>'code' then raise exception using errcode='22023',message='Diagnostic mismatch'; end if;
            job.diagnostic_report:=p_data->'report';
        end if;
        if not diagnosing and p_data ? 'diagnostic' then
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
        if diagnosing then
            job.state:='failed';job.purpose:='conversion';job.active_attempt:=null;job.diagnostic_error_code:=p_data->>'code';
        else job.error_code:=p_data->>'code'; end if;
        job.stage:=job.state;job.completed_at:=now();job.token_hash:=null;job.lease_until:=null;
    when 'cancel' then
        if job.state='running' then job.state:='cancelling';job.stage:='cancelling';
        elsif job.state in ('queued','awaiting_upload') then job.state:='cancelled';job.stage:='cancelled';job.token_hash:=null;job.completed_at:=now(); end if;
        if diagnosing and job.state='cancelled' then job.state:='failed';job.stage:='failed';job.purpose:='conversion';job.diagnostic_error_code:='cancelled';job.active_attempt:=null; end if;
    when 'diagnose' then
        if job.state<>'failed' or diagnosing or job.diagnostic_attempts>=2 or job.expires_at<=now() then raise exception using errcode='PT409',message='Diagnostic unavailable'; end if;
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conversion-capacity',0));
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conversion-owner:'||p_owner::text,0));
        if (select count(*) from public.auto3d_conversion_jobs where owner_id=p_owner and state in ('awaiting_upload','queued','running','cancelling') and deadline_at>now())>=2
           or (select count(*) from public.auto3d_conversion_jobs where state in ('queued','running') and deadline_at>now())>=8 then raise exception using errcode='PT429',message='Conversion queue limit reached'; end if;
        job.state:='queued';job.stage:='queued';job.purpose:='diagnostic';job.diagnostic_report:=null;job.diagnostic_error_code:=null;job.diagnostic_progress:=null;
        job.dispatched_at:=null;job.lease_until:=null;job.token_hash:=null;job.active_attempt:=null;job.provider_call_id:=null;job.dispatch_state:='pending';
        job.deadline_at:=least(job.expires_at,now()+interval '10 minutes');
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
        job.dispatch_state:='pending';job.provider_call_id:=null;job.active_attempt:=null;
    when 'delete' then job.diagnostic_report:=null;job.diagnostic_progress:=null;job.diagnostic_error_code:=null;job.purpose:='conversion';job.state:='deleted';job.stage:='deleted';job.token_hash:=null;job.lease_until:=null;
    when 'expire' then
        if job.expires_at<=now() or (job.state in ('awaiting_upload','queued','running','cancelling') and job.deadline_at<=now()) then
            job.state:='expired';job.stage:='expired';job.token_hash:=null;job.lease_until:=null;
        elsif job.state in ('running','cancelling') and (job.lease_until is null or job.lease_until<=now()) then
            job.state:=case when job.state='cancelling' then 'cancelled' else 'failed' end;job.stage:=job.state;
            job.error_code:='lease_expired';job.token_hash:=null;job.lease_until:=null;job.completed_at:=now();
        end if;
        if diagnosing and job.state in ('expired','failed','cancelled') then
            if job.expires_at>now() then
                job.state:='failed';job.stage:='failed';job.diagnostic_error_code:=case when job.error_code='lease_expired' then 'lease_expired' else 'timeout' end;
                -- Keep the original conversion failure; diagnostic infrastructure failures are separate.
                select error_code into job.error_code from public.auto3d_conversion_jobs where id=p_job;
            else job.diagnostic_report:=null;job.diagnostic_progress:=null; end if;
            job.purpose:='conversion';job.active_attempt:=null;
        end if;
    end case;
    job.revision:=job.revision+1;job.updated_at:=now();
    update public.auto3d_conversion_jobs set state=job.state,stage=job.stage,revision=job.revision,active_attempt=job.active_attempt,
        token_hash=job.token_hash,attempts=job.attempts,dispatch_state=job.dispatch_state,dispatched_at=job.dispatched_at,
        provider_call_id=job.provider_call_id,lease_until=job.lease_until,artifacts=job.artifacts,summary=job.summary,
        purpose=job.purpose,diagnostic_attempts=job.diagnostic_attempts,diagnostic_report=job.diagnostic_report,diagnostic_error_code=job.diagnostic_error_code,diagnostic_progress=job.diagnostic_progress,
        error_code=job.error_code,updated_at=job.updated_at,completed_at=job.completed_at,deadline_at=job.deadline_at where id=p_job and owner_id=p_owner;
    return pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),'claimed',was_claimed);
end;
$$;
notify pgrst,'reload schema';
commit;
