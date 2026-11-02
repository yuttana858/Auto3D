-- One private AI workspace pointer per verified account. Model bytes remain in
-- owner-prefixed object storage and are never stored in public metadata.
create table public.auto3d_ai_workspaces (
    user_id uuid primary key references auth.users(id) on delete cascade,
    revision bigint not null default 0 check (revision >= 0),
    archive_key text,
    file_size bigint not null default 0 check (file_size between 0 and 33554432),
    updated_at timestamptz not null default now(),
    check ((archive_key is null and file_size = 0 and revision = 0) or
           (archive_key is not null and file_size > 0 and revision > 0))
);
alter table public.auto3d_ai_workspaces enable row level security;
-- Browser roles cannot access this table directly; the authenticated API is
-- responsible for enforcing the owner filter and archive-key prefix.
revoke all on public.auto3d_ai_workspaces from public, anon, authenticated;
grant select, insert, update, delete on public.auto3d_ai_workspaces to service_role;

-- A shared Meshy account must not make one Auto3D user's task IDs visible to
-- another user. Existing provider tasks are deliberately not auto-claimed.
create table public.auto3d_ai_tasks (
    task_id text primary key check (task_id ~ '^[A-Za-z0-9_-]{1,200}$'),
    user_id uuid not null references auth.users(id) on delete cascade,
    route text not null check (route in ('text-to-3d', 'image-to-3d', 'text-to-image', 'retexture', 'rigging', 'animations')),
    created_at timestamptz not null default now()
);
create index auto3d_ai_tasks_owner_route on public.auto3d_ai_tasks (user_id, route, created_at desc);
alter table public.auto3d_ai_tasks enable row level security;
revoke all on public.auto3d_ai_tasks from public, anon, authenticated;
grant select, insert, update, delete on public.auto3d_ai_tasks to service_role;
