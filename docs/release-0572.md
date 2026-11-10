# Auto3D 0.57.2 — MCP write scope advertised

Packaging remains 1.10.7 and Primary Products remains 0.8.1. PR #97, based on main after merged PR #96 (0.57.1). Not deployed.

## Problem

An MCP client connected through OAuth could browse all six catalog families (284 commands in 25 categories) but could not run any of them. Every grant was read-only, so `auto3d.commands.invoke` was never listed.

The cause was in `mcp/resource-handler.js`. The resource server was configured with `requiredScopes : ['auto3d.read']`. The Cloudflare OAuth library publishes that list as the protected-resource `scopes_supported` and as the `scope` of the unauthenticated 401 `WWW-Authenticate` challenge. MCP clients choose the scopes to request from those two sources before the authorization server's full `scopes_supported`, so they requested only `auto3d.read`. The consent page then showed the read-only wording. Write-gated calls returned an ordinary `permission_required` tool error, which gives clients no standard signal to re-authorize. The existing tests did not catch this because they hand-pick `auto3d.write`, as does `docs/diagnose_mcp_discovery.mjs`.

## Change

- `ResourceScopes` (`mcp/common.js`) is `['auto3d.read', 'auto3d.write']`. The resource metadata and the 401 challenge now advertise both, so clients request write access and the consent page shows the existing full-access warning. The library only publishes these scopes; it does not require them on tokens. Read-only grants keep working, and `PilotService.Assert` still requires only `auto3d.read`.
- `auto3d.capture` is not advertised. Screenshot access stays an explicit opt-in that also needs the window's screenshot setting.
- Write-gated tools (`auto3d.commands.categories`, `.list`, `.invoke`, `auto3d.headless.fefco`, and the save and delete actions of `auto3d.headless.projects`) throw `MissingScopeError ('auto3d.write')`. When a call from a read-only grant hits one, `/mcp` answers HTTP 403 `insufficient_scope`. Its `WWW-Authenticate` challenge names the grant's current scopes plus `auto3d.write` and links the resource metadata (MCP step-up authorization). The broker still enforces the write scope on its own.
- `docs/mcp-pilot.md` records the advertised scopes and corrects the catalog count from 261 to 284.

## Upgrade note

Existing read-only grants are unchanged. Revoke such a grant in Preferences → Agent access, or let the client re-authorize through the step-up challenge, and approve the write-access consent.

## Validation

`npm run test_mcp`: 64 passing. The new assertions check the advertised `scopes_supported` and the 401 challenge scope, check the 403 step-up challenge and its complete scope list for a read-only `auto3d.headless.fefco` call, check that a read-only delete is refused while the project remains, check that the read-only tools are still listed, and check that the service error names `auto3d.write`. Without the source change, 5 of these assertions fail.
