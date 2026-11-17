# Private CAD conversion — Auto3D 0.79.0

Cloud 3D Studio 0.3.2 reuses the existing Modal workspace, Supabase identity/database and private `AUTO3D_LIBRARY_R2` bucket. Auto3D 0.79.0 and the native service are live; the full public-calibration pipeline passed. There is no new login system, paid workspace, GPU or permanent warm pool. CPU/build/idle usage still consumes the existing workspace's allowance; billing tiers and limits are unchanged.

## Use Convert CAD

1. Sign in to Auto3D. In **Model upload**, choose **Convert CAD**. Opening a single `.x_t`/`.x_b` file also opens this dialog; mixed selections require choosing one file. Existing local formats and `.auto3d` retain their normal behavior.
2. Choose one Parasolid (`.x_t`/`.x_b`) or STEP (`.step`/`.stp`) source, up to **50 MiB**. Selection alone never uploads it.
3. For Parasolid, choose the actual coordinate units: mm, cm, m, inches or feet. Obtain this from the exporting CAD system; do not guess from the filename. STEP reads its embedded units and disables this override.
4. Choose Standard (0.10 mm) or Fine (0.05 mm) tessellation. Click **Convert privately** to authorize cloud processing. The source is immutable; a retry after a lost response reuses the same submission key.
5. Read actual stages: queued, reading private source, converting/validating and publishing files. You can close the dialog while the job runs. Reopen it to check status, cancel, retry a transient failure or delete source/results.
   Version 0.81.0 adds animated current-stage progress and elapsed time. Percentages measure bytes, processed faces or acknowledged files when counts are available; parsing and other unknown work remain animated without a fabricated overall percentage. Older generic failures can retry once with the updated diagnostic worker, within the two-attempt limit. Known unsupported schemas/entities require a supported export rather than repeated retries.
6. A ready job shows independently validated X/Y/Z dimensions in mm and solid counts. Download STEP (**mm**), GLB (**meters**), STL (**mm**) and the JSON manifest. STL itself does not carry a standard physical-unit declaration, so keep its manifest.
7. Choose **Add to current session** explicitly. Auto3D uses the current window/session/revision, normalizes GLB meters to known scene units and creates one Undo step. It refuses unknown existing scene units or a session/account change during import. Completed jobs never insert themselves into another tab.
8. **Convert sample · 40 × 30 × 20 mm** runs the same private pipeline on a bundled public STEP calibration box; normal queue/compute limits apply. Test this before supplier files.

Parasolid coverage is a supported subset of reader schemas/entities. No compatibility claim is made for every kernel version, unsupported surfaces, CAD feature history or parametric edit history. Unsupported files need a supported source or an explicitly supplied STEP export; they are never silently sent to another conversion provider.

## Server contract

- `GET /api/conversions/capabilities`, `GET/POST /api/conversions`, `GET/DELETE /api/conversions/{id}`.
- `PUT /api/conversions/{id}/source`, `POST …/{submit,cancel,retry}` with the current revision, `GET …/artifacts/{step,glb,stl,manifest}`.
- Existing cookie authentication and active-session verification are authoritative; every route requires matching `X-Auto3D-Account`. Writes require the exact Auto3D origin. Every job query is owner-scoped; foreign jobs return 404. RLS is enabled and browser database grants are revoked; only the server role can call job RPCs.
- 20 creations/hour/account; two active jobs/account; eight globally queued/running; one native worker; at most two application attempts. Deadline 30 minutes. Transient transfer/dispatch/lease failures can retry; geometry/units/validation failures cannot.
- Worker callbacks live outside the browser middleware at `/internal/conversion-worker/{job}/{attempt}/…`. A random, expiring per-attempt capability is stored only as SHA-256. Claim is atomic, heartbeats renew a two-minute lease, and stale/cancelled/expired attempts cannot publish.
- Source/outputs stream through known-length R2 writes with actual SHA-256 enforcement and immutable keys. Each geometry output is at most 64 MiB, the manifest 16 MiB and combined output 208 MiB. `ready` requires all four objects and matching independent validation evidence.
- `/internal/conversion-control/health` and `/reconcile` use a profile/target-bound HMAC derived from the saved runtime secret. That derived key is attached only to the tiny scheduled controller; native parser workers receive neither it nor the Supabase/Modal account secrets. A five-minute controller repairs pending dispatch, expires stale leases and cleans private files. An R2 rule applies only to `conversion-jobs/` and expires objects after one day as an orphan backstop; existing Library rules remain intact.
- Browser downloads stop at the 24-hour metadata expiry. Physical cleanup is asynchronous; R2 lifecycle is a backstop, not an exact-to-the-second deletion promise. Saving an imported model to an `.auto3d` session explicitly retains that scene geometry as usual.

## Implementation and agent access

The host adapter is `cadconversion.js`, with a separate `cadconversionimport.js` for unit-safe scene/history insertion and a small shared `cadconversioncontract.js`. Conversion is independent of the AI and packaging modules. Pages uses `_lib/conversionjobs.js`, `_lib/conversionworker.js` and the public/internal routes; native computation stays in Cloud 3D Studio. New formats extend the native registry rather than changing authentication/storage ownership.

Commands: `conversion.open`, `inspect`, `capabilities`, `jobs`, `job`, `submit`, `cancel`, `retry`, `delete`, `download`, `import`, `sample`. Prefix every name with `conversion.`. `open` is interactive; `submit` uses an already selected local file. Commands never accept provider tokens, arbitrary source URLs or filesystem paths. `import` requires the exact target returned by `conversion.inspect` immediately before the action. Normal read-only, account and busy checks apply.

Validation includes two-owner service-role SQL fixtures; actual workerd/R2 length/checksum and capability tests; desktop/mobile conversion/calibration import/download/Undo; cross-scene mm/cm/m/in/ft physical-size checks and failed-import rollback. CI runs the owned-job SQL in an isolated Postgres database; never run its bootstrap on production. Hosted native proof and the successful live user-API canary are recorded in [0.79.0 notes](release-0790.md). The canary used two temporary confirmed test accounts, verified isolation and all artifact hashes/units, then deleted identities and files; Admin create-user sends no confirmation email. Follow-up database and private-object reads confirmed cleanup.

Production rollout needs the explicit Pages profile in [credential setup](modal-credentials.md), matching Supabase project and installed database migrations. Preview has its own profile and must have separate Auth/Vault credentials; current previews are not automatically given production credentials or enabled remote submissions.
