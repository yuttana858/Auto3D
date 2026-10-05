alter table public.auto3d_library
    add column if not exists created_by text,
    add column if not exists version integer not null default 1,
    add column if not exists supersedes_id uuid references public.auto3d_library(id),
    add column if not exists status text not null default 'published';

alter table public.auto3d_library
    drop constraint if exists auto3d_library_version_check,
    add constraint auto3d_library_version_check check (version >= 1),
    drop constraint if exists auto3d_library_status_check,
    add constraint auto3d_library_status_check check (status in ('published','archived'));

create index if not exists auto3d_library_status_created_at_idx
on public.auto3d_library (status, created_at desc);

alter policy "Public prototype library browsing" on public.auto3d_library
using (status = 'published');
