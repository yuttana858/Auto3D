# Auto3D backend direction

Auto3D runs on Cloudflare Pages with private Cloudflare R2 model files and Supabase PostgreSQL metadata. Temporary Supabase email/password sign-in is mandatory for approved accounts; administrators create or approve accounts. Microsoft Entra ID is the future identity provider. Keep the browser behind the same-origin API contract so identity can change without rewriting the workspace.

Current runtime includes account requests/approval, administrator revoke/reset controls, persistent secure sessions with explicit logout, personal Library files and synchronized preferences. Read `docs/temporary-auth.md` and `docs/account-storage.md` for the implemented flows. Published Library/share content is separate from personal files; PR #16 provides R2 and legacy Storage read compatibility. Shared publishing remains disabled pending corporate authorization.

Security requirements: verify identity, approval and session status server-side; keep database secrets and R2 credentials out of browser code; enforce ownership and share permissions; keep authenticated file responses private and uncached; preserve read-only sessions; make remote writes explicit user actions. Maintain stable user IDs when introducing Entra identity mappings.

Next work includes Entra integration, organization lifecycle/role administration where required, corporate retention and classification requirements, and representative format/performance validation. Azure runtime or storage migration is a separate future infrastructure decision; R2 remains the active object storage direction.

Historical PR #16 SQL is recorded in `database/history/pr16/`. These records are already applied and must not be replayed as a fresh database setup. Preserve current account/session migrations and production users when developing new schema changes.

## Branded external mini-viewer and QR sharing

- Build branded `/mini.html?view=<share-token>` using the existing read-only Auto3D viewer, with link copy and QR generation in the browser. The QR stores a short share URL, never a raw R2 URL.
- Current staged mini-viewer intentionally inherits mandatory login and current share authorization. It is NOT yet anonymous/external sharing.
- For approved corporate sharing, use short-lived revocable bearer capabilities with hashed-at-rest tokens, expiry, audience scope, access code or stronger authentication, viewer-only and separate download permissions, server-side publication checks and R2 reads through the app API. Never use model UUID alone as authorization.
- Add a public-capability / guest-only middleware carveout only after explicit authorization, rate limiting, abuse controls, audit logs and revocation tests. Existing account-private Library remains inaccessible from public tokens.
- Preserve scene materials, HDRI and camera in external view; provide share thumbnail, brand logo, title, fullscreen, loading/error states and mobile sizing.
- Generate and download SVG/PNG QR with local or vetted bundled code; avoid sending capability URLs to a third-party QR-generating service.
- Review QR library choices: `qrcode` (node-qrcode, browser/server support), `qr-code-styling` (branded styling), `qrcodejs` (simple browser implementation). Pin and vendor or bundle any selected dependency with its license, run license/security checks.
- Gate eventual production publication behind corporate content classification, author consent and tested withdrawal semantics.
