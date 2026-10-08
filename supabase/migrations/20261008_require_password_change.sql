alter table public.auto3d_users
    add column if not exists requires_password_change boolean not null default true;
