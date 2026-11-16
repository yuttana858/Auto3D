# Auto3D 0.75.0 — connected AI prompt and SWIS branding

Primary Products 0.15.0, Packaging 1.10.7 and Molded Pulp 0.1.0 are unchanged. Based on main after #134 (0.74.0). These two changes were committed to the #134 branch after it was merged, so they ship here. Not deployed.

## Connected AI prompt: command bar and Messenger AI tab

- **One prompt.**
  - The Messenger **AI** tab composer now works like the command bar: a command runs, and other text goes to a connected agent.
  - With no agent connected, text typed in the AI tab is kept for the next agent that connects.
  - Both boxes use the shared `CommandBar.Submit` function.
  - The AI tab placeholder reads *Type a command or message an agent*. The line under the box shows the command result or the message state.
- **Messenger as history.**
  - Commands typed in either box are saved to the account's AI history with their success, alongside user messages and agent replies.
  - Messenger shows them as **Command ✓** or **Command ✗** with the command text, both live and in the date-grouped History view.
  - They are stored as user messages that start with `[command] ` or `[command failed] `, so no database change is needed.
  - App status lines are not saved.
- **Agent tools.**
  - New commands:
    - `messenger.ai.inspect`, the same as `ui.command_bar.inspect`;
    - `messenger.ai.respond`, the same as `ui.command_bar.respond`. The reply also appears in the Messenger AI tab and is saved to AI history.
  - With `messenger.ai.history`, these are now **direct MCP tools** for write grants. Read-only grants do not get them.
  - The descriptions of `ui.messenger`, `messenger.ai.history` and the two `ui.command_bar` commands explain the shared prompt.
  - See [mcp-pilot.md](mcp-pilot.md#ai-messaging-tools-and-the-messenger-ai-tab).

### Validation (connected prompt)

- The new `messenger-ai-prompt` unit suite (5 tests) checks:
  - commands run and are recorded with their success;
  - non-command text goes to an agent, or is kept for the next agent in the AI tab;
  - `@agent` text is routed to the agent;
  - empty, long and busy input is rejected;
  - the command history format;
  - commands and agent replies are saved, but status lines are not.
- MCP runtime tests:
  - the three messaging tools are listed for write grants only (the compact list limit is raised from 25 to 30);
  - `messenger.ai.respond` is dispatched to the paired window with write authorization;
  - an empty reply is rejected.
- The `messenger-ai-history` browser test:
  - types `fit` in the Messenger AI tab and in the command bar;
  - checks that both run, appear as **Command ✓** rows and are saved as `[command] fit`;
  - checks that `messenger.ai.respond` shows in Messenger;
  - checks that the History view shows the commands.


## Branding: Auto3D with the SWIS mark

- **No "SW" in the app name.** The visible name is now **Auto3D** in these places:
  - the header logo, the empty viewer and the loading dialog (`auto3d-logo.svg`; its view box is narrowed to fit the shorter name);
  - About in Preferences;
  - the agent consent page;
  - the development server message.
- **Unchanged on purpose.** These internal identifiers keep `SW Auto3D` / `sw-auto3d`, so existing saved sessions, recovery packs and the browser Library still open:
  - the saved-session `format` value;
  - the `sw-auto3d-library` browser database name.
- **SWIS mark.**
  - The Smurfit Westrock Innovation Systems mark is in `website/assets/images/`:
    - `swis-mark.png`, the original colours, for light backgrounds;
    - `swis-mark-dark.png`, with a light "SW", for dark backgrounds.
  - Each is cropped to the mark and 128 px high. The subtitle is replaced by the text "SW Innovation Systems".
- **Landing page.** The SWIS mark and "SW Innovation Systems" sit at the bottom right of the sign-in column, which still keeps the sign-in content centered. On phones it is centered under sign-in.
- **Main app.**
  - A 24 px grey strip in the toolbar colour runs along the bottom of the workspace, with the SWIS mark and "SW Innovation Systems" at the bottom right.
  - The mark follows the light or dark theme (`data-theme` on the root element).
  - The workspace height accounts for the strip, and the material and animation drawers open above it.
  - It is hidden behind the sign-in screen and in the mini shared viewer.

### Validation (branding)

- `engineering-landing` checks the landing brand text and that the image loads, and that no "SW Auto3D" text remains, at 1440 and 390 px.
- `selected-orbit` checks the strip text and that the workspace ends where the strip begins.
- The MCP runtime and `mcp-consent` tests check the "Auto3D" brand on the consent page.
- Browser tests `landing-signin`, `auth`, `material-surface`, `animation`, `workspace-editing` and `messenger-ai-history` pass.
