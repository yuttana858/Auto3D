# Auto3D MCP: goals and delivery milestones

Status: planning. This document does not implement, authorize deployment, or enable an MCP connection. The current in-page `window.Auto3D` registry is not a remote MCP server. The checked-in catalog contains 236 commands across 21 categories; inventory it again at implementation time because that count will change.

Local implementation status: `agent-mcp/` contains an isolated SDK-backed read-only protocol prototype, a non-networked browser adapter, a session-routing core and an HTTP integration boundary that requires an injected verifier. Tests use a mock verifier and in-memory transport; these pieces are not connected to production, do not yet perform OAuth verification, and are not an operational ChatGPT connector. `docs/auto3d-mcp-inventory.json` enumerates the current command catalog with every item marked pending review. A real consent UI, token validation, durable broker, browser connection, session picker, action coverage and production security review remain outstanding.

## Goal and scope

Connect an authenticated ChatGPT user to their live, signed-in Auto3D workspace so the assistant can inspect and operate the full application through the same validated services as the user interface. The target is coverage of every applicable user-facing function, including functions that currently only open a dialog or lack a command. Delivery is staged; the read-only first milestone is not the final scope. Preserve exact CAD specifications, board dimensions, account ownership, read-only rules, Undo, and camera/animation overrides.

Full application coverage includes scene and session management; imports and exports; object, group and array tools; Packaging Gen, board catalog, CAD and measurements; materials, textures, lighting and backgrounds; cameras, view modes, rendering and render queue; fold and timeline animation; AI generation, preview and project saving; Library and sharing; preferences, diagnostics, documentation and macros. Account administration, credentials, publication, access control, and other sensitive actions need separately scoped, explicitly authorized and auditable workflows. Interactive-only features must gain safe service APIs or return an actionable interactive step; the agent must not fake a completed action merely by opening a dialog. Some browser or platform gestures, file permissions, or unsupported provider actions may require the user to finish in the app.

## Multi-user onboarding and storage

An administrator approves a registration; Auto3D creates one verified identity and idempotently prepares the user's default settings. Use shared, owner-scoped tables and an owner-prefixed object-storage namespace, not a new database per user. Each user's private Library, AI project workspace, OAuth grants and live connection records use the verified account ID. The existing private Library and preference storage already use this pattern; preference creation is also retried at first sign-in. Agent access is separately opted in and cannot be inferred from account creation.

The existing AI autosave is browser-local. Add an account-owned cloud workspace and versioned, conflict-aware save/restore so a user can recover AI assets and scale on another device. Store private model archives in owner-scoped object storage, not in public metadata; enforce the account's storage limits, prevent cross-account reads/writes, never put API keys into the archive, and handle competing devices without silently overwriting changes. Keep local recovery available if cloud storage fails and report the failure. Approval or retries must never create a second user or delete existing saved files. Account revocation immediately blocks new access and disconnects agent sessions; existing saved files remain private and are retained according to the existing account policy.

Local progress: approval now attempts an idempotent settings seed and falls back to the existing first-sign-in retry. A new owner-scoped AI-workspace migration, revision-checked API and client transport have local tests, including competing writes and ambiguous storage outcomes. The migration has been tested in isolated PostgreSQL but has not been applied to Supabase; the client transport is not yet connected to AI autosave or conflict-resolution UI. The AI workspace has a separate 32 MiB per-workspace limit in this prototype, in addition to the existing personal Library quota. Staged objects left by ambiguous failures require an owner-safe reconciliation process.

Before enabling a shared Meshy server key for multiple users, enforce ownership for every created task, task lookup, list, model download and derived generation. The provider key does not itself isolate Meshy task history by Auto3D user. A local implementation now records ownership on creation, filters history and verifies source tasks and model downloads; its migration and tests have not been deployed. Existing unowned tasks are deliberately not auto-claimed: a safe, authorized recovery process still needs to be designed and tested. Do not expose all provider tasks as a shortcut.

Milestone acceptance: approve a test user, sign in on two independent clients, save/recover a private model and AI workspace, and connect one explicitly selected session. A second user must not list, read, overwrite, pair with, or delete the first user's data even using known IDs; retry provisioning and concurrent edits without duplicate accounts or lost data. Simulate failed provisioning, upload, disconnect, sign-out and revocation. Do not change a production schema or enable OAuth until the migration, access controls and rollback have been tested.

## Recommended sign-in and session routing

Use the **same Auto3D account**, not a second MCP username or password database. Do not ask the user to type an Auto3D password into ChatGPT, pass passwords to the model, or reuse a browser cookie as an MCP bearer token. Build an OAuth authorization-code flow with PKCE and compatible discovery/client registration. ChatGPT redirects the user to an Auto3D-owned sign-in/consent page; if their existing Auto3D login is valid there, the page can reuse it, otherwise they sign in with the same Auto3D credentials on that page. Auto3D issues a separate, scoped, revocable OAuth grant to the MCP client. Verify integration with the current Supabase identity and account-revocation rules; the existing HttpOnly cookies alone are not an OAuth server. Confirm browser and workspace behavior during implementation rather than assuming a seamless login.

**OAuth implementation direction:** use a dedicated MCP authorization server, evaluating Cloudflare's Workers OAuth provider integrated with Auto3D's verified Supabase identity and consent page. The MCP client should receive a separate resource-bound, narrowly scoped grant, not the general Supabase user access token. Supabase's OAuth documentation states that OAuth access tokens have the user's normal data access, so direct issuance must not be assumed to enforce our `auto3d.read` and per-action permissions. Validate the existing HttpOnly cookie/session verification, account revocation, discovery, client registration, resource audience and scope handling end to end. Neither option is enabled or connected yet; do not enable it against production until the consent and account-isolation flow is implemented and tested. [Supabase OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows) · [Cloudflare MCP authorization](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/).

Routing must use the verified stable Auto3D user ID, not the email, a display name, a session ID supplied by the agent, or the apparent ChatGPT identity. Account linking and workspace pairing are two different decisions:

1. The user opens Auto3D, signs in, and chooses **Connect agent** in the desired workspace. The app registers the authenticated browser connection and its open session IDs; the user sees the connection state and can disconnect it.
2. The user connects the Auto3D MCP URL in ChatGPT and approves the OAuth grant on the Auto3D authorization page. The service matches the OAuth subject to the same verified account that owns the active browser connection.
3. If exactly one eligible session is connected and the user has enabled automatic pairing, connect it automatically. If no session is connected, report that the user must open or connect Auto3D. If multiple tabs or sessions are eligible, show a picker or ask the user to choose; do not silently select another scene. The user may designate or change a default explicitly.
4. Bind the grant/client, account, browser connection, session, permissions and a short-lived pairing lease on the server. Every operation validates that binding. Account changes, sign-out, revocation, tab closure, session closure or lease expiry immediately invalidate routing. If the browser reconnects, re-establish and verify the binding; do not infer a new target from an old session ID.

### Identifying windows and sessions

Show a connection picker with a separate row for every open Auto3D **browser tab** and expandable entries for that tab's in-app sessions. Each row shows a user-editable device/window label, browser family where available, session name, active/connected status and last activity. A randomly generated browser-instance ID identifies a tab connection; the existing in-app session ID identifies each document inside it. Neither ID is a secret or sufficient proof of ownership. A newly opened browser tab receives a new instance ID; session IDs must not collide across tabs. The user can rename a window label and designate an explicitly approved default, but the server must never use labels as identities.

Pair a grant to a specific `(account, browser instance, in-app session)` tuple. When more than one eligible tuple exists, ask the user to choose unless an approved default is still connected and valid. Once a request is queued, retain its original tuple even if the user switches the app's active session; do not silently retarget. A command targeting an inactive session must either be supported explicitly without disrupting the current session, or fail with a clear switch/connect instruction. If the target closes, disconnects, expires, or changes owner while a request is in flight, report disconnection or an unknown outcome as appropriate; do not replay it automatically on a newly connected session. Visible connection controls show the selected tab and session and support revocation independently for each grant.

OAuth can link the client and account, but do not promise that the server can uniquely identify a particular ChatGPT conversation unless the client actually exposes a trustworthy identifier. Treat the authenticated connection/grant as the actor, show which session it is linked to, and require explicit selection when ambiguous.

## Architecture

```
ChatGPT  ── OAuth + MCP over HTTPS ──>  MCP Worker
                                           │ verified account + scopes
                                           ▼
                                  session broker / coordinator
                                           │ authenticated WebSocket
                                           ▼
                                specific Auto3D tab + session
                                           │ strict command ID + arguments
                                           ▼
                              existing command registry / services
```

- Use a dedicated Cloudflare Worker with current MCP Streamable HTTP support and OAuth resource-server validation. A Durable Object or equivalent stateful coordinator can maintain user-scoped session presence, pairing, message delivery and request state; the MCP endpoint itself need not be stateful.
- Define a secure browser-to-broker WebSocket handshake based on the existing verified Auto3D login, origin validation, a short-lived connection credential, and explicit account/session authorization. The connection credential is distinct from provider secrets and is not a substitute for the user's grant.
- Generate or adapt MCP schemas from the existing strict command catalog, but maintain a reviewed capability inventory with scope, mutation impact, cost, privacy, confirmation requirements, and actual completion semantics. Avoid exposing internal administrative or credential-handling tools automatically merely because they exist in the catalog.
- Calls carry an opaque session reference, command ID, schema-validated arguments, unique request ID, expiry and grant context. The browser verifies the request and calls the shared registry or the same underlying service used by UI controls. No arbitrary JavaScript, simulated clicks, or model-chosen server URLs.
- Return structured results and progress. For large previews or files, use an authenticated short-lived retrieval mechanism with ownership checks; never place credentials or private raw model data in tool logs. Treat model descriptions, documents, images and other content as untrusted input rather than agent instructions.
- Bound queues, request size, frequency and execution time. Track idempotency and operation outcomes; never blindly replay a timed-out mutation, render, upload or billable AI request. Distinguish queued, running, complete, failed, cancelled and outcome-unknown states.

## Milestones and exit criteria

### 0. Capability inventory and foundations

**Deliver:** inventory all UI functions and current commands, map each to a shared service and an MCP capability, and identify interactive-only gaps. Classify permissions, costs, sensitivity, Undo support, required user gestures and expected output. Define a versioned command/result contract and compatibility policy.

**Done when:** every user-facing function is accounted for as an existing callable service, a required implementation task, or a documented platform/provider limitation, with an owner and acceptance test. Identify what remains blocked by the draft 0.46.0 changes, including Z-up migration and Cloudflare Meshy secret setup.

### 1. Identity and connection

**Deliver:** compatible OAuth discovery and consent using the existing Auto3D identity; a revocable connection grant; session broker and secure browser pairing; session picker, status and Disconnect in Auto3D.

**Done when:** the same Auto3D account can connect from ChatGPT, exactly one opted-in session can pair automatically, multiple sessions require an explicit/default choice, and account mismatch, expiry, sign-out and revocation reliably prevent access. Test separate accounts, tabs, devices, stale IDs and disconnects.

### 2. Read-only live pilot

**Deliver:** session list and selection; scene, selection, dimension/CAD, board, material, camera, animation, render status and Library metadata inspection; safe snapshot capture when explicitly authorized.

**Done when:** ChatGPT can identify the intended active session and answer questions against its live state; no mutation is possible through read-only grants; two accounts cannot see each other's sessions or data. Verify in the MCP inspector and a supported ChatGPT custom MCP connection.

### 3. Live workspace and design controls

**Deliver:** reversible selection, view, camera, object transforms, groups, arrays, scene and session controls; Packaging generation, ID/OD and board settings, CAD selection/edit/apply, materials and appearance, lighting, and history. Implement missing service commands rather than merely exposing UI clicks.

**Done when:** a user can ask for a box with specified dimensions, inspect its CAD and board values, modify it, view the result and Undo/Redo. Tests confirm the same units and engineering results as manual operation; input validation, read-only, modal/busy and account guards remain effective. Multiple sessions cannot be confused.

### 4. Animation, rendering and AI workflows

**Deliver:** fold/unfold and manual-position controls; timeline actions and playback; foreground/background render queue, progress, cancellation and retrieval; AI generation, preview, texturing and project handling through server-only provider credentials. Report when a provider lacks an API capability rather than substituting a billable operation.

**Done when:** the assistant can start, monitor and cancel supported work, report actual state, and retrieve the result with permission. Reconnection, duplicate requests, user camera takeover, timeouts and failures do not silently repeat changes or incur duplicate charges.

### 5. Complete coverage and sensitive actions

**Deliver:** remaining application functions from the milestone-0 inventory, including Library, save, import/export, account and administrative workflows where the user is authorized. Provide explicit confirmation for external publication/sharing, deletion, uploads, chargeable provider calls and access-control changes. Clearly distinguish an action requiring user input from one that has completed.

**Done when:** each inventory item is implemented and tested or explicitly documented as a genuine platform/provider limitation. Scopes and user controls can enable or revoke capability groups; audit records contain actor, session, action, time and outcome without credentials or unnecessary content.

### 6. Pilot, hardening and rollout

**Deliver:** private pilot, security review, reliability/load tests, operational dashboards and runbooks, connection/disconnection UX, documentation and rollback plan. Validate ChatGPT workspace access, OAuth registration/discovery, origin/cookie behavior and hosting configuration in a real deployment.

**Done when:** isolation, revocation and idempotency tests pass; failure and recovery behavior is clear; users can inspect and end connections; and the actual deployed MCP connection passes end-to-end tests. Deploy only after these checks and normal release review.

## Security and operational requirements

- Never send Auto3D passwords, Meshy API keys or provider refresh tokens through tool arguments or assistant-visible outputs. Meshy generation uses a server-held key. The MCP OAuth token and browser login cookies have separate audiences and lifecycles.
- Enforce permissions on the server and again at the browser/service boundary. OAuth identity and the paired live session must match; account ID headers and user-supplied session labels are not proof.
- Grant only requested capability groups, with visible consent and revocation. Use per-action confirmation where actions can spend money, publish, share, delete, or change access. Respect admin authorization independently of ordinary workspace access.
- Preserve active-session selection; no fall-through to a different tab or user after disconnect. Do not automatically re-run unacknowledged operations.
- Separate client-visible status from diagnostic logs. Do not expose account secrets, document content or model data unless an authorized tool explicitly needs them.

## References

- [OpenAI: connect a custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [OpenAI: authenticate users](https://developers.openai.com/plugins/build/auth)
- [Cloudflare: remote MCP server and authorization](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)

## Implementation checkpoint

- Inventory: generated from the current 236-command catalog. Each entry still needs a security and functionality review; inventory generation alone does not complete milestone 0.
- Account provisioning: local changes seed default preferences during admin approval and retain first-sign-in recovery. Existing library data uses account-owned records and storage prefixes.
- AI isolation: local server changes associate newly created provider tasks with their verified account, filter history, check task derivation and model downloads, and provide an owner-scoped cloud archive API with revision conflict detection. The database migration has been tested locally, but has not been applied to production. Automatic cloud restore/save and conflict resolution are not wired into the AI workspace. Existing provider tasks have no trusted ownership record and need an authorized recovery process.
- MCP: local read-only SDK, protocol and routing prototypes have tests. An account-bound consent handler and identity adapter use the existing Auto3D login verifier and the official OAuth provider interface; they are not connected to a deployed authorization server. Explicit account-scoped session selection and browser sign-out handling are prototyped. Real OAuth provider integration and account-status checks, durable coordination, connection UI, live browser endpoint, and production deployment remain outstanding. All mutation and high-impact capabilities remain outside the prototype.
- Operations: shared provider credentials must remain disabled until the task reference surface and account isolation receive a complete security review, the migration and browser integration are ready, and recovery and cleanup procedures are in place. Task submission can succeed even if ownership recording fails; the system reports that state and must not automatically retry.


### Current implementation checkpoint (November 2026)

- The authorization service uses Cloudflare's OAuth provider and same-site Auto3D login continuation; a local test executes the real provider through PKCE, token validation, and authorization-code replay rejection using an in-memory KV and a Node Workers shim. This is not a live Cloudflare runtime test.
- Per-account Durable Object, authenticated browser gateway, read-only resource composition and private binding adapters have been written and their entry points bundle. Unit tests emulate hibernation attachments and persisted state; production Worker bindings, real WebSocket hibernation/restart behavior and end-to-end ChatGPT connection are not verified.
- Browser connections currently expire after five minutes. Renewal, immediate server-side browser-session revocation, durable request/pairing cleanup, connection UI, and user-managed grant revocation remain open. No production route, KV namespace, secrets, or migrations have been provisioned for this connector.
- Provider client metadata document support requires the `global_fetch_strictly_public` compatibility flag. Review redirect/origin behavior, OAuth PKCE, grant/account revocation, quotas and cost, and perform a security review before enabling public access. Mutation and high-impact tools remain unavailable.


### Screen capture

`capture.image` reuses the existing Auto3D viewer/workspace capture command. An MCP client must request `auto3d.capture` in addition to `auto3d.read`; the consent page identifies screenshot sharing. The image is returned as MCP `image` content, with bounded payload size and no base64 duplication in structured text. Local tests cover denial without the scope, consent, payload limits, the broker path, and a real OAuth-provider integration with simulated browser sockets. The connector and screenshot sharing are not yet deployed or verified in a live ChatGPT session.


### Connector setup checkpoint

Same-origin Pages proxy routes and an explicit account-dialog window-connection control are implemented locally. The checked Cloudflare account contains the `auto3d` Pages project at its current pages.dev address; production does not yet have MCP service bindings. The existing Supabase secret cannot be recovered from Pages for Worker provisioning. Complete identity-service/secret design, session renewal and revocation, real Workers runtime and WebSocket tests, deployment configuration, and security review before deploying or advertising a connector URL. Until then the routes fail closed and local connection control cannot connect to production.

### Cloudflare staging resources

A private staging OAuth KV namespace (`auto3d-mcp-oauth-staging`) and four Workers (`auto3d-mcp-auth-staging`, `auto3d-mcp-resource-staging`, `auto3d-mcp-gateway-staging`, `auto3d-mcp-broker-staging`) have been provisioned through the Cloudflare connector. The broker's SQLite Durable Object namespace exists. The resource Worker is bound to the private auth service and broker, and the gateway is bound to the broker. The auth Worker has a server-generated consent secret and KV binding; its value was not returned to chat. Cloudflare reports workers.dev and preview URLs disabled for all four.

These are staging infrastructure, not a usable connector. The auth, gateway, and resource Workers do not have the Supabase server configuration required for verified sign-in and account checks. Existing Pages secret values cannot be retrieved for duplication. Production Pages has no MCP service bindings and has not been redeployed for this setup. Complete a server-only identity/secret provisioning design, session renewal and revocation, real Cloudflare runtime tests, and security review before attaching routes or issuing a connector URL. Do not rotate the staging consent secret on routine redeployments without planning the effect on outstanding consent transactions.

The Supabase project URL has been added as a non-secret environment variable to the three staging Workers. Their existing private bindings and the authorization consent secret were preserved, and public Worker addresses and previews remain disabled. A dedicated Supabase `sb_secret_...` key still must be provisioned securely as `SUPABASE_SECRET_KEY` to each of those Workers; the existing Pages secret is not retrievable. No secret value should be entered into chat, source control, or browser code.

### Staging identity binding check

The three staging Workers now have `SUPABASE_SECRET_KEY` bindings. Cloudflare initially reported these as plaintext variables; the bindings were converted to encrypted `secret_text` without returning their values, and the other bindings were preserved. Cloudflare confirms the Workers remain private. Read-only Supabase inspection confirms that `auto3d_account_controls` and `auto3d_session_active(uuid, uuid)` exist. This verifies configuration presence, not that each secret is valid or that an end-to-end Worker request succeeds. Real-runtime identity and WebSocket tests remain required before connecting production.

Cloudflare version metadata confirms an earlier auth Worker version retains `SUPABASE_SECRET_KEY` as a `plain_text` binding. The currently active staging bindings are `secret_text`, but the staging Supabase key should be rotated before any live use; historical configuration may remain accessible to account administrators. Never output the value while inspecting or rotating it.

### Runtime test attempt

After the user rotated the staging Supabase key, Cloudflare showed a newer resource Worker version and `secret_text` bindings on all three identity-dependent staging Workers; Worker public addresses and previews remained disabled. Secret binding metadata cannot establish whether the values match or are valid. The 36 MCP tests and 6 connection/capture tests passed, and the live database session function rejected a nonexistent session. A private, scheduled Cloudflare runtime diagnostics Worker was created with no public URL, but its accepted schedule produced no result during the test window. The temporary schedule, diagnostics Worker and diagnostics KV namespace were removed. Cloudflare runtime, actual secret validity, live OAuth and WebSocket session tests therefore remain outstanding.

### Access controls and delayed runtime check

An account-scoped grant listing and explicit revoke action are now implemented locally in the account dialog, using the OAuth provider's grant API. The app clears the list on account changes, and the server requires a verified identity and same-origin revoke request. Unit tests and an integration test using the real OAuth provider cover account isolation and revocation; Workers KV propagation and real-runtime revocation have not yet been tested. These changes are not deployed.

The staging runtime diagnostic uses private named service entrypoints that check Supabase access without returning a secret, plus a private scheduled Worker and separate short-lived results namespace. At the user's request, the check was scheduled for 2026-11-02 19:41 UTC, after Cloudflare's documented propagation window. Retrieve only the resulting statuses, then remove the temporary schedule, diagnostic Worker, and results namespace, and remove the temporary diagnostic entrypoints while preserving all existing secret bindings. The test is not a full ChatGPT or WebSocket end-to-end test.


### Client interoperability

The read-only endpoint follows MCP Streamable HTTP and OAuth discovery, with the minimum `auto3d.read` scope included in the authentication challenge. Local SDK clients have tested handshake and session routing under two different host identities. Actual ChatGPT, Claude, VS Code/Copilot and other client integrations have not been verified. GitHub currently documents an OAuth limitation for repository-configured Copilot cloud agent and code review; see `docs/auto3d-mcp-clients.md`. Screenshot sharing requires the separately granted `auto3d.capture` scope.


### Local renewal and grant controls

The local browser connection now renews its short lease through a same-origin endpoint after revalidating the original Supabase session. The broker binds renewal to that verified session fingerprint, the original window instance, and the existing connection; it rejects expired or changed sessions and does not retarget. Local tests cover account/session mismatch, expiration, same-window renewal, and retained pairing. The account dialog locally lists and revokes OAuth grants with explicit user confirmation. These changes have not been deployed to the staging Workers or tested in the actual Cloudflare runtime. The access-token lifetime can still require explicit session reselection after token refresh; validate this during the pilot.

The user requested that the scheduled Cloudflare check wait through the propagation window and that Claude and Copilot be considered. A one-time follow-up is scheduled after the private diagnostic should run. Local interoperability work now includes a minimum-scope OAuth challenge, optional `offline_access`, SDK Streamable HTTP tests, verified-session-bound connection renewal and explicit grant management. None of those newer changes has been deployed to staging. See `docs/auto3d-mcp-clients.md` for client-specific limitations and the actual-client test requirements.

### Private runtime diagnostic result

Cloudflare's staging diagnostic ran at 19:41 UTC on 2026-11-02. Authorization discovery and protected-resource metadata returned 200 with matching identifiers; unauthenticated resource and gateway requests returned 401; the per-account broker responded with an empty session list. All three Workers reported that their configured credential did not have the `sb_secret_` format, and both Supabase Auth Admin and a server-only PostgREST request returned 401. No key value was returned. This means the deployed staging connector cannot currently verify account identity. The temporary schedule, diagnostics Worker and diagnostics KV namespace were removed after collecting the result; the four private staging Workers were retained. The duplicate scheduled follow-up was disabled. Actual OAuth sign-in, user/session pairing, screenshot delivery and real client connections remain untested.

The local agent indicator shows the authorized OAuth client's registered display name in its paired Auto3D window, scoped to the signed-in account and selected session. Client names without a verified client domain are marked as client-reported; they are not proof of a vendor's identity. The indicator reflects an authorized pairing, not a transport heartbeat: if a client disconnects without notifying the broker, its label can remain until the access token expires. The window becoming ready for a connection does not itself activate the indicator. This UI and identity propagation have not been deployed or verified with a real external client.
