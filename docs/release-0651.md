# Auto3D 0.65.1 — agents talk through the command bar, deselect, live screenshot setting

Packaging remains 1.10.7 and Primary Products remains 0.14.0. PR #109 is a combined release: it is based on main after Auto3D 0.64.2 (#112) and also carries #110 (Auto3D 0.65.0 live product profile editor and CI consolidation, see [release-0650.md](release-0650.md)) and #113 (0.64.0 deployment record). Not deployed.

## Command bar as an agent channel

The status line above the command box now also carries messages between the user and a connected MCP agent.

- **Sending to an agent.** Text that starts with `@agent` (or `/agent`) is always sent to agents. While a window is connected with Live Control, any other text that is not a known command is sent too. The status line then reads "Sent to agent · waiting for a reply". With no agent connected, unknown text still shows the "Unknown command" error, so typos stay visible. `@agent` text is kept for the next agent that connects.
- **`ui.command_bar.inspect`** (`{ after?, limit? }`) returns the current status line, whether an agent is connected, `lastId`, and log entries newer than `after`. The log holds user messages, typed commands with success or failure, app status changes and agent replies, and keeps the last 100 entries. The draft the user is still typing is never included.
- **`ui.command_bar.respond`** (`{ message, replyTo? }`) shows `Agent: …` in the status line, reopening the bar if it is hidden without taking focus, and adds the reply to the log. `replyTo` must be a user entry still in the log. The next app status clears the agent styling.
- MCP has no push to agents, so an agent polls `ui.command_bar.inspect` with the last id it read.

## Other agent access

- **`selection.clear`** deselects every object, through the same `Select (null)` path as clicking empty space. Like `object.select`, it does not change the scene and is not marked as mutating. Move, rotate, scale, delete, duplicate, visibility and the rest were already available through `auto3d.commands.invoke` with full access.
- **Screenshot setting applies immediately.** Ticking **Allow screenshots from this window** in Agent access now applies straight away, and reopening the dialog shows the current setting. Previously it took effect only on the next Live Control, and the box always reopened unticked. Agents still cannot turn screenshots on themselves; that stays the user's choice.

The catalog has 306 commands.

## Validation

- `npm test`: 812 passing. `npm run test_mcp`: 66 passing. `npm run lint` is clean.
- `command-bar` browser test covers:
  - unknown text without an agent
  - `@agent` messages
  - log reads with `after`
  - replies, including invalid `replyTo` and empty-message rejection
  - reopening the hidden bar for a reply
  - styling reset on the next app status
  - `selection.clear`
  - the live screenshot checkbox
- `mcp-access` browser test (generated staging assets, simulated connection) covers a connected agent receiving plain command bar text and replying above the box.
- `workspace-commands`, `workspace-editing`, `feedback` and `command-design` also pass.
