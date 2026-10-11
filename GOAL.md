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

## Current priority: physically connected corrugated CAD engineering

1. Catalog board constructions, liner/medium grades, flute orientation, FEFCO design references and test standards as provenance-tagged engineering data (reference dimensions are not manufacturing tolerances).
2. Implement a common dieline graph: panels and flaps as faces; scores as shared, continuous hinge edges; cuts as free boundaries; slots, glue seams and artwork registration as explicit entities.
3. Model material as outside liner + anisotropic fluted medium + inside liner (and intermediate liners for multiwall). Flute pitch, height, phase and axis are sheet-level directional properties. End-grain at cuts follows the real medium wave geometry, not a generic edge texture.
4. Fold around score-centerline/neutral-axis with thickness compensation, configurable score crush and bend radius. Adjacent panels share hinge vertices with no gaps or duplicated inside/outside faces. Validate outside/inside liner continuity and orientation at every angle.
5. Render cut edges showing actual layers and wave cross-sections. Preserve outside artwork registration over panels/flaps and through folds; only raw substrate patterns may tile/step-repeat by default. Never generate repeated printed artwork.
6. Distinguish visually realistic crease deformation from predictive mechanics. Calibrate score stiffness, springback, local crushing and allowable fold angles against measured board grades before presenting physical predictions.
7. Preserve imported CAD, dieline, artwork, per-layer material and fold definitions through session save/open and exports; add edge-on geometry, repeated-fold, print continuity and material mass tests.

The current texture/material PR #32 is a first rendering correction, not an implementation of the hinge or physical layered board system.
