# Module panels

Candidate: Auto3D 0.38.0 / Packaging 1.8.0, PR #43.

AI Generative and Packaging Gen are independent right-side modules. AI appears immediately above Packaging in the vertical tool rail. The old AI/Packaging tab bar is removed. Packaging is lazy loaded when opened; AI retains its provider, prompt, inputs and recent creations without owning any Packaging controls.

Top-level Model upload (left), Model data, AI and Packaging share an upper-right **Extended / Minimal / Close** control group. Minimal uses a compact 320px dock, including the 40px tool rail on the right. Extended uses up to 760px/55vw, constrained by available viewport width. Extended Packaging arranges generation beside selected-box dimensions, appearance and playback; minimal stacks these groups with generation first. AI uses two content columns in Extended. Close hides content and leaves the rail/reopen toggle accessible. Each module remembers its last chosen open mode for this browser session. Switching modules preserves inputs, generation drafts, model state and playback. Width changes resize the viewer without changing its engineering model or camera snapshot.

Current behavior: left-side modules use Minimal and Close only. Extended is available to right-side modules; attempts to set Extended on a left-side module are rejected without changing state.

At narrow widths opening a dock closes the opposite dock. Viewport resizing also enforces that rule, and two Extended docks cannot crowd out the viewer. State is session-local, not a new server/account preference. Material editors, CAD dialogs and timeline drawers retain their specialized layouts; this shell standard is for top-level docked modules, not every nested subsection or pop-out window.

## Ownership and adding modules

- `source/website/modulepanels.js`: generic registration/state, shared chrome and side visibility only. `css/modulepanels.css`: shell and shared typography tokens.
- `source/website/aiworkspace.js` and `css/aiworkspace.css`: AI content and styles only.
- `modules/packaging/src/workspacepanel.js`: neutral Packaging panel built on FefcoPanel; `modules/packaging/src/packaging.css`: Packaging content styling. This API does not import Auto3D or account services.
- `source/website/packagingpanel.js`: lazy loading/host callbacks only. Scene refreshes use `website.packagingPanel`, independent of AI.
- Individual module files own their controls. Register a body and callbacks through `website.modulePanels.Register(id, { title, side, body, onOpen, onMode })`; do not copy generic header controls or append new content to AI. `onOpen` may load a module asynchronously; the shell keeps hidden modules hidden if the user switches during loading. No network generation is triggered by opening a panel.

Use `--workspace-menu-font-size` (12px), `--workspace-help-font-size` (11px), `--workspace-meta-font-size` (10px), and `--workspace-title-font-size` (13px) on both sides. Headings/help keep intentional roles while equivalent menu controls have equal computed sizes. Independent Packaging hosts may supply the same tokens; module styles retain sensible fallbacks.

## Shared commands

- `ui.ai`: opens AI only.
- `ui.packaging`: opens Packaging only.
- `ui.ai.packaging`: preserved compatibility alias to `ui.packaging`; no AI tab is opened.
- `ui.modules.inspect`: returns registered module IDs, modes and actual visibility.
- `ui.module.mode { module, mode }`: registered module ID plus `minimal`, `extended` or `closed`. Strict arguments are validated; unknown modules/modes do not mutate UI. Shared methods drive header buttons and commands. Opening a panel is interactive and does not generate, save, upload or publish anything.

Future modules register their own stable ID and use the generic mode command. Add feature-specific commands for their user actions. Session state and saved macros continue using stable commands rather than DOM selectors.

## Full-viewport extended mode (0.40.0)

ModulePanels moves the active module body and its shared header into one native modal dialog. The shell fills 100vw × 100dvh; the module content slides from the left, with a reduced-motion alternative. Native modal inertness blocks background buttons, focus and pointers; event containment and SessionEditor shortcut gating prevent scene actions. Minimal/Close restore the original DOM locations and preserve module state. Only one extended module may be active. Nested feature dialogs can still open above it. AI owns its viewer/history/input layout; Packaging owns all of its content and styles.

The shared application header and toolbar are temporarily placed at the top of the extended shell, above every module. This keeps its controls, including Undo and Redo, available while the underlying scene remains blocked. The module header and content slide in below the toolbar; minimizing or closing restores the application header and module content to their original locations. New modules inherit this layout by registering with ModulePanels.


## Primary Products (0.48.0)

The right-side `primary-products` module sits below Packaging in the same outlined Generation modules group. Its independently built content lives in `modules/primary-products`; `primaryproductspanel.js` owns only lazy loading, account-scoped draft state and host callbacks. `ui.primary_products` opens it and the existing `ui.module.mode` command controls Minimal/Extended/Close.

Registrations can set `animated: true` to opt into shared entry/exit motion. Primary Products does so: exit completes before hiding/restoring the DOM, superseded transitions are cancelled, and reduced-motion preference skips motion. Draft state remains owned by the module host and is not reset by layout transitions. Existing registrations retain their prior behavior.
