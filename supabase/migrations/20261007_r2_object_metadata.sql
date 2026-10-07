alter table public.auto3d_library
    add column if not exists storage_provider text not null default 'supabase',
    add column if not exists archive_object_key text,
    add column if not exists thumbnail_object_key text,
    add column if not exists file_size_bytes bigint not null default 0;

alter table public.auto3d_library
    drop constraint if exists auto3d_library_storage_provider_check,
    add constraint auto3d_library_storage_provider_check check (storage_provider in ('supabase','r2')),
    drop constraint if exists auto3d_library_file_size_bytes_check,
    add constraint auto3d_library_file_size_bytes_check check (file_size_bytes >= 0);

create index if not exists auto3d_library_storage_provider_idx
on public.auto3d_library (storage_provider);
