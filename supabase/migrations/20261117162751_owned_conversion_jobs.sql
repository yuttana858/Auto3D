begin;

create table public.auto3d_conversion_jobs (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    request_key uuid not null,
    source_name text not null check (length(source_name) between 1 and 200),
    source_extension text not null check (source_extension in ('x_t','x_b','step','stp')),
    source_bytes bigint not null check (source_bytes between 1 and 52428800),
    source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
    source_unit text check (source_unit in ('mm','cm','m','in','ft')),
    quality text not null check (quality in ('standard','fine')),
    origin jsonb not null check (jsonb_typeof(origin)='object' and octet_length(origin::text)<1024),
    state text not null default 'awaiting_upload' check (state in ('awaiting_upload','queued','running','cancelling','cancelled','ready','failed','expired','deleted')),
    stage text not null default 'awaiting_upload',
    revision integer not null default 1,
    active_attempt uuid,
    token_hash text check (token_hash ~ '^[a-f0-9]{64}$'),
    attempts integer not null default 0 check (attempts between 0 and 2),
    dispatch_state text not null default 'pending' check (dispatch_state in ('pending','sent')),
    dispatched_at timestamptz,
    provider_call_id text,
    lease_until timestamptz,
    artifacts jsonb not null default '{}',
    summary jsonb not null default '{}' check (octet_length(summary::text)<=16384),
    error_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deadline_at timestamptz not null default now()+interval '30 minutes',
    expires_at timestamptz not null default now()+interval '24 hours',
    completed_at timestamptz,
    unique(owner_id,request_key),
    check ((source_extension in ('step','stp') and source_unit is null) or (source_extension in ('x_t','x_b') and source_unit is not null))
);
alter table public.auto3d_conversion_jobs enable row level security;
revoke all on public.auto3d_conversion_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.auto3d_conversion_jobs to service_role;
create index auto3d_conversion_owner_history on public.auto3d_conversion_jobs(owner_id,created_at desc,id);
create index auto3d_conversion_pending on public.auto3d_conversion_jobs(updated_at) where state in ('queued','running','cancelling','awaiting_upload');
create index auto3d_conversion_expiry on public.auto3d_conversion_jobs(expires_at) where state<>'deleted';

create function public.auto3d_conversion_create(p_owner uuid,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
    existing public.auto3d_conversion_jobs;
    result public.auto3d_conversion_jobs;
begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conversion-capacity',0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conversion-owner:'||p_owner::text,0));
    select * into existing from public.auto3d_conversion_jobs where owner_id=p_owner and request_key=(p_request->>'requestKey')::uuid;
    if found then
        if existing.source_name<>p_request->>'sourceName' or existing.source_sha256<>p_request->>'sourceSha256' or existing.source_bytes<>(p_request->>'sourceBytes')::bigint
           or existing.source_extension<>p_request->>'extension' or existing.source_unit is distinct from p_request->>'sourceUnit'
           or existing.quality<>p_request->>'quality' or existing.origin<>p_request->'origin' then
            raise exception using errcode='PT409',message='Submission key was already used';
        end if;
        return pg_catalog.to_jsonb(existing);
    end if;
    if (select count(*) from public.auto3d_conversion_jobs where owner_id=p_owner and created_at>now()-interval '1 hour')>=20
       or (select count(*) from public.auto3d_conversion_jobs where owner_id=p_owner and state in ('awaiting_upload','queued','running','cancelling') and deadline_at>now())>=2
       or (select count(*) from public.auto3d_conversion_jobs where state in ('queued','running') and deadline_at>now())>=8 then
        raise exception using errcode='PT429',message='Conversion queue limit reached';
    end if;
    insert into public.auto3d_conversion_jobs(owner_id,request_key,source_name,source_extension,source_bytes,source_sha256,source_unit,quality,origin)
        values(p_owner,(p_request->>'requestKey')::uuid,p_request->>'sourceName',p_request->>'extension',(p_request->>'sourceBytes')::bigint,
            p_request->>'sourceSha256',p_request->>'sourceUnit',p_request->>'quality',p_request->'origin') returning * into result;
    return pg_catalog.to_jsonb(result);
end;
$$;

create function public.auto3d_conversion_transition(
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
    if p_event not in ('delete','expire','cancel') and (job.expires_at<=now() or job.deadline_at<=now()) then
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
            job.stage:=p_data->>'stage';job.lease_until:=now()+interval '2 minutes';
        end if;
    when 'complete' then
        if job.state<>'running' or (job.lease_until is null or job.lease_until<=now()) then raise exception using errcode='PT409',message='Result publication refused'; end if;
        if jsonb_typeof(p_data->'artifacts') is distinct from 'object' or jsonb_typeof(p_data->'summary') is distinct from 'object' then raise exception using errcode='22023',message='Evidence required'; end if;
        job.state:='ready';job.stage:='ready';job.artifacts:=p_data->'artifacts';job.summary:=p_data->'summary';job.completed_at:=now();job.token_hash:=null;job.lease_until:=null;
    when 'failure' then
        if coalesce(p_data->>'code','') !~ '^[a-z_]{1,64}$' then raise exception using errcode='22023',message='Failure code required'; end if;
        if job.state not in ('queued','running','cancelling') then raise exception using errcode='PT409',message='Job finished'; end if;
        job.state:=case when job.state='cancelling' or p_data->>'code'='cancelled' then 'cancelled' else 'failed' end;
        job.stage:=job.state;job.error_code:=p_data->>'code';job.completed_at:=now();job.token_hash:=null;job.lease_until:=null;
    when 'cancel' then
        if job.state='running' then job.state:='cancelling';job.stage:='cancelling';
        elsif job.state in ('queued','awaiting_upload') then job.state:='cancelled';job.stage:='cancelled';job.token_hash:=null;job.completed_at:=now(); end if;
    when 'retry' then
        if job.state<>'failed' or job.attempts>=2 or job.error_code not in ('transfer_failed','lease_expired','dispatch_failed') then
            raise exception using errcode='PT409',message='Retry unavailable';
        end if;
        job.state:='queued';job.stage:='queued';job.dispatched_at:=null;job.error_code:=null;job.lease_until:=null;job.token_hash:=null;
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
        error_code=job.error_code,updated_at=job.updated_at,completed_at=job.completed_at where id=p_job and owner_id=p_owner;
    return pg_catalog.jsonb_build_object('job',pg_catalog.to_jsonb(job),'claimed',was_claimed);
end;
$$;

revoke all on function public.auto3d_conversion_create(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.auto3d_conversion_transition(uuid,uuid,text,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.auto3d_conversion_create(uuid,jsonb) to service_role;
grant execute on function public.auto3d_conversion_transition(uuid,uuid,text,integer,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
