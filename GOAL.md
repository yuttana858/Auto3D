# Auto3D backend direction

Auto3D runs on Cloudflare Pages with private Cloudflare R2 model files and Supabase PostgreSQL metadata. Temporary Supabase email/password sign-in is mandatory for approved accounts; administrators create or approve accounts. Microsoft Entra ID is the future identity provider. Keep the browser behind the same-origin API contract so identity can change without rewriting the workspace.

Current runtime includes account requests/approval, administrator revoke/reset controls, persistent secure sessions with explicit logout, personal Library files and synchronized preferences. Read `docs/temporary-auth.md` and `docs/account-storage.md` for the implemented flows. Published Library/share content is separate from personal files; PR #16 provides R2 and legacy Storage read compatibility. Shared publishing remains disabled pending corporate authorization.

Security requirements: verify identity, approval and session status server-side; keep database secrets and R2 credentials out of browser code; enforce ownership and share permissions; keep authenticated file responses private and uncached; preserve read-only sessions; make remote writes explicit user actions. Maintain stable user IDs when introducing Entra identity mappings.

Next work includes Entra integration, organization lifecycle/role administration where required, corporate retention and classification requirements, and representative format/performance validation. Azure runtime or storage migration is a separate future infrastructure decision; R2 remains the active object storage direction.

Historical PR #16 SQL is recorded in `database/history/pr16/`. These records are already applied and must not be replayed as a fresh database setup. Preserve current account/session migrations and production users when developing new schema changes.

## Sequenced roadmap (after texture/material fidelity)

1. **Current priority — material fidelity for RSC and CAD textures:** correct bump/normal selection, spot-gloss/roughness authoring, reflective and metallic controls, UV mapping, physically plausible generated maps, import/export and undo consistency. Add reference assets and visual/regression tests before release.
2. Complete organization lifecycle, membership, and role management on top of the existing mandatory login system.
3. Extend private R2 storage for 100 MB+ CAD/texture assets with multipart/resumable uploads, verified quotas and cancellation cleanup.
4. Enable authorized shared-Library publishing, sharing and rights with server-enforced ownership.
5. Finish SMTP recovery delivery, security hardening and real-account/large-file production testing.
6. Integrate Microsoft Entra ID with explicit verified identity linking while preserving stable account IDs.

Do not replace existing RSC/CAD color, roughness, normal, bump, or UV data merely to fill an empty generated channel; generated maps should complement the source material and must not invent metallic response for paper or board.
