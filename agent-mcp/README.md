# Auto3D MCP prototype

This package contains a **local, read-only implementation in progress**, not a deployed connector. Worker entry points, same-origin Pages routes, an opt-in connection control, and a durable broker core exist, but deployment configuration, real Cloudflare runtime verification, production revocation UX and operational cleanup are incomplete. Do not route public traffic to it.

- `auth-worker-entry.js`, `auth-worker.js`, `consent.js`: same-origin OAuth authorization service using the official provider, a browser-bound and account-bound consent form, and a same-site sign-in continuation. A local integration test exercises actual provider code with a Node shim and in-memory KV; this is not a Cloudflare runtime test. The production configuration must enable `global_fetch_strictly_public` for client metadata document clients.
- `identity.js`: adapters for the existing verified Auto3D login cookie, provider token validation and server-side account-status checks. Grants are rejected after account disablement or a session-reset timestamp.
- `durable-broker.js`, `durable-object-entry.js`, `durable-router.js`: private, per-account Durable Object routing foundation with socket attachments, persisted pairing and request IDs, and failure on disconnect or re-pair. The broker uses a renewable five-minute connection lease; the renewal implementation is local only and expired-record cleanup is still required. Mock-state tests do not replace a Workers runtime, restart, security, or load test.
- `session-router.js`: in-memory routing and pairing rules. Identity parameters must come from a verified server-side authorization context, never an MCP argument. Its request ledger is process-local and is not suitable for production idempotency or restart recovery.
- `browser-bridge.js`: an opt-in, read-only adapter with a small command allowlist. It does not establish or authenticate a browser connection.
- `browser-socket.js`, `browser-gateway.js`: same-origin, secure-WebSocket client and authenticated gateway foundations. The same-origin Pages route and opt-in account-dialog control are implemented locally; no production binding has been configured. The internal broker binding must never be exposed directly.
- `tool-service.js`: validates command arguments with Auto3D's existing schemas and enforces the pilot allowlist and read scope.
- `mcp-server.js`: uses the pinned official MCP SDK to advertise and invoke pilot tools, including explicit account-scoped session selection.
- `resource-worker.js`, `http-handler.js`: read-only MCP resource, metadata, provider verification and per-account routing composition. No deployment, production secret, or binding configuration is supplied.

Install the package dependencies with `npm ci --prefix agent-mcp`. From the repository root, `npx mocha test/mcp-*.test.js` runs the prototype tests. `node tools/mcp_inventory.mjs` refreshes the inventory from the current command catalog; all items remain pending security and functionality review.

See `docs/auto3d-mcp-plan.md` for scope, account linking, milestones, dependencies, and release criteria.


`capture.image` returns a PNG as MCP image content. It is available only when the user has approved the separate `auto3d.capture` scope. The default is the 3D viewport; the optional workspace capture omits account forms and input fields. Images are limited to 2 MiB of base64 data on the agent connection; retry with a smaller `maxSize` if needed. This provides tool content to a connected agent; display or attachment in a particular chat client depends on that client's image support.

The account dialog connects only after the user clicks the button. Local renewal revalidates the same signed-in browser session and retains the selected window; failed renewal disconnects rather than retargeting. The staging Workers do not yet include this renewal code. Same-origin Pages routes fail closed when their private Worker bindings are absent. The Pages project has existing Supabase secrets, but they are not readable for duplication; the Worker identity architecture and secret provisioning require completion before rollout.
