# Isolated MCP pilot and agent registrations

The user has subsequently authorized a limited live-site test using the existing administrator. See [release-0470.md](release-0470.md). That explicit live-admin mode uses the existing Pages identity configuration, a separate private broker and OAuth KV, and requires enrollment plus current administrator status. The staging plan below remains available; it is not a prerequisite for this separately authorized live-admin test.

This candidate rebuilds the missing MCP source from the available app and the design observed in the private staging Workers. It is not a production release. The application remains 0.46.0 and Packaging remains 1.10.3 until the pilot is validated.

## Authorization design

Use the maintained Cloudflare OAuth provider for discovery, exact redirect validation, PKCE, browser-bound single-use consent, resource-bound tokens and refresh rotation. Each authorization creates a named registration owned by one account. Registrations identify the harness (ChatGPT, Claude, desktop, CLI or another OAuth client), client ID, scopes, creation/expiry and revocation. Names are labels supplied by the user, not verified client identities. Consent displays the client's actual domain and redirect host separately.

OAuth-capable clients receive individual revocable grants. Public desktop/CLI clients use authorization code plus S256 PKCE and a loopback callback; confidential hosted clients use the provider's supported client authentication. No shared bearer key, personal API key, client-secret generator or password field is exposed by Auto3D. Harnesses without supported OAuth need a separately reviewed adapter; they cannot bypass consent using an application credential. Dynamic client registration identifies software and does not grant account access.

At consent, a user enters the short-lived app window code copied from Agent access to pair that OAuth registration with the connected window's active session. Pairing is the default approval path; the consent form requires the code for it and offers a separate explicit approval without pairing. Codes are random, stored server-side only as SHA-256 digests, expire after 10 minutes, and are single-use. Without pairing, users can select a session later through `auto3d.sessions.list` and `auto3d.sessions.select`. The flow is harness-neutral for OAuth-compatible clients; ChatGPT and Claude are named choices, with other OAuth clients still supported.

After the user authenticates and approves OAuth, an agent may also call `auto3d.sessions.pair_code` with a code the user explicitly supplies. The broker checks the code against connected windows belonging to the authenticated account and never returns the code. This still requires a valid OAuth grant; the agent does not receive the user's password or browser session cookie. Treat the code as a short-lived credential and do not log it. MCP clients must refresh tool discovery after deployment.

Six grouped browse tools (`auto3d.design`, `auto3d.commands`, `auto3d.capture`, `auto3d.modules`, `auto3d.sessions`, and `auto3d.settings`) list categories first, then return paginated command schemas by category. The module group also attempts to inspect the selected window’s registered panels when write access is granted. All grouped browsing uses the current generated catalog, including future categories. Invoke a chosen command through `auto3d.commands.invoke`; the separate write and screenshot permissions still apply. Existing catalog and direct inspection tools remain available for compatibility.

The one-time window code expires after ten minutes. New agent registrations have a long lifetime and can be revoked in Agent access; refresh credentials rotate and expire after one year without refresh, and a client can impose shorter limits. Existing 24-hour grants do not automatically become long-lived; authorize again to receive the new lifetime. A selected-window pairing expires after one hour without an agent command without revoking the registration. Pairing and OAuth completion failures have separate messages. An OAuth completion failure revokes the incomplete registration; because the code may already have been consumed, reconnect the window for a fresh code before retrying.

After an established app-window socket is lost, the browser retries with bounded exponential backoff while the same account stays signed in. Reconnect creates a fresh, single-use window code; the agent must pair again. Explicit disconnect, sign-out and account changes stop retries. Commands are never automatically replayed after a timeout or disconnect. Live scene operations require the signed-in app window to remain open.

Before consuming a permission request, the broker checks that the submitted window code belongs to a connected, active window and has not been used. If that check fails, the user can reconnect the app window, use the browser Back button, and enter the new code on the still-valid permission form. The final pairing still rechecks and consumes the code atomically; if the window changes during approval, restart the connection from the client.

For example, call `auto3d.modules` with `{}`, then call it with `{ "category": "Packaging", "limit": 10 }`. Use the returned schema with `auto3d.commands.invoke`, such as `packaging.fefco.generate` with inside dimensions in millimeters. Existing read-only grants cannot run that command: reconnect and explicitly authorize `auto3d.write`. The module inspection includes panel modes, including closed panels; it does not guarantee that every module is actively running. A disconnected or unpaired window leaves module state unavailable while catalog browsing still works.

The separate `auto3d.headless` tier supports one grant-scoped temporary FEFCO cut/score CAD draft using `auto3d.headless.fefco` and `auto3d.headless.inspect`. It requires no window or pairing, but generation requires `auto3d.write`. Dimensions are score-to-score in millimeters and do not establish inside/outside allowances or manufacturing compliance. The draft is isolated from live sessions and Library, replaced by the next generation and deleted on grant revocation or account agent disablement. It does not yet provide headless rendering, 3D scene editing, import/export, Library persistence or the other live-only commands.

The generated command catalog is the source of truth for MCP command discovery and execution. A grant with only `auto3d.read` exposes five basic read-only app tools; `capture.image` is added when `auto3d.capture` is granted. A grant that also requests `auto3d.write` exposes catalog operations for all 250 commands, including app mutations and account/administrator operations. The OAuth consent page identifies this full access; account and administrator commands still pass through their existing Auto3D authorization checks. Screenshot capture remains separately gated by the `auto3d.capture` OAuth scope and the connected window's screenshot opt-in. Tool schemas are validated against the generated catalog before dispatch, and the broker independently enforces the write scope.

### Efficient agent tool workflow

The MCP `tools/list` response stays small: it includes the basic tools and session controls, plus three catalog tools for a write-enabled grant. Agents should not request or receive all 250 command definitions at startup:

1. Call `auto3d.commands.categories` to see the available command groups and counts.
2. Call `auto3d.commands.list` with a category (for example, `Packaging`) or a search string. Results include each matching command's input schema and are limited to 25 per page; follow `nextOffset` when more results are needed.
3. Call `auto3d.commands.invoke` with the selected command ID and arguments that match its returned schema.
4. Verify the result with a suitable inspection tool before continuing a multi-step task.

This keeps discovery focused on the current task while making the entire generated catalog available on demand. See [agent-screen-capture.md](./agent-screen-capture.md) for user setup and pairing.

Per-account Durable Object registrations add strongly consistent revocation to the provider's KV-backed grants. Resource calls and refreshes check registration state. User revoke immediately denies subsequent calls, pairing and result delivery. Administrators can inspect/revoke an account's registrations and disable its agent access. Re-enabling never restores old registrations. Normal account disable/session invalidation is checked in addition to agent revocation. No tokens or secrets appear in registration lists.

## Browser and session boundary

The user explicitly connects a browser window. Same-origin session-cookie authentication creates a short-lived WebSocket lease; renewal verifies the same account and login session. One account has one broker, with independent connections per window. A code entered at OAuth consent pairs that registration with the window's current active session; otherwise the agent lists windows and the user explicitly selects an active session. Switching tabs, account changes, logout, lease expiry, revocation or disconnect rejects stale requests and results. Reconnect does not replay requests. Browser commands still use the existing CommandRegistry, schemas, account checks and read-only guards.

The basic tools available to a read-only grant are scene, current-camera, packaging-measurement, render-queue and session-tab inspection. A write-enabled grant can discover and invoke the full generated command catalog, including account and administrator commands; those operations continue to enforce the existing account and administrator checks. Screenshot requests require both an OAuth capture scope and a browser-window opt-in. Arbitrary JavaScript and credential values are not exposed through the catalog.

## Staging isolation and release gates

Only `https://auto3d-mcp-pilot.pages.dev` may host the pilot. All Workers have public workers.dev access disabled and communicate through bindings. The pilot app blocks production Library, preferences, sharing, AI and account-management endpoints; no production R2 binding is required. Identity must be configured against a separate staging Supabase project with the existing account/session schema and disposable accounts. Both identity-project isolation and an explicit pilot-account allowlist are deployment prerequisites. Never copy the production service key into a new test fixture.

Before production is proposed: build every Worker and Pages artifact; run OAuth/PKCE/consent/revocation tests, account/window/tab isolation tests and browser checks; deploy staging only; verify discovery and login with two disposable accounts; connect a real ChatGPT client and call list/select/inspect/capture with revocation checks. Record the actual result. A mocked SDK client or passing build is not evidence of a working ChatGPT connection.

The private session log stays at `/workspace/auto3d-private/project-status.md`, outside this repository. Never commit credentials or private progress notes.

## Build and checks

```sh
npm ci
npm run lint
npm run lint_mcp
npm test
npm run test_mcp
npm run build_mcp_pilot
node test/browser/mcp-access.mjs
```

The dedicated GitHub workflow runs these checks and uploads the staging artifact; it never deploys. The runtime integration uses actual workerd, Durable Objects, KV, OAuth and MCP libraries, with a disposable identity fixture. The Chromium test uses generated assets with mocked identity and WebSocket endpoints. Neither tests a real ChatGPT connection.

Build output is `build/mcp-pilot` plus four bundles in `build/mcp-workers`. The Pages artifact has its own advanced-mode `_worker.js`; it does not include the production data Functions. MCP library dependencies are pinned build inputs and bundled with license notices in `MCP-LICENSES.txt`. The existing published engine dependencies and MIT-only license policy remain unchanged.

## Required staging setup

1. Supply a separate Supabase test project. The existing pilot Pages configuration was found to have `SUPABASE_URL` pointing to a website rather than a Supabase API. Correct it using the staging project's actual `https://<ref>.supabase.co` URL and staging-only server secret. Prepare the current server-only session RPC, account controls and administrator allowlist; do not replay archived PR16 SQL or copy production users. Create two disposable confirmed accounts and a staging administrator.
2. Configure the following non-secret environment inputs before running `npm run prepare_mcp_staging`: `AUTO3D_MCP_PILOT_ACCOUNTS` (comma-separated staging account UUIDs), `AUTO3D_MCP_STAGING_SUPABASE_URL`, `AUTO3D_MCP_PRODUCTION_SUPABASE_URL` (used to reject accidental production identity), and `AUTO3D_MCP_OAUTH_KV_ID` (the staging provider KV namespace). The generated files live under ignored `build/mcp-config`. No credentials are written by this command.
3. Keep `SUPABASE_SECRET_KEY` configured as a secret on the auth, gateway, resource and pilot Pages services, using the staging key. The auth Worker also needs its existing `AUTO3D_MCP_CONSENT_SECRET`. Names and values must never go into source or command arguments. Use Cloudflare secret input or the connector's secure secret workflow. No end-user agent API secret is needed.
4. For local upload, configure the managed environment's `CLOUDFLARE_API_TOKEN` HTTP credential and allow `api.cloudflare.com`; permit the exact pilot Pages and staging identity hosts for live verification. The Cloudflare connector and the shell HTTP credential are independent. Keep all four Workers private; do not enable workers.dev or preview URLs to bypass staging routing.

After prerequisites are verified, the reviewed staging-only commands are:

```sh
npm run prepare_mcp_staging
npx wrangler deploy --config build/mcp-config/broker.json
npx wrangler deploy --config build/mcp-config/auth.json
npx wrangler deploy --config build/mcp-config/gateway.json
npx wrangler deploy --config build/mcp-config/resource.json
npx wrangler pages deploy build/mcp-pilot --config build/mcp-config/pages.json --project-name=auto3d-mcp-pilot --branch=main
```

`main` here selects the isolated pilot project's canonical origin; it does not deploy the production `auto3d` project. Existing broker migration `v1` is preserved. Do not use fixture configurations produced by tests for deployment. Check remote bindings before upload, especially the absence of production R2 and the correct staging identity key.

## Live client acceptance

With the pilot deployed, add a custom OAuth MCP connection in ChatGPT using `https://auto3d-mcp-pilot.pages.dev/mcp` (Developer mode/custom app availability depends on the account). Sign in with a disposable staging account and approve a named grant. In Auto3D staging, open Preferences → Agent access, connect a named window and explicitly opt in to screenshots if needed. In ChatGPT, call `auto3d.sessions.list`, have the user identify the intended active session, call `auto3d.sessions.select`, and then `scene.inspect`. Request screenshot scope through OAuth before calling `capture.image`; browser screenshot opt-in is also required.

Repeat with another test account and window; confirm no cross-account sessions or data appear. Switch the selected tab and confirm requests fail until explicitly paired again. Revoke access in the user controls, and then through the staging administrator controls; verify further requests and refresh fail. Disconnect/logout and verify the browser lease ends. Record dates, client, grant scope and actual outcomes in the private log without tokens. Production remains gated on this real-client evidence.
