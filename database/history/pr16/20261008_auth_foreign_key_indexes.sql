create index if not exists auto3d_account_requests_reviewed_by_idx
    on public.auto3d_account_requests (reviewed_by);

create index if not exists auto3d_account_requests_created_user_idx
    on public.auto3d_account_requests (created_user_id);

create index if not exists auto3d_audit_events_actor_idx
    on public.auto3d_audit_events (actor_user_id);

create index if not exists auto3d_audit_events_org_idx
    on public.auto3d_audit_events (organization_id);

