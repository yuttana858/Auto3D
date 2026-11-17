# Modal credentials and deployment bridge

Auto3D **0.79.0** candidate; Packaging **1.12.0**, Primary Products **0.15.0**, Molded Pulp **0.1.0**. Cloud 3D Studio **0.3.0** is deployed and verified; **0.3.1** adds the guarded controller and live canary. Auto3D 0.77.0's credential bridge is merged in #138; #139's Auto Pallet is preserved.

## Verified configuration

The existing Supabase project is `iesepcoxqochycckbwoh`. Vault encrypts each complete target/token pair as one record. Only the server role can invoke the read/save/delete RPCs; browser database roles cannot access them or the Vault schema. No key is returned in app status, diagnostics, commands or `.auto3d` files.

The production deployment record targets Modal workspace **`yuttana858`**, environment **`main`**, app **`cloud-3d-studio`**. GitHub [connection check 44110280460, attempt 2](https://github.com/yuttana858/Cloud-3D-Studio/actions/runs/44110280460) passed live Vault retrieval and target authentication. [Build 44131313665](https://github.com/yuttana858/Cloud-3D-Studio/actions/runs/44131313665) passed the hosted native STEP/GLB/STL proof and provisioned the runtime pair directly into Vault. Its authenticated gateway is `https://yuttana858--cloud-3d-studio-cad-gateway.us-east.modal.run`. Regional provider origins and environment suffixes are supported; arbitrary URLs, ports, credentials, paths, queries and redirects remain refused.

## Which key goes where

| Destination | Exact credential | Purpose |
| --- | --- | --- |
| Cloud-3D-Studio GitHub **Repository secret** `SUPABASE_SECRET_KEY` | Supabase **Secret API key**, starting `sb_secret_…` | Trusted runner reads encrypted Modal credentials and provisions runtime settings. A legacy `service_role` API JWT is also supported. |
| Supabase Vault `auto3d/modal/v1/production/deployment` | Modal deployment ID `ak-…` and matching secret `as-…`, together with workspace/environment | Deployment and private SDK access. |
| Supabase Vault `auto3d/modal/v1/production/runtime` | Modal Web Function proxy ID `wk-…` and matching secret `ws-…`, with gateway origin | Auto3D server calls the protected gateway. The build creates this record automatically. |

A Supabase **publishable**/anon key and **JWT signing secret** are not server API keys. A Modal key does not belong in GitHub's `SUPABASE_SECRET_KEY`. The Supabase key label and GitHub secret name are separate fields.

## GitHub bootstrap: exact steps

These steps are already completed for this build; use them when rotating or repairing the runner key.

1. Open [Supabase → Auto3D → API keys](https://supabase.com/dashboard/project/iesepcoxqochycckbwoh/settings/api-keys/).
2. Select **Publishable and secret API keys**. In **Secret keys**, create a dedicated key named `cloud3d-github-runner`, or open the dedicated key already created for this runner. Copy the complete value beginning `sb_secret_`.
3. Open [Cloud-3D-Studio → Settings → Secrets and variables → Actions](https://github.com/yuttana858/Cloud-3D-Studio/settings/secrets/actions). Select the **Secrets** tab and **New repository secret**; use the edit button instead when rotating the existing entry.
4. Set GitHub **Name** to exactly `SUPABASE_SECRET_KEY`. Paste the copied value into **Secret**, then select **Add secret** or **Update secret**. Confirm the exact name appears under **Repository secrets**. Do not store it under a GitHub Environment unless the workflow explicitly names that environment.
5. Open [Actions](https://github.com/yuttana858/Cloud-3D-Studio/actions), select **Check Modal connection from Vault → Run workflow → main**, profile **production**. Its success means the saved Modal deployment pair was accepted for the exact target; this check does not deploy or convert CAD.
6. Run **Build verified Modal CAD service → Run workflow → main**. Reviewed source merges also trigger it automatically. The workflow builds the bounded CPU image, proves a synthetic 40 × 30 × 20 mm model, provisions the runtime pair directly in Vault, then waits for verified gateway readiness. The controller is installed with a health guard. The public calibration canary runs only when Auto3D's connector is ready.

Keep real keys out of chat, repository files, command arguments, SQL Editor history and screenshots. GitHub masks its configured bootstrap secret; the runner additionally withholds provider bodies and never prints fetched Modal tokens. `sb_secret_` uses the `apikey` header; a legacy service-role JWT also uses the bearer header. No JWT signing key is needed.

## Required Pages profile: exact steps

The Pages profile update is still pending. Automatic approval review rejected the API PATCH because its partial environment payload could overwrite existing variables/bindings. Cloudflare returns saved secret values as empty strings, so blindly writing a fetched full configuration back is also unsafe. Use the dashboard's individual-variable editor to preserve existing settings:

1. Open [Cloudflare → Workers & Pages → auto3d](https://dash.cloudflare.com/c24489fd32a7bebd7ff5970075c8429c/pages/view/auto3d).
2. Open **Settings → Variables and Secrets**. Select the **Production** environment.
3. Choose **Add**, select **Text** (this is a nonsecret selector), enter **Variable name** `AUTO3D_MODAL_PROFILE` and **Value** `production`, then save.
4. Switch to **Preview**. Add the same text variable name with value `preview`, then save. Leave every existing entry and binding in place. This does not give preview production Supabase credentials.
5. Confirm the exact lowercase values. The next Pages deployment picks them up; saving a setting alone does not prove the active deployment has the new binding.

There is no implicit fallback between profiles, and a known Pages branch/profile mismatch fails closed. Current previews lack their own Supabase/Auth credentials and cannot submit cloud conversions; do not copy production keys into previews to bypass that isolation.

## Manage saved pairs in Auto3D

After deploying the candidate, open **Preferences → Administrator → Manage Modal connections**. Choose **Deployment · ak-/as-** or **App connection · wk-/ws-**. Enter both matching fields to replace a pair; saved values are never shown again. The token form clears on submit/close/account change and is excluded from app captures.

**Test saved app connection** checks provider authentication, protocol and target without converting CAD. Verified readiness is reported separately from network connection. Commands `admin.modal.open`, `inspect`, `test` and `remove` share the same underlying service; prefix each with `admin.modal.`. Tokens are never command arguments.

Rotation uses revision checks so two administrator windows cannot mix credentials. Saving/removing a record does not revoke it at Modal. After a runtime rotation, rerun the Studio build to update the controller's derived key. To replace a revoked runtime pair automatically, remove that saved runtime entry first and run the build; a valid existing pair is reused rather than silently replaced.

The default local runner check is `uv run python deploy/vault_modal.py --profile production`. The complete explicit deploy is `uv run python -m deploy.provision_modal --profile production --deploy`. Prefer the existing GitHub workflow when local firewalls block Modal/Supabase. Both run through the same Vault record and target checks without writing a local Modal profile or passing Supabase credentials into native containers.

## Validation and limits

All credential/job database migrations are recorded under `supabase/migrations`; never replay historical prototypes. Synthetic service-role ownership, idempotency, queue, lease, cancellation and retry tests pass with rolled-back writes. RLS/grant checks pass; existing server-only no-policy information and the preexisting leaked-password-protection advisory remain. Native 0.3.0's 47-test baseline and hosted proof pass; the controller/canary follow-up is being validated separately.

The app converter has strict shared commands, active-account/origin checks, private streaming/hash validation, explicit target-safe import and one-step Undo. See [CAD conversion](cad-conversion.md) for limits, retention and formats. Supplier Parasolid acceptance still requires the private reference file. Existing CPU credits/usage apply; no billing tier, workspace, GPU or spending-limit increase is performed.
