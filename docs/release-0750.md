# Auto3D 0.75.0 — connected AI prompt, SWIS branding and Auto Pack

Auto3D 0.75.0 / Packaging 1.11.0 / Primary Products 0.15.0 / Molded Pulp 0.1.0. Based on main after #134 (0.74.0). PR #136 stacks three workstreams so they share one CI run and one merge:

- connected AI prompt and SWIS branding (committed to the #134 branch after it merged);
- Auto Pack from #135, which also used 0.75.0 and raises Packaging to 1.11.0;
- the local Parasolid converter download from #137 (docs only).

Not deployed.

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

## Auto Pack (from #135)

Packaging has Packaging / Auto tabs. Auto shows the selected static product's world-axis bounding box (W=X, L=Z, H=Y) and planned RSC inside dimensions in the account's display units. Measurements include object translation, rotation and scale and use canonical millimeters without display rounding. Select exactly one complete, visible, static mesh object with known scene units. Animated, partly hidden, planar, missing and oversized products are rejected. The existing RSC generator's size/caliper limits still apply.

Auto Pack uses 0.001 inch (0.0254 mm) clearance per product face. Usable dimensions grow by 0.002 inch overall. The existing RSC has an internal glue tab; its intrusion needs one additional board caliper along the longer horizontal dimension. The UI identifies this reserve. The current generator board caliper is used; there is no silently enlarged manufacturing tolerance or smaller-than-supported fallback.

The unfolded finite-caliper blank is positioned beneath the stationary product. One inner bottom flap stays fixed while its adjoining wall rises; remaining walls wrap around the bounding box, other base flaps close beneath it, and top flaps close above it. The same route works in reverse. The product's geometry, transforms, materials and identity are unchanged.

A preflight audits 3,601 poses against both product bounds and other carton panels. Every displayed pose is also checked before rendering. The audit samples less than one degree of hinge movement per interval; it is not a proof of continuous collision freedom or certification of real board compression/production tolerances. Colliding combinations are rejected. Auto Pack uses exact panel surfaces instead of cosmetic paper bow and crease arcs, which can protrude beyond the audited envelope at this small clearance. Existing board textures remain.

Pause, Resume and Cancel are available in Auto. Cancel restores the flat carton. Generation and completion are separate Undo steps: Undo first restores the unfolded carton, then removes it. Saving/exporting is blocked during preparation and playback. Saved metadata retains the specialized fold route through sessions, fold/unfold, preview and timeline controls. A moved, resized or replaced product/carton blocks another fold until Auto Pack is regenerated. Fitted carton geometry/CAD dimension edits also require regeneration; materials can still be edited.

Only the selected product is protected by the fit audit; other scene objects are not packing obstacles. The first release fits an axis-aligned bounding box, not nested products or a minimum-volume orientation search.

### Auto Pack commands

- `packaging.tab({tab:"auto"})` opens the Auto tab without creating geometry.
- `packaging.auto.inspect({})` returns product bounding dimensions, RSC inside dimensions, usable dimensions, glue-tab reserve and clearance in mm.
- `packaging.auto.generate({duration:8})` creates the blank and starts fitting/folding.
- Existing `packaging.fefco.playback.inspect`, `packaging.fefco.control`, `packaging.fefco.animate`, fold check and scrub commands operate on the generated carton.

These are shared UI/agent/MCP services with strict schemas and existing session/account/read-only checks. No upload or publication occurs.

### Validation (Auto Pack, from #135)

Implementation commit: `6f9686cda10a43889c4d3b2ce765546324b4a6e3`, based on main `2b8e1b3` (PR #133). Version 0.75.0 avoids the versions already used by the separate open 0.73.0 and 0.74.0 workstreams; those unmerged features are not included here.

- Full local unit/integration suite: 910 passed before the final fold-completion account/session guard. After that guard and its new regression, all 35 Auto Pack and existing fold/unfold integration tests passed.
- MCP suite: 72 passed, including catalog, scope and account isolation checks.
- Lint, production website build, Pages build and standalone Packaging build passed.
- Production-bundle Chromium regression passed: actual Auto tab and Auto Pack/Fold buttons, transformed model bounds, glue-tab reserve, inch/mm display, mobile layout, Pause/Cancel to flat, replay to closed, saved fit summary, unchanged product and two Undo steps. No page errors. Added to the browser CI manifest.
- Final-render account/session-switch regression confirms no old-document history or selection leaks into a newly opened session.

Hosted full-suite CI and deployment are pending. Keep the development PR in draft under the repository's Actions cost-control process; local results do not substitute for a passing hosted gate.

## Lighter CI gate

- **Ready PRs** run validation and a quick **browser smoke suite** (`test/browser/smoke-suite.txt`, 10 tests: sign-in, workspace, module panels, command bar, Messenger AI, AI creations, Packaging and MCP consent). That's one browser job instead of three.
- **The full browser suite** (all of `ci-suite.txt`, three shards) runs only on request: the `full-ci` PR label, or a manual CI run (suite `full`, the default). Adding other labels neither starts nor cancels CI.
- **One runner.** `tools/run_browser_suite.mjs` runs a suite in CI and locally, and writes a pass/fail report tied to the commit. With `--serve` it also starts and stops the test servers. Unit tests check its options, the shard split, the report, and that every smoke test is also in the full suite.
- The Playwright Chromium download is cached between runs.
- **Test fix.** `module-panels` asserted that Packaging showed no tab list. Auto Pack's **Packaging tools** tabs are allowed now, while the old AI/Packaging tab strip must still stay gone. This was caught by the new smoke suite on the stacked branch.
- See [actions-cost-control.md](actions-cost-control.md#plan-for-a-private-repository) for minutes per run and the plan for a private repository.


Docs only: `docs/parasolid-local-converter.md` and a downloadable `docs/downloads/auto3d-parasolid-local.zip` with its SHA-256 checksum, for converting Parasolid files offline. No app code changes.
