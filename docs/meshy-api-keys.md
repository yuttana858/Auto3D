# Personal Meshy API keys

Auto3D 0.47.3 / Packaging 1.10.3 adds encrypted personal Meshy credentials. This feature has not been deployed. Cloudflare storage bindings and encryption secrets were configured on 2026-11-03; the application deployment is unchanged. No Supabase schema change is required.

## User workflow

Open Preferences → AI connections → Manage Meshy key. Paste the key into the masked field and choose Save key. Use Test saved connection to check authentication and credit balance without buying a generation. Saving accepts key syntax; a successful save alone does not establish that Meshy accepts the key. Enter another key to replace it. Remove key deletes Auto3D's stored copy; revoke the key separately in Meshy when necessary. Once removed, an explicitly enabled administrator connection can still be used.

The credential is stored for the signed-in account across devices. A saved key is never shown again, even to its owner. Key input is not accepted through commands/macros. HTTPS is required (localhost secure contexts can be used for isolated development).

## Deployment prerequisites

1. Create a **dedicated private R2 bucket**, with public development URLs and custom domains disabled. Bind it to the Pages Functions environment as `AUTO3D_AI_CREDENTIALS_R2`. Do not reuse `AUTO3D_LIBRARY_R2`, expose its contents through any file route, or include it in Library export/synchronization jobs. Use separate preview and production buckets.
2. Generate 32 cryptographically random bytes and store their 64 hexadecimal characters as the encrypted server secret `AUTO3D_AI_KEY_ENCRYPTION_SECRET`. Use your approved secret tooling; do not put the value in code, ordinary environment variables, chat, logs or checked-in files. Use separate preview/production secrets and restricted administrator access. Do not reuse the Meshy API key, Auth secret or audience-share secret.
3. Deploy the reviewed Functions and website together. Check the dialog reports personal storage available, then perform a save/test/remove with a disposable Meshy key in the intended environment. Never log the key or request body.
4. The existing optional `MESHY_API_KEY` and `AUTO3D_AI_ALLOW_SHARED_KEY=true` fallback can remain. Personal keys take precedence. To require personal keys, leave shared-key enablement false. Do not silently enable shared-key spending for this feature.

If either secure-storage prerequisite is absent, personal saving is unavailable. Status and explicit removal remain possible when the bucket exists but the encryption secret is missing. An existing unreadable personal record fails closed instead of falling back to the shared key. This release is based on the deployed 0.47.2 source and includes only the personal Meshy credential feature.

## Storage and authorization

Objects are addressed only by the verified account ID under `meshy/v1/<account-id>`. Client-supplied owner IDs are rejected. The authenticated Pages middleware checks approved sessions and same-origin writes; the credential route additionally requires a matching account header and checks the write origin itself. PUT accepts one bounded JSON `key` field. GET returns only saved/available flags. DELETE is scoped to the current actor. Responses are private/no-store.

Each save uses AES-256-GCM, a fresh random 96-bit IV and the full account/provider object path as authenticated additional data. Only version, IV and authenticated ciphertext are persisted. Substituting another account's record, changing ciphertext or using a different encryption secret fails authentication. No decrypted key is cached globally. The existing proxy sends the plaintext key only as a server-to-Meshy Authorization header over HTTPS, refuses credentialed redirects, bounds upstream JSON and redacts the credential from response text. It does not log provider/storage exception objects.

The app clears the field immediately on submit, on close and on account changes. The entire dialog is excluded from app captures. Browser persistence, preference sync, model/project archives and command results contain no key. Saved keys are not loaded into the field. Authentication still uses the existing HttpOnly cookies.

## Operations and limits

Treat this as an application-managed credential vault: trusted runtime code can decrypt keys. It does not isolate keys from a compromised Pages runtime, compromised same-origin JavaScript during entry, or an administrator who controls both the bucket and encryption secret. Keep production code and secret administration restricted; do not enable request-body/header logging in Cloudflare observability or external monitoring.

There is one active encryption secret in this implementation. Do not overwrite it while retaining records: that makes existing keys unreadable. To rotate safely, schedule re-entry, remove the personal credential records, rotate the secret, then have users save new keys. A future migration with old/new secret support would be needed for transparent rotation. Retain and protect the secret consistently with encrypted backups; avoid retaining deleted credentials unnecessarily. Deleting a user in an external identity system does not automatically delete its R2 record: include that account's `meshy/v1/<id>` object in administrative account-deletion procedures. Revocation/reset continues to gate access through the existing account middleware.

Storage updates use atomic per-object R2 writes; concurrent replacements follow last-completed-write behavior. Removal cannot cancel provider requests already in flight. No live Meshy generation or paid task is required by the automated tests.

## Validation

`npx mocha test/ai-credentials.test.js test/ai-workspace.test.js` covers ciphertext/nonce behavior, owner binding, corrupt/missing secrets, authorization/CSRF, bounded input, removal, fallback, redirect policy, redaction, client identity changes and credential-free command entry. `node test/browser/ai-credentials.mjs` uses the built full website with isolated APIs to cover desktop/mobile entry, save, balance test, reopen, delete, logout cleanup and absence from browser storage/logs. Build first with `npm run build_website`.

Platform references: [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

## Cloudflare configuration verified 2026-11-03

The `auto3d` Pages project now has `AUTO3D_AI_CREDENTIALS_R2` and an independently generated 256-bit `AUTO3D_AI_KEY_ENCRYPTION_SECRET` of type `secret_text` in both environments:

| Environment | Dedicated bucket |
| --- | --- |
| Production | `auto3d-ai-credentials` |
| Preview | `auto3d-ai-credentials-preview` |

Both buckets were verified with managed r2.dev access disabled and no custom domains. Existing environment-variable names/types, plaintext settings and R2 bindings were preserved. Secret values were generated within the Cloudflare connector execution and were never printed or written to local files. Existing secrets were not rotated. The canonical deployment remained `cd660588-20fc-498c-ac40-316e7a67fa30`; no deployment was triggered. These settings become available to the application on a subsequent deployment. Live save/test/remove verification still requires deploying the reviewed feature; no real user Meshy credential was submitted.
