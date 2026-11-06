# Auto3D 0.50.0 / Packaging 1.10.3 / Primary Products 0.3.0

Repair release from the 2026-11-06 review. See [repair-plan.md](repair-plan.md) for every issue, its fix and status. Packaging and Primary Products are unchanged.

## MCP live control

- **No account lockout after about 1000 commands.** Broker request records expired with the roughly 100-year registration lifetime and the 1000-record cap then rejected every live command. Records now expire after one hour; cleanup pages through and removes records written by earlier releases. A per-account limit of 120 commands per minute replaces the cap.
- **A failed command no longer disconnects the window.** The browser returns `{ error : { code, message } }` for denied, invalid or failed commands. Only protocol violations close the socket, and they now take the normal reconnect path.
- **Actionable errors.** MCP tool errors return `code: message` text plus `structuredContent.error`. Codes are `invalid_arguments`, `unknown_command`, `permission_required`, `revoked`, `not_paired`, `session_unavailable`, `session_changed`, `invalid_code`, `timeout`, `result_too_large`, `rate_limited`, `command_failed`, `conflict`, `not_found` and `unavailable`. Errors without a code stay generic so internal details are never disclosed.
- **Outages keep grants.** Identity or storage failures during refresh return `temporarily_unavailable` (503) instead of `invalid_grant`, which permanently revoked the OAuth grant. A revoked or expired registration on `/mcp` returns 401 with `WWW-Authenticate`.
- **Registration cap counts active registrations only.** Revoked or expired records are pruned after 30 days.
- **Per-command timeouts and cancel.** Inspect commands keep 15 s; ordinary mutations allow 60 s; render, AI, Library, texture, packaging generation and polygon work allow 300 s. A timeout sends `cancel` to the window (typed command sequences and macros stop before their next step) and says the command may still complete.
- **Large results are shortened, not dropped.** Results above 64 KB trim their largest list and report `truncated : { path, returned, total }`.
- **Pairing survives reconnects and agent tab changes.** A window that reconnects from the same login session keeps its pairing. `session.tabs.new/switch/close` run by the agent move the pairing to the newly active tab. User tab switches still unpair.
- **`auto3d.sessions.select` requires an opt-in.** Without the one-time code, an agent can select only windows whose user enabled *Let authorized agents select this window without its code* in Agent access (or `agent.access.connect` with `allowSelect : true`).
- Administrator disable now rejects pending requests and clears pairings. Primary Products is listed under the Modules family. Read-only grants are no longer told to use tools they lack.

## Commands

- 19 state-changing commands are now marked `mutates : true` (render queue, lighting/view, preferences, diagnostics.clear, macro.save, playback cancel, camera.fov), so read-only viewers block them. Sign-in session commands and `commands.text` stay non-mutating; `commands.text` checks each step.
- Every example validates against its schema. Every string and number is bounded (4 KB text, 256 KB definitions, 16 MB data URIs, integer index ranges).
- New commands: `macro.cancel` (runs outside the queue it cancels), `session.rename`, `session.recovery.discard`, `object.user_data.delete`. The catalog has 261 commands.
- File pickers and full screen return `requiresUserGesture : true` when the browser has no user activation instead of reporting success. AI pickers use shared workspace methods rather than simulated clicks.

## Security

- Model, mesh, material, zip and missing-file names are rendered as text. Previously they reached `innerHTML`, so a crafted model or shared `.auto3d` archive could run script in a viewer's signed-in session.
- Pages now sends a Content-Security-Policy. Inline bootstrap scripts are allowed only by SHA-256 hashes computed in `tools/build_pages.mjs`; `object-src 'none'`, `base-uri 'self'` and same-origin editor framing apply. `'unsafe-eval'` remains because the embind-based STEP/IFC/3DM importers loaded from jsdelivr generate functions at runtime.
- Shared Meshy key: each account sees and reads only tasks it created (ownership is recorded in the private AI credential bucket), creation is limited to 20 per hour per account, request bodies must be flat objects (64 KB for text routes, 28 MB for image routes) and model downloads have a 120 s timeout and a 200 MB streaming cap.
- Malformed JSON returns 400. The board catalog route no longer echoes unexpected error text. Recovery contact text uses `AUTO3D_SUPPORT_CONTACT` instead of a hard-coded personal address. Stored client IP hashes are keyed with `AUTO3D_IP_HASH_SECRET` (falling back to the server Supabase key).

## Build, CI and tests

- Browser tests stalled at the welcome screen added in 0.47.5. The welcome screen now continues automatically when `navigator.webdriver` is true; authentication is unchanged.
- CI runs `lint_mcp`, `test_mcp` and checks that the committed MCP catalog matches the registry. Production deploys queue instead of cancelling a running deploy.
- `build_website_dev` writes the mini viewer and animation decoders into `build/website_dev` instead of the production build directory.
- New tests: `test/mcp/reliability.test.js`, `test/command-catalog.test.js`, `test/dom-safety.test.js`, `test/csp-headers.test.js`, the shared-key AI scoping test and updated browser-bridge tests.

## Deployment notes

- Optional new environment variables: `AUTO3D_SUPPORT_CONTACT` (recovery contact address) and `AUTO3D_IP_HASH_SECRET` (IP hash key). Changing the IP hash resets existing account-request and recovery throttles once.
- MCP clients must refresh tool discovery. Windows connected before this release must reconnect to offer `allowSelect`.
- Real-client production verification of MCP remains pending, as in 0.49.2.
