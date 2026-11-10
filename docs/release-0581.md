# Auto3D 0.58.1 — MCP write scope advertised, closable command bar

Packaging remains 1.10.7 and Primary Products remains 0.9.0. PR #97, based on main after merged PR #98 (0.58.0). Not deployed.

## Problem

An MCP client connected through OAuth could browse all six catalog families (284 commands in 25 categories) but could not run any of them. Every grant was read-only, so `auto3d.commands.invoke` was never listed.

The cause was in `mcp/resource-handler.js`. The resource server was configured with `requiredScopes : ['auto3d.read']`. The Cloudflare OAuth library publishes that list as the protected-resource `scopes_supported` and as the `scope` of the unauthenticated 401 `WWW-Authenticate` challenge. MCP clients choose the scopes to request from those two sources before the authorization server's full `scopes_supported`, so they requested only `auto3d.read`. The consent page then showed the read-only wording. Write-gated calls returned an ordinary `permission_required` tool error, which gives clients no standard signal to re-authorize. The existing tests did not catch this because they hand-pick `auto3d.write`, as does `docs/diagnose_mcp_discovery.mjs`.

## Change

- `ResourceScopes` (`mcp/common.js`) is `['auto3d.read', 'auto3d.write']`. The resource metadata and the 401 challenge now advertise both, so clients request write access and the consent page shows the existing full-access warning. The library only publishes these scopes; it does not require them on tokens. Read-only grants keep working, and `PilotService.Assert` still requires only `auto3d.read`.
- `auto3d.capture` is not advertised. Screenshot access stays an explicit opt-in that also needs the window's screenshot setting.
- Write-gated tools (`auto3d.commands.categories`, `.list`, `.invoke`, `auto3d.headless.fefco`, and the save and delete actions of `auto3d.headless.projects`) throw `MissingScopeError ('auto3d.write')`. When a call from a read-only grant hits one, `/mcp` answers HTTP 403 `insufficient_scope`. Its `WWW-Authenticate` challenge names the grant's current scopes plus `auto3d.write` and links the resource metadata (MCP step-up authorization). The broker still enforces the write scope on its own.
- `docs/mcp-pilot.md` records the advertised scopes and corrects the catalog count from 261 to 285 (284 on main, plus `ui.command_bar` below).

## Interface updates

- **Command bar can be closed.** The typed command bar at the bottom of the viewer has a × (Close command bar). A new **Command bar** button at the bottom of the right tool strip shows or hides it and is highlighted while the bar is open. Typed text and history are kept while it is hidden, and the choice is remembered on this device. The status line lives in the bar, so it is hidden too while the bar is closed. The new agent command `ui.command_bar` (`{ visible?: boolean }`, toggles when omitted) uses the same function and returns `{ visible }`.
- **MCP connections lists only active connections.** Revoked and expired registrations are no longer listed, and "No active connections." is shown when none remain. Active ones keep their Revoke button. `agent.registrations.list` still returns every registration.
- **"Connect this window" is now "Live Control".** Only the button label changed. The `agent.access.connect` command is unchanged, and its description now names the button.

## Upgrade note

Existing read-only grants are unchanged. Revoke such a grant in Preferences → Agent access, or let the client re-authorize through the step-up challenge, and approve the write-access consent.

## Validation

`npm run test_mcp`: 64 passing. The new assertions check the advertised `scopes_supported` and the 401 challenge scope, check the 403 step-up challenge and its complete scope list for a read-only `auto3d.headless.fefco` call, check that a read-only delete is refused while the project remains, check that the read-only tools are still listed, and check that the service error names `auto3d.write`. Without the source change, 5 of these assertions fail.

New browser test `command-bar` (added to the CI browser suite) covers closing and reopening the bar from its × and the tool strip button, the button's position and pressed state, `ui.command_bar` (show, hide, toggle, invalid input), persistence across reload, and the MCP connections list (revoked and expired hidden, Live Control label, empty state). `mcp-access` now clicks Live Control. `command-design`, `module-panels`, `feedback` and `command-bar` pass locally; `mcp-access` cannot load its `pages.dev` origin through this sandbox's proxy, before and after this change, and is outside the CI browser suite. App/module tests: 803 passing; MCP tests: 64 passing; application and MCP lint are clean.
