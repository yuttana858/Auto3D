# Auto3D 0.85.0 — 24-hour agent pairing and Live Control

Auto3D 0.85.0 / Packaging 1.14.1 / Primary Products 0.15.0 / Molded Pulp 0.1.0. Based on main after #147 (0.84.0). This release also carries the 0.84.1 Auto Pack presentation fix; see [release-0841.md](release-0841.md). Not deployed.

## Why pairings kept dropping

A one-time window code pairs an agent with an Auto3D window. The pairing was then lost in any of these cases:
- **after 1 hour idle**;
- **when the user switched session tabs**, because the pairing was tied to one tab and refused it once it became inactive;
- **when the page reloaded**, because every page load and every fresh Live Control connect created a new random window identity;
- **until Live Control was clicked again** after a reload.

Each case needed a new code.

## What changed

- **24-hour pairing.** A pairing lasts 24 hours from pairing (`PairLifetimeMs`), capped by the agent registration's own expiry. Inactivity no longer ends it early.
- **Pairing follows the window's active tab.** The pairing belongs to the window it was made in. When the user switches session tabs, it moves to that window's active tab. Another window or account still can't take it over: only the same connection, or the same window identity on the same login session, qualifies.
- **24-hour Live Control.** Turning Live Control on is remembered in that browser tab (`sessionStorage`) for 24 hours, with the account, window identity and expiry. After a reload the window reconnects by itself with the same identity, so existing pairings resume without a new code. `agent.access.inspect` reports `liveControlUntil`.
- **Disconnect still means stop.** The Disconnect button, `agent.access.disconnect` and signing out or changing account clear the 24-hour Live Control. The next Live Control uses a new window identity, so old pairings can't resume. Revoking an agent still ends it immediately.
- **Unchanged:**
  - window codes stay single-use and valid for 10 minutes; they are only the pairing handshake;
  - the connection is still renewed every minute (connection records expire after 5 minutes);
  - OAuth scopes and account isolation.

## Validation

- **MCP tests (73):**
  - a tab switch in the paired window moves the pairing to the new active tab;
  - routing, replay and revocation are still refused as before;
  - a pairing survives an hour idle and ends at 24 hours, without revoking the registration.
- **Browser test `mcp-access`:**
  - Live Control reports a 24-hour expiry;
  - a reload reconnects by itself with the same window identity and the same expiry;
  - Disconnect clears it.
- **Totals:** 1,012 unit and 89 Packaging module tests pass. Lint, lint_mcp and builds pass. The `mcp-consent`, `command-bar`, `messenger-ai-history`, `workspace-commands` and `packaging-auto-pack` browser tests pass.
