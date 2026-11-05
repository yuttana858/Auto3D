# Headless Auto3D build list

The headless tier stores one temporary FEFCO cut/score CAD draft per OAuth registration and supports up to 20 explicitly saved, account-owned CAD projects with revision checks. It does not open, control or synchronize a browser session. Generated dimensions are score-to-score, in millimeters; board- and converter-specific inside/outside allowances must be supplied by a future engineering implementation. Revocation or account agent disablement deletes this temporary draft.

Remaining work for full headless Auto3D:

1. Extend the account-owned, revision-checked CAD project store into a versioned full scene document and durable project storage. Add richer quotas, recovery, assets and explicit user-facing project management.
2. Extract scene, material, CAD and module operations from browser UI services into shared host-independent services. Validate parity against the interactive app and expose each command's supported execution modes in the catalog.
3. Add import/export workers and bounded background jobs with progress, cancellation, resource limits, idempotency and no automatic replay of destructive commands. Keep existing asset, account and Library authorization.
4. Add server-side rendering and previews in an appropriately isolated runtime with explicit resource budgets. A Cloudflare Durable Object does not supply a browser/WebGL renderer.
5. Add explicit handoff between an account-owned headless project and a chosen live session, preserving materials, transforms, CAD measurements and conflict handling. Never silently replace a live user's scene.
6. Verify real ChatGPT and other harnesses, cross-account and cross-window isolation, revocation, reconnect, idle timeouts and recovery after runtime restart. Record real results separately from simulated runtime tests.
