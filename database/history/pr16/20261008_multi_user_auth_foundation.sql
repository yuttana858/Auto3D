create table if not exists public.auto3d_organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 120),
    slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
    status text not null default 'active' check (status in ('active','disabled')),
    storage_quota_bytes bigint not null default 536870912000 check (storage_quota_bytes >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.auto3d_users (
    id uuid primary key default gen_random_uuid(),
    auth_user_id uuid unique references auth.users(id) on delete set null,
    email text not null unique,
    display_name text,
    status text not null default 'pending' check (status in ('pending','active','disabled','deleted')),
    is_platform_admin boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.auto3d_user_identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.auto3d_users(id) on delete cascade,
    provider text not null,
    provider_tenant_id text not null default '',
    provider_subject_id text not null,
    provider_email text,
    created_at timestamptz not null default now(),
    unique (provider, provider_tenant_id, provider_subject_id)
);

create table if not exists public.auto3d_organization_members (
    organization_id uuid not null references public.auto3d_organizations(id) on delete cascade,
    user_id uuid not null references public.auto3d_users(id) on delete cascade,
    role text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
    status text not null default 'active' check (status in ('active','suspended')),
    joined_at timestamptz not null default now(),
    primary key (organization_id, user_id)
);

create table if not exists public.auto3d_account_requests (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    display_name text,
    organization_name text,
    message text,
    status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
    reviewed_by uuid references public.auto3d_users(id),
    reviewed_at timestamptz,
    created_user_id uuid references public.auto3d_users(id),
    created_at timestamptz not null default now()
);

create unique index if not exists auto3d_one_pending_request_per_email
    on public.auto3d_account_requests (lower(email))
    where status = 'pending';

create table if not exists public.auto3d_audit_events (
    id bigint generated always as identity primary key,
    actor_user_id uuid references public.auto3d_users(id),
    organization_id uuid references public.auto3d_organizations(id),
    action text not null,
    resource_type text,
    resource_id text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.auto3d_organizations enable row level security;
alter table public.auto3d_users enable row level security;
alter table public.auto3d_user_identities enable row level security;
alter table public.auto3d_organization_members enable row level security;
alter table public.auto3d_account_requests enable row level security;
alter table public.auto3d_audit_events enable row level security;

revoke all on public.auto3d_organizations from anon, authenticated;
revoke all on public.auto3d_users from anon, authenticated;
revoke all on public.auto3d_user_identities from anon, authenticated;
revoke all on public.auto3d_organization_members from anon, authenticated;
revoke all on public.auto3d_account_requests from anon, authenticated;
revoke all on public.auto3d_audit_events from anon, authenticated;

create index if not exists auto3d_account_requests_status_created_idx
    on public.auto3d_account_requests (status, created_at desc);
create index if not exists auto3d_users_status_email_idx
    on public.auto3d_users (status, email);
create index if not exists auto3d_audit_events_created_idx
    on public.auto3d_audit_events (created_at desc);

