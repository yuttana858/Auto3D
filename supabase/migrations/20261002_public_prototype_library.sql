create table public.auto3d_library (
    id uuid primary key,
    name text not null check (char_length(name) between 1 and 100),
    category text not null check (category in ('Primary products','Retail shelf','Pallets','Accessories')),
    kind text not null check (kind in ('model','session')),
    object_count integer not null check (object_count between 1 and 1000),
    archive_path text not null unique,
    thumbnail_path text not null unique,
    created_at timestamptz not null default now(),
    check (archive_path = id::text || '/session.auto3d'),
    check (thumbnail_path = id::text || '/thumbnail.png')
);
create index auto3d_library_created_at_idx on public.auto3d_library (created_at desc);
alter table public.auto3d_library enable row level security;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('auto3d-library','auto3d-library',false,67108864,array['application/octet-stream','image/png']);
create function public.auto3d_files_ready (item_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select count(*) = 2 from storage.objects
    where bucket_id = 'auto3d-library'
    and name in (item_id::text || '/session.auto3d', item_id::text || '/thumbnail.png');
$$;
revoke all on function public.auto3d_files_ready(uuid) from public;
grant execute on function public.auto3d_files_ready(uuid) to anon, authenticated;
grant select on public.auto3d_library to anon, authenticated;
grant insert on public.auto3d_library to authenticated;
revoke insert on public.auto3d_library from anon;
revoke update, delete on public.auto3d_library from anon, authenticated;
create policy "Public prototype library browsing" on public.auto3d_library
for select to anon, authenticated using (true);
create policy "Publish complete prototype saves" on public.auto3d_library
for insert to authenticated with check (public.auto3d_files_ready(id));
create policy "Upload new prototype files" on storage.objects
for insert to authenticated with check (
    bucket_id = 'auto3d-library'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(session[.]auto3d|thumbnail[.]png)$'
);
create policy "Read published prototype files" on storage.objects
for select to anon, authenticated using (
    bucket_id = 'auto3d-library'
    and exists (select 1 from public.auto3d_library as item
        where storage.objects.name = item.archive_path or storage.objects.name = item.thumbnail_path)
);
