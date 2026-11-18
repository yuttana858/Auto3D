# Auto3D 0.89.0 / Packaging 1.15.0 / Primary Products 0.15.0 / Molded Pulp 0.3.0

Reliable macros, 24-hour agent pairing, read-only database auto-approval, and a one-line Advance animation toolbar. Based on main after #153 (0.88.0). No module changes.

The pairing and database commits were pushed to #148 after its head was read for merge, so #148 merged only the 0.84.1 Auto Pack fix. They are included here, and the pairing notes that were written for 0.85.0 are below.

## What changed

- **Steps wait for playback.** Commands such as `packaging.fefco.toggle` start an animation and return. Each macro step now waits until the viewer is no longer busy (up to 5 minutes) before the next step runs. Previously the next step failed with "The viewer is busy". `macro.cancel` also stops a run while it waits.
- **One Undo per run.** The history entries a macro adds are grouped into one Undo step, including the steps completed before a failure. One `history.undo` reverses the whole run. Grouping is skipped if the run itself undid or redid entries.
- **Tab changes only as the last step.** `session.tabs.new`, `session.tabs.switch` and `session.tabs.close` move the run to another tab, so later steps would act on the wrong scene. They are refused before any step runs, unless they are the last step. The check applies when a macro is run and when it is saved.
- **Delete and export saved macros.** New commands `macro.delete { name }` and `macro.export { name }` (export returns a portable JSON definition for `macro.save` in another browser). The Commands and macros dialog has **Delete saved macro** and **Export saved macro** buttons.
- **Replay warnings.** `macro.save` and `macro.export` return `warnings` for arguments named `id`, `…Id` or `…Ids` that hold a literal value (not a `$ref`, not a `nominal-` board). These usually exist only in one account or scene.

Macros are still stored only in this browser (`auto3d-macros-v1`). Account storage needs a new table and is the next step.

## 24-hour agent pairing and Live Control

Before this change a pairing was lost after 1 hour idle, when the user switched session tabs, and when the page reloaded. Each case needed a new window code.

- **24-hour pairing.** A pairing lasts 24 hours from pairing (`PairLifetimeMs` in `mcp/broker-core.js`), capped by the agent registration's own expiry. Inactivity no longer ends it early.
- **Pairing follows the window's active tab.** When the user switches session tabs, the pairing moves to that window's active tab. Another window or account still can't take it over: only the same connection, or the same window identity on the same login session, qualifies.
- **24-hour Live Control.** Turning Live Control on is remembered in that browser tab (`sessionStorage` key `auto3d-live-control`) for 24 hours, with the account, window identity and expiry. After a reload the window reconnects by itself with the same identity, so pairings resume without a new code. `agent.access.inspect` reports `liveControlUntil`.
- **Disconnect still means stop.** The Disconnect button, `agent.access.disconnect`, and signing out or changing account clear it, and the next Live Control uses a new window identity. Revoking an agent still ends it immediately.
- **Unchanged:** window codes stay single-use and valid for 10 minutes; connections renew every minute; OAuth scopes and account isolation.

## Read-only database auto-approval

`.claude/settings.json` auto-approves the read-only Supabase MCP tools (list and get projects, tables, migrations, extensions, branches and edge functions; advisors; logs; docs search; type generation; reading notebooks) for every Claude Code session on this repository. SQL execution, migrations, edge function deploys and secrets, branch changes, project create/pause/restore and notebook writes are listed under `ask` and keep asking each time.

## One-line Advance animation toolbar

The Advance animation panel used five rows for its controls (title and camera readout, Duration/Tween/Loop, three full-width keyframe buttons, Play/Reset, Auto-fit, then In/Out fields), with 7 px labels, white range inputs and a Close button floating outside the box. They are now one toolbar line (`.timeline_toolbar`, `role="toolbar"`):

**▶ / ❚❚ · ↺ · time** │ **Length · In · Out · Tween · Loop** │ **+ Scene · + Camera · + Fold** │ **Auto-fit fold · camera readout · Camera…** │ **×**

- Same handlers as before; every control keeps its accessible name (`Play`/`Pause`, `Reset`, `Keyframe scene state`, `Keyframe camera`, `Action`, `Camera settings`, `Close Advance animation`, `Timeline duration in seconds`, `Beginning/End of animation`, `Keyframe interpolation`, `Auto-fit folding camera`), so commands, agents and tests are unaffected. Longer explanations moved to tooltips.
- `CreateTimelineTracks (editor, parent, { ranges, camera })` puts the In/Out fields and Auto-fit into the toolbar groups; without slots it keeps its own rows.
- The panel is 300 px tall (was 330) with no inner border. On narrow screens the toolbar scrolls sideways and the Close button stays pinned in view.

## Validation

- Unit tests, including the new `test/macro-run.test.js` (playback wait, cancel while waiting, one Undo after success and after failure, tab-step rule, save/export/delete with warnings). Three tests that counted one Undo per macro step now expect the grouped step.
- MCP tests (73): a tab switch moves the pairing to the new active tab; routing, replay and revocation are still refused; a pairing survives an hour idle and ends at 24 hours.
- Browser `mcp-access`: Live Control reports a 24-hour expiry, a reload reconnects with the same window identity, and Disconnect clears it.
- Browser `animation`: the toolbar is one line (≤ 40 px), Close is in view, and every control is found by its accessible name. `animation-video`, `workspace-editing`, `module-panels` and `packaging-module` pass.
- Browser `command-design`: a macro creates a 0201, toggles the fold, then runs `view.fit` and `packaging.fefco.playback.inspect` (state `completed`). One Undo leaves an empty scene. A macro with a tab change before the last step is refused.
