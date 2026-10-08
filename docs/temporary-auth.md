# Temporary Auto3D login

The interim identity provider is Supabase Auth with email/password accounts created by an administrator. Microsoft Entra ID remains the intended replacement. Browser code uses the provider-neutral `AuthService`; it does not call Supabase directly or hold provider credentials/tokens.

## Setup

Production Pages Functions use the existing `SUPABASE_URL` and encrypted `SUPABASE_SECRET_KEY`. Configure preview separately if needed. Redeploy after setting secrets. No additional public API key is required for this same-origin server flow.

In Supabase **Authentication → Sign In / Providers**, enable Email authentication and disable **Allow new users to sign up**. The application exposes no signup endpoint, but disabling provider signup is necessary to prevent account creation via the direct Supabase API.

In **Authentication → Users → Add user → Create new user**, create each approved email/password account and confirm the email using the administrative option. Supply account credentials to the user through your normal secure process. Password resets are administered through Supabase for this first version; no reset email flow is implemented in Auto3D. Do not put passwords into repository files, chat, or command macros.

At implementation time, the inspected project `iesepcoxqochycckbwoh` contained zero auth users. No account was created automatically. The connected Supabase tools do not expose auth-provider settings, so the signup-disable setting must be checked in the dashboard.

## User experience

After the initial three-second logo animation, the landing screen displays email/password sign-in under the logo. It stays open until the user continues, takes a tour, or dismisses the background. A signed-in user can continue to the workspace; visitors can continue without signing in for existing device/file workflows. The header's Sign in / Account button opens the same account UI at any time.

Sign-in is separate from cloud publication. This implementation establishes account identity and session handling; the per-user R2 Library ownership/upload/organization/role/quota work remains on the feature roadmap. No Library write is enabled just because a user signs in, and no existing public catalog is presented as private.

## API and security

- `POST /api/auth/login`: JSON email/password; exchanges credentials with Supabase and verifies the resulting identity through `/auth/v1/user`.
- `GET /api/auth/session`: verifies the access cookie with the provider and returns only user ID/email. Visitors receive a null user; expired credentials receive 401.
- `POST /api/auth/refresh`: rotates provider tokens using the HTTP-only refresh cookie and verifies the resulting identity. AuthService serializes session restore within a page.
- `POST /api/auth/logout`: revokes the current refresh session and clears both browser cookies. If provider revocation fails, cookies still clear and the UI reports the failure. Other devices remain signed in.

Mutating requests require an Origin exactly matching the application origin. Cookies use the `__Host-` prefix, Secure, HttpOnly, Path=/ and SameSite=Strict, with a seven-day browser lifetime. Supabase token expiry/refresh/session configuration still applies. Passwords are cleared from the form after each attempt, and tokens are never returned in browser JSON, command results, localStorage, or portable archives. Auth requests have size/time limits and generic errors; provider rate-limit responses are preserved as 429.

No authorization is derived from user-editable metadata. This first version returns provider identity, not an application owner/organization mapping. Before enabling private Library operations, add stable application user IDs and an explicit provider-subject mapping so later Entra linking does not change ownership.

Supabase logout invalidates refresh sessions; already-issued access tokens may remain valid until expiry. This implementation clears this browser's copies. Private high-impact operations should validate current session/authorization rather than assuming logout universally invalidates bearer tokens.

## Agent interface

`auth.inspect` returns identity only. `auth.open` opens the interactive dialog and does not sign in. `auth.sign_out` performs sign-out and is marked as a mutation, so shared read-only command contexts reject it. Credentials are not accepted through commands or macros. Catalog: `website/assets/commands.json`.

## Validation

Run `npm test`, `npm run lint`, and `npm run build_website`. With `npm start` running, `node test/browser/auth.mjs` checks desktop/mobile UI, bad-credential handling, password clearing, sign-in, account inspection and sign-out using intercepted auth responses. It is a UI smoke test, not a real-user Supabase login test. A live sign-in requires an administrator-created account. `npm start` serves static files and does not execute Pages Functions; use a deployed preview or a configured Cloudflare local runtime for actual auth.

## Account requests and administrator setup

Sign-in now includes **Request an account** (name, email, reason). Requests require approval; the endpoint does not create an Auth user or accept passwords. Approved accounts are created through the server-side Supabase admin API. No email is sent automatically. The reviewer enters an initial password (at least 12 characters) and supplies it through the organization’s secure process.

The first administrator allowlist entry is `yuttana.chiaravalloti@smurfitwestrock.com`. Create that account in [Supabase Authentication → Users](https://supabase.com/dashboard/project/iesepcoxqochycckbwoh/auth/users), set its password, and confirm its email. Then sign into Auto3D and open **Preferences → Administrator → Account administration — requests and approvals**. The direct application link is `https://auto3d-5av.pages.dev/?admin=accounts`. The interface also links to Supabase user administration.

Authorization verifies the provider identity and confirmed email on each admin request, then checks the server-only `auto3d_admin_emails` allowlist. Browser metadata and user-editable provider metadata cannot grant admin access. Additional admin emails must be explicitly added through the trusted database administration process. The user cannot grant themselves admin privileges in the application.

`database/account-requests.sql` documents the applied `auto3d_access_request_review` migration. The new `auto3d_access_requests` table intentionally preserves the feature foundation’s existing `auto3d_account_requests` table and its organization-user foreign keys. Both new tables have RLS enabled with no browser privileges. The submission RPC is service-role-only and deduplicates email submissions; rate checks allow up to three stored requests per IP hash per hour. Account approvals atomically claim pending requests before calling the provider. A definitive provider rejection resets pending; ambiguous failures remain `processing`. Reconcile processing rows against Supabase Auth Users before manually completing/resetting them, to avoid duplicate creation attempts.

Agent commands: `auth.request_account`, `admin.open`, `admin.requests`, `admin.approve` (interactive), and `admin.reject`. Approval passwords are kept out of command arguments and saved macros. Existing `auth.inspect/open/sign_out` remain available.

Server configuration must use a secret (`sb_secret_…`) or legacy `service_role` key. An anon/publishable key can permit email/password sign-in but cannot read the protected admin tables. Account database requests now reject that misconfiguration explicitly, and Preferences shows the service error instead of silently hiding administration.
