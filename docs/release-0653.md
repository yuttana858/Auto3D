# Auto3D 0.65.3 — Meshy calls work on Cloudflare

Primary Products remains 0.14.0; Packaging remains 1.10.7. Based on main after #115 (0.65.2).

## Fix

Every Meshy request from production failed before it left the server. The AI proxy (`functions/api/ai/[[path]].js`) and the key test (`functions/api/ai/credential-test.js`) called `fetch` with `redirect: 'error'`. Cloudflare Workers do not support that value and throw: *"Invalid redirect value, must be one of "follow" or "manual" ("error" won't be implemented since it does not make sense at the edge; use "manual" and check the response status code)"*. The catch-all handlers turned that into:

- "Could not reach Meshy. Try again shortly." for Test saved connection and the balance;
- "Submission response was lost. Check recent creations before retrying; Meshy may have accepted the task." for every generation. No task reached Meshy, so nothing was charged.

This was the long-standing undiagnosed production Meshy failure. It affected personal keys, the shared organization key and the deployment key alike. Node accepts `redirect: 'error'`, so unit tests and local runs passed.

Both calls now use `redirect: 'manual'` and refuse any 3xx or opaque-redirect response with `MESHY_REQUEST_FAILED`, so the key is still never forwarded to another host.

## Validation

- Reproduced in `workerd` (Cloudflare's runtime) through `wrangler dev`. With the old code, the proxy returned 502 for the balance and for text-to-3D submissions, and the key test returned 503. With the fix, all three return 200. The harness used workerd's own `Request` validation, with a local responder in place of Meshy.
- New regression tests use a Workers-like `fetch` that rejects `redirect: 'error'`; they fail on the old code. They also check that a Meshy redirect is refused and not followed.
- The two credential tests that asserted `redirect: 'error'` now assert `'manual'`.

## After deploy

Use Preferences → AI connections → **Test saved connection**. A personal key saved on an account takes priority over the shared organization key. Remove the personal key to use the shared one.
