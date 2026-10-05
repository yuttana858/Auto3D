create table if not exists public.auto3d_share_links (
    token uuid primary key,
    item_id uuid not null references public.auto3d_library(id) on delete cascade,
    allow_download boolean not null default false,
    code_hash text,
    code_required boolean not null default false,
    created_at timestamptz not null default now(),
    expires_at timestamptz,
    constraint auto3d_share_code_check check (
        (code_required = (code_hash is not null))
        and (code_hash is null or code_hash ~ '^[0-9a-f]{64}$')
    )
);

alter table public.auto3d_share_links enable row level security;

revoke all on public.auto3d_share_links from anon, authenticated;
grant select (token, item_id, allow_download, code_required, created_at, expires_at) on public.auto3d_share_links to anon, authenticated;
grant insert (token, item_id, allow_download, code_hash, code_required, expires_at) on public.auto3d_share_links to anon, authenticated;

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

create or replace function public.auto3d_verify_share (p_token uuid, p_code_hash text default null)
returns table (item_id uuid, allow_download boolean)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
    select share.item_id, share.allow_download
    from public.auto3d_share_links share
    join public.auto3d_library item on item.id = share.item_id
    where share.token = p_token
      and item.status = 'published'
      and (share.expires_at is null or share.expires_at > now())
      and (
          share.code_required = false
          or share.code_hash = lower(coalesce(p_code_hash, ''))
      )
    limit 1;
$$;

revoke all on function public.auto3d_verify_share(uuid, text) from public;
grant execute on function public.auto3d_verify_share(uuid, text) to anon, authenticated;
