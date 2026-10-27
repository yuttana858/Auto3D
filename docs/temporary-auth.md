# Temporary Auto3D login

The interim identity provider is Supabase Auth with email/password accounts created by an administrator. Microsoft Entra ID remains the intended replacement. Browser code uses the provider-neutral `AuthService`; it does not call Supabase directly or hold provider credentials/tokens.

## Setup

Production Pages Functions use the existing `SUPABASE_URL` and encrypted `SUPABASE_SECRET_KEY`. Configure preview separately if needed. Redeploy after setting secrets. No additional public API key is required for this same-origin server flow.

In Supabase **Authentication → Sign In / Providers**, enable Email authentication and disable **Allow new users to sign up**. The application exposes no signup endpoint, but disabling provider signup is necessary to prevent account creation via the direct Supabase API.

In **Authentication → Users → Add user → Create new user**, create each approved email/password account and confirm the email using the administrative option. Supply account credentials to the user through your normal secure process. Auto3D now has an approved-account recovery flow; see the SMTP delivery status below. Until delivery is configured, administrators handle resets through Supabase. Do not put passwords into repository files, chat, or command macros.

At implementation time, the inspected project `iesepcoxqochycckbwoh` contained zero auth users. No account was created automatically. The connected Supabase tools do not expose auth-provider settings, so the signup-disable setting must be checked in the dashboard.

## User experience

After the initial three-second logo animation, the landing screen displays email/password sign-in under the logo. It stays open until the user continues, takes a tour, or dismisses the background. A signed-in user can continue to the workspace; visitors can continue without signing in for existing device/file workflows. The header's Sign in / Account button opens the same account UI at any time.

Sign-in is separate from cloud publication. This implementation establishes account identity and session handling; the per-user R2 Library ownership/upload/organization/role/quota work remains on the feature roadmap. No Library write is enabled just because a user signs in, and no existing public catalog is presented as private.

## API and security

- `POST /api/auth/login`: JSON email/password; exchanges credentials with Supabase and verifies the resulting identity through `/auth/v1/user`.
- `GET /api/auth/session`: verifies the access cookie with the provider and returns user ID/email and optional display name. Visitors receive a null user; expired credentials receive 401.
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

The first administrator allowlist entry is `yuttana.chiaravalloti@smurfitwestrock.com`. Create that account in [Supabase Authentication → Users](https://supabase.com/dashboard/project/iesepcoxqochycckbwoh/auth/users), set its password, and confirm its email. Then sign into Auto3D and open **Preferences → Administrator → Account administration — requests and approvals**. The direct application link is `https://auto3d-5av.pages.dev/?console=desk-8b4f2d71c6`. The interface also links to Supabase user administration.

Authorization verifies the provider identity and confirmed email on each admin request, then checks the server-only `auto3d_admin_emails` allowlist. Browser metadata and user-editable provider metadata cannot grant admin access. Additional admin emails must be explicitly added through the trusted database administration process. The user cannot grant themselves admin privileges in the application.

`database/account-requests.sql` documents the applied `auto3d_access_request_review` migration. The new `auto3d_access_requests` table intentionally preserves the feature foundation’s existing `auto3d_account_requests` table and its organization-user foreign keys. Both new tables have RLS enabled with no browser privileges. The submission RPC is service-role-only and deduplicates email submissions; rate checks allow up to three stored requests per IP hash per hour. Account approvals atomically claim pending requests before calling the provider. A definitive provider rejection resets pending; ambiguous failures remain `processing`. Reconcile processing rows against Supabase Auth Users before manually completing/resetting them, to avoid duplicate creation attempts.

Agent commands: `auth.request_account`, `admin.open`, `admin.requests`, `admin.approve` (interactive), and `admin.reject`. Approval passwords are kept out of command arguments and saved macros. Existing `auth.inspect/open/sign_out` remain available.

Server configuration must use a secret (`sb_secret_…`) or legacy `service_role` key. An anon/publishable key can permit email/password sign-in but cannot read the protected admin tables. Account database requests now reject that misconfiguration explicitly, and Preferences shows the service error instead of silently hiding administration.

## Mandatory login and persistent sessions

The workspace now requires login. There is no guest Continue button or splash/backdrop/Escape bypass. Saved Secure/HttpOnly/SameSite cookies are restored through `/api/auth/session` (and refresh if needed), so closing a tab retains sign-in while the server session remains valid. Cookie persistence is seven days; expired or revoked sessions require signing in again.

`InstallAuthGate` locks all workspace controls and closes active dialogs on logout/session rejection. Reauthentication reloads the workspace before exposing it again. Agent commands also enforce the gate. `functions/api/_middleware.js` protects Library, shares, AI, environment and knowledge APIs, admin routes, and readiness; only Auth routes and submitting account requests are public. Shared views require login. The root middleware protects static model/archive files and embedded viewers; login assets remain accessible.

Every verified access token is checked against its still-active Supabase `auth.sessions` row via the service-only, SECURITY INVOKER `auto3d_session_active` RPC. The migration `database/session-gate.sql` grants the server only the session ID/user ID columns and grants no public RPC execution. This prevents a signed access token from remaining usable after its session is revoked.

Logout locks immediately, notifies other tabs using a non-secret local logout marker, and calls provider logout to revoke the current session and clear token cookies. A persistent HttpOnly logout cookie also blocks protected routes and refresh if an earlier refresh response writes stale tokens. Only an explicit successful password login clears that cookie; refresh responses cannot clear it. Browser restoration cannot override logout, including a logout request that fails offline. The local marker contains no tokens or credentials. `test/browser/login-gate.mjs` covers saved-cookie reopening, cross-tab logout, click/Escape bypass attempts, failed logout, and explicit reauthentication.

## Recovery and account navigation

Login has an accessible Show/Hide password eye control and Forgot Password. `POST /api/auth/recover` accepts only email, returns a generic response, hashes identifiers for cooldown/rate limits, and sends a Supabase recovery email only when the server-only eligibility RPC confirms an existing, email-confirmed, non-banned approved user or allowlisted administrator. Requests never create accounts. The recovery redirect is fixed to the application origin `/?password=recovery`; browser-provided redirects are rejected.

`CaptureRecovery` removes recovery fragments (including refresh tokens) from the address bar before loading the workspace. The access token is retained only in memory for the reset form. `POST /api/auth/reset-password` verifies the provider identity, active server session and approval before updating the password. On success it revokes sessions and sets the logout tombstone; the user then signs in with the new password. Recovery does not unlock the workspace. Expired/incomplete links display an error and require another request. `auth.recover` is available to agents without collecting a password.

Automatic recovery email delivery is pending authorized SMTP setup. Temporary help contact: `yuttana.chiaravalloti@smurfitkappa.com`. That address is a contact, not an SMTP credential or a new admin grant. Requested eventual sender: `auto3d@smurfitwestrock.com`; changing a sender address does not authorize sending from its domain. Supabase default mail is restricted to permitted recipients and is not sufficient for arbitrary approved users.

To enable production delivery, configure IT-approved custom SMTP in Supabase Authentication → Email (sender name Auto3D; sender address authorized by the provider), and Authentication → URL Configuration: Site URL `https://auto3d-5av.pages.dev`, allowed redirect `https://auto3d-5av.pages.dev/?password=recovery`. Test a full received-link/password-reset/sign-in round trip with an approved user. Never paste SMTP passwords, recovery links or JWTs into chat/logs. No live recovery email was sent during development.

The account header shows the user's name, using verified provider identity for display only; authorization remains server-side. Full screen is the final header button. Model Data starts collapsed on desktop/mobile, and its tool strip sits below the panel toggle. Account administration uses `?console=desk-8b4f2d71c6` and `/api/accounts/desk-8b4f2d71c6`. The previous `?admin=accounts` trigger is removed and `/api/accounts/admin` returns not found. The opaque route remains protected by verified session and admin allowlist checks; it is not an authorization mechanism.

See `docs/account-storage.md` for automatic account initialization, preference synchronization, private R2 Library and per-user device recovery.

## Administrator user controls

The verified admin console now lists existing accounts with Revoke/Restore access and interactive Reset password. Password resets set a new password directly and clear the input; they do not rely on SMTP. Communicate new passwords through the organization's secure process. Agent admin.reset_password opens the form and never accepts passwords. admin.users/revoke/restore share the same AccountAdmin service as the UI.

Apply database/admin-controls.sql (deployed as administrator_account_access_controls). auto3d_account_controls is RLS-enabled, has no public/client grants, and stores only disabled state, a session cutoff, actor and timestamp. auto3d_session_active now requires enabled account state and a session created after the cutoff. Revoke updates this guard before banning the provider account; reset advances the cutoff before updating the provider password. If the provider operation is ambiguous, old app sessions stay denied and the interface asks the admin to retry. Restore preserves the cutoff so old tokens cannot regain access. Existing administrator allowlist entries and the current admin cannot be revoked through this interface. Files and preferences remain owned and are not deleted.

Admin endpoints themselves verify active sessions and the logout tombstone in addition to confirmed identity and the database allowlist. User listing is paginated and strips provider credentials, token data and arbitrary metadata. Authorization never uses a user-editable name or role. Provider ban alone is insufficient for strict session invalidation: see [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data) and [administrator password updates](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).

Unlocked clients recheck their session every 30 seconds while visible and when focus/visibility returns. A revoked/reset session locks the workspace after verification; all protected API requests enforce the database guard immediately. A transient network failure during background verification keeps local work available but cannot authorize server requests. An unchanged identity does not close dialogs or reload preferences. Explicit logout still locks immediately and cannot be undone by background verification.

## Deferred free SMTP option (0.38.0)

The user chose administrator-assisted password reset on 2026-10-27 because no owned sending domain is available. Login Forgot Password explains that method and does not issue a recovery request. Existing email reset routes remain for future use. No email-provider setup is required now.

Resend supports Supabase custom SMTP; its free transactional tier is a candidate for low-volume recovery mail. Confirm current limits in [Resend pricing](https://resend.com/pricing) before account setup. It needs a verified sending domain; the application’s shared `pages.dev` hostname is not an owned email-sending domain. Do not use the employer’s domain without its DNS/email administrator’s approval. Supabase built-in delivery only permits project team members, so it is not a general free fallback for approved application users.

1. Create/access the provider account and verify an owned sender domain using the provider's DNS records. The sender may be a dedicated subdomain to isolate app mail.
2. In Supabase project `iesepcoxqochycckbwoh`, Authentication → Emails → SMTP settings: enable custom SMTP, host `smtp.resend.com`, port `465`, username `resend`, password = the provider API key, sender name `Auto3D`, sender address on that verified domain. Enter the key directly in secure settings; never in chat, source or browser configuration. Use the provider's current SMTP documentation if these settings change.
3. Set Site URL `https://auto3d-5av.pages.dev` and allow the exact recovery redirect `https://auto3d-5av.pages.dev/?password=recovery`. Disable email link tracking so single-use recovery links are not rewritten.
4. Keep existing app cooldowns and Supabase email rate limits within the provider's free quota.
5. With an approved test user, explicitly request one recovery email and verify receipt, link expiry handling, password update, revoked old sessions and new-password sign-in. Browser mocks do not establish delivery.

Provider account, verified sender domain and secure credentials remain required. This documents a concrete free-service setup; it does not claim it is active. References: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend + Supabase](https://resend.com/docs/send-with-supabase-smtp).
