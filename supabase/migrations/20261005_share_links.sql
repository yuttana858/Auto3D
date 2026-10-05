create table if not exists public.auto3d_share_links (
    token uuid primary key,
    item_id uuid not null references public.auto3d_library(id) on delete cascade,
    allow_download boolean not null default false,
    code_required boolean not null default false,
    created_at timestamptz not null default now(),
    expires_at timestamptz
);

alter table public.auto3d_share_links enable row level security;

revoke all on public.auto3d_share_links from anon, authenticated;
grant select (token, item_id, allow_download, code_required, created_at, expires_at) on public.auto3d_share_links to anon, authenticated;
grant insert (token, item_id, allow_download, code_required, expires_at) on public.auto3d_share_links to anon, authenticated;

drop policy if exists "Read active share link metadata" on public.auto3d_share_links;
create policy "Read active share link metadata"
on public.auto3d_share_links
for select
to anon, authenticated
using (expires_at is null or expires_at > now());

drop policy if exists "Create links for published library items" on public.auto3d_share_links;
create policy "Create links for published library items"
on public.auto3d_share_links
for insert
to anon, authenticated
with check (
    (expires_at is null or expires_at > now())
    and exists (
        select 1
        from public.auto3d_library item
        where item.id = item_id
          and item.status = 'published'
    )
);

create index if not exists auto3d_share_links_item_id_idx on public.auto3d_share_links (item_id);
create index if not exists auto3d_share_links_created_at_idx on public.auto3d_share_links (created_at desc);

create table if not exists auto3d_private.auto3d_share_codes (
    token uuid primary key references public.auto3d_share_links(token) on delete cascade,
    code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$')
);

alter table auto3d_private.auto3d_share_codes enable row level security;

grant usage on schema auto3d_private to anon, authenticated;
grant select, insert on auto3d_private.auto3d_share_codes to anon, authenticated;

drop policy if exists "Share code insert" on auto3d_private.auto3d_share_codes;
create policy "Share code insert"
on auto3d_private.auto3d_share_codes
for insert
to anon, authenticated
with check (
    exists (
        select 1 from public.auto3d_share_links share
        where share.token = token and share.code_required = true
    )
);

drop policy if exists "Share code verify" on auto3d_private.auto3d_share_codes;
create policy "Share code verify"
on auto3d_private.auto3d_share_codes
for select
to anon, authenticated
using (
    exists (
        select 1 from public.auto3d_share_links share
        where share.token = token
          and (share.expires_at is null or share.expires_at > now())
    )
);

create or replace function public.auto3d_create_share (
    p_token uuid,
    p_item_id uuid,
    p_allow_download boolean,
    p_code_hash text default null,
    p_code_required boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public, auto3d_private, pg_temp
as $$
begin
    if p_code_required <> (p_code_hash is not null) then
        raise exception 'Invalid share code configuration.';
    end if;
    if p_code_hash is not null and p_code_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'Invalid share code hash.';
    end if;

    insert into public.auto3d_share_links (token, item_id, allow_download, code_required)
    values (p_token, p_item_id, p_allow_download, p_code_required);

    if p_code_required then
        insert into auto3d_private.auto3d_share_codes (token, code_hash)
        values (p_token, lower(p_code_hash));
    end if;

    return p_token;
end;
$$;

create or replace function public.auto3d_verify_share (p_token uuid, p_code_hash text default null)
returns table (item_id uuid, allow_download boolean)
language sql
security invoker
set search_path = public, auto3d_private, pg_temp
stable
as $$
    select share.item_id, share.allow_download
    from public.auto3d_share_links share
    left join auto3d_private.auto3d_share_codes code on code.token = share.token
    join public.auto3d_library item on item.id = share.item_id
    where share.token = p_token
      and item.status = 'published'
      and (share.expires_at is null or share.expires_at > now())
      and (
          share.code_required = false
          or code.code_hash = lower(coalesce(p_code_hash, ''))
      )
    limit 1;
$$;

revoke all on function public.auto3d_create_share(uuid, uuid, boolean, text, boolean) from public;
revoke all on function public.auto3d_verify_share(uuid, text) from public;
grant execute on function public.auto3d_create_share(uuid, uuid, boolean, text, boolean) to anon, authenticated;
grant execute on function public.auto3d_verify_share(uuid, text) to anon, authenticated;
