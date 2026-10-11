# Share permission regression

Use a disposable PostgreSQL 17 database, never production. The bootstrap creates
synthetic roles/data; use a superuser test connection. Apply these files in order
with `psql -v ON_ERROR_STOP=1`:

1. `test/security/share-bootstrap.sql`
2. `supabase/migrations/20261005_share_links.sql`
3. `supabase/migrations/20261011195039_share_service_access_hardening.sql`
4. `test/security/share-access.sql`

The regression checks effective function and column privileges, actual metadata
and RPC denials for anon/authenticated, and service-role creation and correct/wrong
code verification. No credentials or user data are needed. Production was also
verified with effective privilege checks and read-only role-denial/verification
queries; production rows were not created by the regression.
