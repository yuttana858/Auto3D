create unique index if not exists auto3d_users_email_lower_uidx
    on public.auto3d_users (lower(email));

create index if not exists auto3d_members_user_idx
    on public.auto3d_organization_members (user_id, status);

create index if not exists auto3d_members_org_role_idx
    on public.auto3d_organization_members (organization_id, role, status);

create index if not exists auto3d_identities_user_idx
    on public.auto3d_user_identities (user_id);

