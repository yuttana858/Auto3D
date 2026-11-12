# Auto3D 0.59.1 — full access chosen on the consent page

Packaging remains 1.10.7 and Primary Products remains 0.10.0. PR #101, based on main after merged PR #100 (0.59.0). Not deployed.

## Problem

An MCP client still received a read-only grant when it requested only `auto3d.read`. This happened, for example, when the client was connected before 0.58.1 started advertising `auto3d.write`, or when the client chose its own scopes. Clients then listed just the basic read tools and session controls, so the user could not give the agent full access from Auto3D.

## Change

- The OAuth consent page has an **Access for this agent** section with two checkboxes, both ticked by default whatever the client requested:
  - **Full access** grants `auto3d.write`, which exposes every catalog tool.
  - **Screenshots** grants `auto3d.capture`. The app window must still allow screenshots separately.
- Unticking a box grants less than the client asked for, so a write request can be narrowed to read-only.
- The page lists the requested permissions and says when the client asked only for read access or did not ask for screenshots.
- `GrantedScopes` (`mcp/common.js`) turns the form into the approved scopes. `auto3d.read` and `offline_access` follow the request. A form without the hidden `permissions` field keeps the requested scopes. The checkbox fields must be `1` and may appear at most once, otherwise the form is rejected.
- The same scopes are stored on the agent registration and passed to `completeAuthorization`, so the broker's own write and capture checks match the token. The Cloudflare OAuth library allows approving more or fewer scopes than requested, as long as each is one it supports.

## Upgrade note

To give an existing read-only grant full access, revoke it in Agent access and reconnect the MCP client. Then approve the consent page with **Full access** ticked.

## Validation

`npm run test_mcp`: 66 passing. A new test checks that the form defaults are ticked, that a read-only request plus Full access and Screenshots returns a token and registration with `auto3d.write` and `auto3d.capture` and lists `auto3d.commands.invoke` and `capture.image`, that unticking narrows a write request to read-only, and that an invalid checkbox value is rejected. Without the source change, 2 tests fail. The `mcp-consent` browser test now checks in Chromium that both boxes are ticked and that the exchanged token has the full scope set.

## CI fix carried from 0.58.1

The Command bar button that 0.58.1 (PR #97) added to the tool strip was missing from the right-click context menu. That broke the `workspace-commands` browser rule that every tool strip action is also in the context menu. **Command bar** is now the last context-menu item. Like the other items it is disabled while the app is busy, and it stays available to read-only viewers. `workspace-editing` lists the new item, and `commandtext` unit tests still check that every menu item is disabled while busy.
