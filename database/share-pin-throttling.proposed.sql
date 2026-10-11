-- Proposed migration. Do NOT apply until current share RPCs and roles are reviewed.
-- Four-digit codes are a secondary factor; use rate-limited verification only.
create table if not exists auto3d_private.auto3d_share_verify_attempts (
    token uuid not null references public.auto3d_share_links(token) on delete cascade,
    actor_hash text not null check (actor_hash ~ '^[0-9a-f]{64}$'),
    window_started timestamptz not null default now(),
    failed_count integer not null default 0,
    locked_until timestamptz,
    updated_at timestamptz not null default now(),
    primary key (token, actor_hash)
);
alter table auto3d_private.auto3d_share_verify_attempts enable row level security;
revoke all on auto3d_private.auto3d_share_verify_attempts from public, anon, authenticated;
create index if not exists auto3d_share_attempt_lock_idx
    on auto3d_private.auto3d_share_verify_attempts (locked_until) where locked_until is not null;

-- Serialized attempts: same actor/share row is locked before any code comparison.
-- Max 5 failures per 15-minute window, then 30-minute lockout.
create or replace function public.auto3d_verify_share_limited (
    p_token uuid, p_code_hash text, p_actor_hash text
)
returns table (item_id uuid, allow_download boolean)
language plpgsql
security definer
set search_path = public, auto3d_private, pg_temp
as $$
declare
    attempt auto3d_private.auto3d_share_verify_attempts%rowtype;
    candidate record;
    accepted boolean;
begin
    if p_actor_hash is null or p_actor_hash !~ '^[0-9a-f]{64}$'
       or p_code_hash is not null and p_code_hash !~ '^[0-9a-f]{64}$' then
        return;
    end if;

    insert into auto3d_private.auto3d_share_verify_attempts (token, actor_hash)
    select p_token, p_actor_hash
    where exists (
        select 1 from public.auto3d_share_links s
        where s.token = p_token and (s.expires_at is null or s.expires_at > now())
    )
    on conflict do nothing;

    select * into attempt
      from auto3d_private.auto3d_share_verify_attempts
      where token = p_token and actor_hash = p_actor_hash
      for update;
    if not found or (attempt.locked_until is not null and attempt.locked_until > now()) then
        return;
    end if;

    if attempt.window_started <= now() - interval '15 minutes' then
        update auto3d_private.auto3d_share_verify_attempts
           set window_started = now(), failed_count = 0, locked_until = null, updated_at = now()
         where token = p_token and actor_hash = p_actor_hash;
        attempt.failed_count := 0;
    end if;

    select s.item_id, s.allow_download, s.code_required, c.code_hash
      into candidate
      from public.auto3d_share_links s
      join public.auto3d_library l on l.id = s.item_id and l.status = 'published'
      left join auto3d_private.auto3d_share_codes c on c.token = s.token
      where s.token = p_token and (s.expires_at is null or s.expires_at > now());

    accepted := found and (not candidate.code_required or
        (candidate.code_hash is not null and candidate.code_hash = lower(coalesce(p_code_hash, ''))));
    if not accepted then
        update auto3d_private.auto3d_share_verify_attempts
           set failed_count = attempt.failed_count + 1,
               locked_until = case when attempt.failed_count + 1 >= 5 then now() + interval '30 minutes' else null end,
               updated_at = now()
         where token = p_token and actor_hash = p_actor_hash;
        return;
    end if;

    update auto3d_private.auto3d_share_verify_attempts
      set failed_count = 0, locked_until = null, window_started = now(), updated_at = now()
      where token = p_token and actor_hash = p_actor_hash;
    item_id := candidate.item_id;
    allow_download := candidate.allow_download;
    return next;
end;
$$;

revoke all on function public.auto3d_verify_share_limited(uuid,text,text) from public, anon, authenticated;
grant execute on function public.auto3d_verify_share_limited(uuid,text,text) to service_role;
