# PR #16 reconciliation

PR #16 now incorporates current main, including the rendering fixes and Preferences Error logs. Its remaining runtime change adds R2 compatibility to the published Library archive/thumbnail and verified share archive routes, retaining legacy Supabase Storage files. Client metadata includes file size and storage provider. Personal account files continue using the separate account storage routes.

The current mandatory approved-account login, secure cookies, logout/session checks, preferences, and account administration take precedence over the feature branch's earlier parallel authentication implementation. The obsolete `/api/admin` implementation and its old admin HTML page are omitted. Account requests, approvals, revoke and password reset remain on the current account routes and obscured administrator page.

Published file keys come from server-side metadata, with a published-status filter. Share grants and download permission are checked before any R2 read. API middleware continues enforcing sign-in and account/session validity. Binary responses use private, no-store caching, with fixed MIME types and nosniff. Unknown storage providers fail closed; missing bindings and upstream failures return generic errors without exposing secrets.

The five original SQL files are preserved in `database/history/pr16/` with a mapping to their already-applied Supabase versions. No database migrations, user resets or live schema changes are performed by this reconciliation. The archive is not a migration runner or complete database bootstrap.

Future Entra identity and organization lifecycle administration remain separate work. This PR does not introduce guest access, browser database credentials, shared publishing or a second administrator system.

Validation: R2 and legacy reads, published filtering, unavailable storage, safe errors, share grant/download enforcement and metadata propagation have regression coverage. Existing login/logout, approval/revocation, private account storage and workspace suites remain release gates, along with lint, backend tests and production builds.
