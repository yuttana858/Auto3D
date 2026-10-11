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

## Materials database / CAD acceptance sequence

**Implemented on current draft branch (not released):**
- CSV starter catalog at `database/catalog/corrugated-materials.v1.csv` (39 reference rows; 59 fields, including blanks for future lab results), plus provenance-tagged JSON flute reference data.
- Administrator-only CSV download from Preferences → Administrator → Account administration → Packaging materials and performance catalog. Endpoint requires existing server-side administrator authorization.
- Reusable layered outside-liner/medium/inside-liner and flute direction/phase API, with a continuous score-strip sampling prototype and non-tiling sheet-space artwork UV helper. The current CreateBoard and FEFCO folding rig expose reference stack metadata.
- Tests for layer order, flute continuity, registered UV and score-strip continuity.

**Outstanding engineering and delivery work (do not mark complete prematurely):**
1. Implement renderable physical liner, glue and directional sinusoidal/corrugated medium meshes using *measured* board caliper; correctly terminate and expose all layers at cuts and slots, including multiple-wall stock. Replace current provisional layer ratios.
2. Replace rigid-prism score gaps with a shared watertight crease strip for adjacent panels (all folding stages). Validate liner topology, material area/mass, score crush and sheet-level flute phase throughout a 0–180° fold.
3. Bind actual imported graphics to sheet-level outside/inside UVs; support printable inks, underprint, protective coating and spot-varnish mask in real units. Never step-repeat artwork; only unprinted substrate grain may tile.
4. Add admin-only catalog browsing, authenticated edit/import, row validation, history, supplier/source attribution and eventual database-backed versions; current admin endpoint is a read-only versioned CSV download.
5. Extend paper/flute construction data beyond the 39 starter templates with supplier-specific thickness/GSM, MD/CD properties and actual converted board grades. Separate design designation, nominal reference and measured test value.
6. Calibrate bend moment, springback, compression/ECT/BCT, flat crush, moisture and environmental response with real lab measurements. Flag any simulation derived from unmeasured parameters as illustrative only.
7. Build reference CAD/RSC specimens with plain substrate, printed artwork and spot gloss; automate tests for seam continuity, UV registration, bending, edge section, save/open and GLTF/CAD exchange.
8. Complete review and CI, compare representative physical board samples, and deploy after approval.
9. Then: org roles → 100 MB+ resumable R2 → shared publishing → SMTP/security → Entra integration.

Avoid editing historical applied Supabase migration records in this materials-only phase. Use the new CSV as a schema starter, not an engineering specification or production material master.

### Renderable layered specimen milestone

A standalone `CreateCorrugatedSample` engineering *visual prototype* now emits three closed mesh objects with real outside/inside liner thickness and an explicitly directional, thin, sinusoidally corrugated medium. Unlike the earlier material-stack reference, the flute amplitude leaves actual air gaps between liners. Triangle normals, cut-edge caps, non-repeating global artwork mapping metadata and basic regression tests are included. This is not yet the default CAD panel renderer, and is not a physically calibrated flute or crease solver. Integrate after mesh/UV and screenshot verification and supplier caliper input.
