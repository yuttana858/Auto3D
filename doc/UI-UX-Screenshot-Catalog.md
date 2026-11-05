# Auto3D UI/UX screenshot catalog

## Provenance and scope

**Verified:** the user supplied ten desktop interface images in this conversation after the initial assessment. SC-01 through SC-08 identify the eight images in the message asking to catalog screenshots; SC-09 and SC-10 identify the Welcome and Preferences images in the following message. These IDs are stable source citations for this catalog. Capture time, browser/OS and exact viewport/device-pixel ratio remain **Unknown and requiring confirmation**. Uploaded-file dimensions and hashes for SC-01–SC-08 are now recorded in screenshots/index.json.

The images were initially inspected in chat. The subsequent uploaded screenshot.zip supplies eight original PNGs matching SC-01–SC-08, represented by seven unchanged originals and one labeled AI-assisted redacted Share reference under screenshots/. SC-09 Welcome and SC-10 Preferences remain chat-only because their files were not in that upload. No live automated screenshots were captured. SC-06 is an AI-assisted redacted derivative: its layout/text may differ from the original and must not be treated as pixel-exact evidence. See [included files](screenshots/README.md), [gallery](screenshots/gallery.html) and [image metadata/hashes](screenshots/index.json); these links resolve after extracting this handoff ZIP.

**Verified historical correction:** no interface screenshots were available during the initial source assessment. User-supplied visual evidence is now available. Historical statements in copied repository documents and the previous-response appendix describe the earlier evidence state. No live browser, paid-provider, permission-enforcement, or end-to-end operation testing was added by this review.

**Privacy/provenance:** the user requested inclusion of the uploaded original screenshots in this private-repository handoff. Seven are included byte-for-byte. SC-06 is replaced by a labeled AI-assisted redacted reference with code, URL and entire QR hidden; the unredacted Share original is excluded. Account identities and library labels remain visible in other originals. The textual analysis does not transcribe those values. No QR was decoded or depicted share opened. Avoid treating these originals as sanitized public examples.

## Screen register

| ID | User image | Screen/state | Visually verified | Handoff capabilities |
|---|---|---|---|---|
| SC-01 | Batch 1, image 1 | Empty workspace, both docks open, Render workspace | Dark shell, import affordances, accordion sections, empty render history, command bar | F01/F05/F09/F13/F17/F26 |
| SC-02 | Batch 1, image 2 | Empty workspace, both docks collapsed | Narrow edge rails and much wider viewport; header/command bar remain visible | F09/F10/F26 |
| SC-03 | Batch 1, image 3 | Packaging Gen before creation | Packaging v1.10.3, family 02, ID dimensions, board/closure selectors, four cards, fold slider | F20/F21/F22/F23 |
| SC-04 | Batch 1, image 4 | Generated selected 0201 box | Kraft appearance, cyan selection bounds, expanded part hierarchy, dirty marker, populated-scene toolbar | F02/F07/F20/F21/F22 |
| SC-05 | Batch 1, image 5 | Account Model Library modal | Three source tabs, folders/search, three cards, per-card actions, session save | F16/F17/F18/F19 |
| SC-06 | Batch 1, image 6 | Share model modal, link/QR present | Download checked, code required, generated-link controls, QR/export, revoke partly visible | F18 |
| SC-07 | Batch 1, image 7 | Extended AI Generative workspace, empty | Independent preview/history, project controls, generation settings and reference upload | F24/F25 |
| SC-08 | Batch 1, image 8 | HDRI lighting with generated box | Eight preset cards, background checkbox, brightness/rotation/elevation, Reset | F07/F09/F21 |
| SC-09 | Batch 2, image 1 | Welcome screen | Black backdrop, wireframe forms, branding/tagline, v0.47.6, click-to-continue prompt | Startup/identity UX |
| SC-10 | Batch 2, image 2 | Preferences modal | Display, AI connections, Tools, About/build, Administrator sections | F05/F15/F17/F25/F26/F27/F28 |

## SC-01 — empty workspace with open docks

**Source:** first screenshot in the eight-image message.

**Verified appearance:** header shows SW Auto3D, v0.47.6 and AI; Save, Library, dimmed Export, an Untitled session tab, new-session control, preferences gear, account display and Full screen. An upper toolbar shows history/import/link icons. Left Model upload includes drop target, Upload model and collapsed supported-formats text, followed by Session objects, Animation, Materials, Lighting, Camera and Rendering accordions. Center is an empty gradient viewer with branding and upload instruction, plus a world-axis indicator. Right Model data/Details shows Render workspace, scene-preview placeholder, Render in background, Start queue, Stop, Clear queue, selection/delete controls and No render jobs. A bottom command/status panel displays a recovery-discard message, command input, Run and Commands & macros.

**Inferred:** the dimmed Export state and sparse toolbar may depend on empty scene state. A still image does not prove disabled interaction semantics. The recovery message does not prove that an actual checkpoint was deleted successfully.

**Proposed preservation/acceptance:** retain clear import entry, empty-state instruction, status feedback, command discovery and access to rendering without a loaded scene. Verify actual disabled states, keyboard labels and status announcements in the rebuild.

**Implementation references:** source/website/website.js, sessioneditor.js, renderingpanel.js, commandbar.js, modulepanels.js; docs/rendering.md and docs/module-panels.md. Screen-to-file mapping is **Inferred from code responsibilities**, not a browser trace.

## SC-02 — collapsed workspace docks

**Source:** second screenshot in the eight-image message.

**Verified:** left/right content panels are not displayed; narrow edge controls and the right tool rail remain. Central viewer occupies most of the width. Header, world axes and bottom commands remain visible.

**Unknown:** exact collapse trigger, saved state, resize logic and whether the camera was preserved across the transition. Two still images do not demonstrate continuity.

**Proposed acceptance:** collapse/reopen each dock independently; preserve object/document state, camera and command access; test keyboard focus and narrow/mobile layouts separately. Do not treat this desktop image as mobile evidence.

**References:** modulepanels.js, panelset.js, docs/module-panels.md; F09/F10/F26.

## SC-03 — Packaging Gen setup with no model

**Source:** third screenshot in the eight-image message.

**Verified:** Packaging v1.10.3 label; FEFCO catalog; family 02 · Slotted boxes; Box Dimensions basis Inside (ID); Width, Length, Height numeric fields; nominal B-flute 3 mm board dropdown plus gear; Closed · shipping box selector; four cards labeled 0201 RSC, 0200 HSC, 0202 OSC, 0203 FOL. RSC card has an accent border. Realistic board surface is collapsed. Fold/unfold slider and dimmed Unfold are visible below. Viewer remains empty.

**Verified numbers:** displayed dimension fields use long decimal strings around W 11.811024, L 15.748031 and H 9.84252. No unit suffix is visible beside this field row. SC-10 separately verifies a Standard (in) preference; it does not establish that the preference was unchanged across every capture.

**Inferred:** values are consistent with inch display of approximately 300 × 400 × 250 mm; card highlight alone does not prove a model already exists or the exact generation event.

**Proposed acceptance:** retain four supported designs, explicit basis/material/closure, draft-versus-committed distinction and generation guards. Make display units explicit near dimensions and use readable precision while preserving canonical values. Verify defaults from services/tests, not this selected state.

**References:** modules/packaging/src/panel.js, catalog.js, fefco.js, engineering.js; source/website/packagingworkspace.js; F20–F23.

## SC-04 — generated box selected in scene

**Source:** fourth screenshot in the eight-image message.

**Verified:** a closed-looking kraft box occupies the viewport with cyan selection/bounds lines. Mesh tree exposes a FEFCO 0201 object and named walls/base/top flaps; one row is highlighted. Toolbar is populated; Export is visibly brighter than in empty-state images. Session tab has a dirty-state dot. Bottom status reports adding a FEFCO 0201 object with millimeter values rendered at excessive decimal precision. Packaging panel still shows the configured catalog and a Measure section lower down.

**Unknown:** exact selection granularity, closure success, physical dimensions, watertightness, collision clearance and whether dimensions correspond to ID, score or OD. Visible status/mesh names are not authoritative engineering verification.

**Proposed acceptance:** preserve selected-object identification without losing material appearance; semantic part names, dirty feedback, per-part visibility and catalog/scene coordination. Improve long generated names/status numbers without changing numerical precision in data. Keep production measurements tied to CAD/engineering, not screenshots.

**References:** sessioneditor.js, scenedocument.js, navigatormeshespanel.js, packagingworkspace.js; F02/F07/F20/F21/F22.

## SC-05 — Account Model Library

**Source:** fifth screenshot in the eight-image message.

**Verified:** centered Model library modal over a dimmed scene. Account library selected; Device library and Shared library tabs visible. Text describes private account files. Folder sidebar includes All sessions, a user folder, Uncategorized, New folder, Rename and Delete controls. Search, Select visible, Delete selected and selection count appear. Three saved-item cards show thumbnails, object counts/dates and Open/Add/Move/Delete/Share. Save current session is at lower left. User asset names are intentionally not transcribed here.

**Unknown:** filtering, folder mutations, upload completion, Open-versus-Add semantics, account isolation and actual item counts beyond the visible listing. The pictured 80-object item proves a label, not performance for that model.

**Proposed acceptance:** preserve source distinction, searchable browse, thumbnail identity, folder workflows, explicit Open/Add, bulk selection and save/share entry points. Verify modal focus/keyboard behavior and ownership server-side.

**References:** modellibrary.js, accountlibrary.js, docs/account-storage.md, docs/audience-sharing.md; F16–F19.

## SC-06 — audience sharing with generated QR

**Source:** sixth screenshot in the eight-image message, now included as screenshots/SC-06-share-dialog-redacted.png. **Labeled AI-assisted redacted reference included; unredacted original excluded.**

**Verified:** Share model modal overlays Model library and the scene. Explanatory copy says code-protected/read-only audience snapshot, 30-day validity, private original and revoke-to-end-access. Allow .auto3d download is checked in this capture. Require 4-digit access code is checked; a code field is present. Share original action, Download enabled status, link field, Copy link, Open mini viewer, Show QR code, QR image, Save QR as PNG and partially visible revoke control appear. Lower content scrolls.

**Important distinction:** checked download permission is a captured choice, not proof that downloads default to enabled. Link/QR appearance does not prove that anonymous access, code enforcement, download control, expiry or revocation actually works. Snapshot independence is explanatory UI copy corroborated by code documentation, not independently tested here. Access code/link/QR values are omitted from this textual analysis; the archived redacted reference hides them; unredacted original is excluded.

**Proposed acceptance:** preserve explicit publication, separate snapshot/original messaging, separate code communication, URL-only QR semantics, expiry/revoke and permission choices. Test nested-modal focus/escape behavior and scrolling; verify no background shortcuts leak. Source-to-code mapping: audiencesharing.js, modellibrary.js, functions/_lib/audienceshares.js; F18.

## SC-07 — extended AI Generative workspace

**Source:** seventh screenshot in the eight-image message.

**Verified:** extended AI Generative surface fills the content area below shared header/toolbar. AI v0.47.6 and Meshy via Auto3D are shown. Top actions: Add to session (dimmed), Save project to Library, Open AI project and project name. Center empty preview says select a completed creation. Latest creations contains an empty-state explanation and Refresh. Right Create area includes prompt, Generate, Balanced · 30k faces detail, checked PBR textures, Upload reference image, Text to 3D/Image to 3D/Text to image/Texture generation buttons, Model scale 1, nano-banana image model, 1:1 aspect ratio and 2K texture resolution. Several controls appear dimmed.

**Unknown:** credential/provider readiness, reason for dimmed controls, whether Texture generation is a distinct callable provider route, successful generation, credits, save persistence and preview-to-scene handoff. UI labels alone do not expand the verified six-workflow API inventory.

**Proposed acceptance:** preserve independent project/scene separation, prompt/reference/settings, completed-creation history, explicit generation and Add-to-session preconditions. Explain unavailable controls with actionable reasons; do not infer authentication failure from grey styling.

**References:** aiworkspace.js, aipreview.js, aiproject.js, docs/ai-generative.md; F24/F25.

## SC-08 — HDRI lighting with box

**Source:** eighth screenshot in the eight-image message.

**Verified:** left pane is scrolled into HDRI controls while retaining Model upload header. Default environment/HDRI choices, eight named preview cards (Studio Small, Colorful Studio, Blue Photo Studio, Kiara Interior, Autumn Forest, Shanghai Bund, Decor Shop, Gear Store), checked Show HDRI background, Brightness 1.00x, Rotation/Elevation 0 degrees and Reset adjustments are visible. Poly Haven/CC0 text appears. Viewport shows a large kraft box against a bright environment; Packaging remains open at right.

**Unknown:** selected preset's actual light-map fidelity, timing/performance, physically accurate shadow/reflection response and whether all files loaded. The bright background with visible geometry is not evidence of the earlier white-viewer failure.

**Proposed acceptance:** keep preset thumbnails/provenance, independent background toggle and numeric adjustments, coherent materials and reset. Test default/HDRI fallback, account/session persistence and GPU context lifecycle. Review whether dock title should describe scrolled active content (proposal, not a verified defect).

**References:** lightingpanel.js, docs/rendering.md, website/assets/hdri/NOTICE.md; F07/F09/F21.

## SC-09 — Welcome screen

**Source:** first screenshot in the subsequent Welcome/Preferences message.

**Verified:** black full-screen composition with large cyan/blue wireframe geometric forms, centered SW Auto3D branding, tagline 'Your 3D models. A whole new perspective.', v0.47.6, and 'Click anywhere to continue'. No sign-in fields or workspace controls are visible.

**Unknown:** animation, duration, keyboard/screen-reader activation, reduced-motion behavior, dismissal event, graphics cleanup and actual subsequent auth flow. A still image does not prove those behaviors.

**Proposed acceptance:** preserve brand/entry outcome and explicit continue affordance; test pointer and keyboard activation, reduced motion, resource disposal, remembered-login continuation and sign-in failure. Do not require exact wireframe tessellation as a business rule without owner confirmation.

**References:** source/website/welcome.js, css/welcome.css, authgate.js; docs/release-0475.md and test/welcome-sequence.test.js.

## SC-10 — Preferences

**Source:** second screenshot in the subsequent Welcome/Preferences message.

**Verified:** Preferences modal has Display, AI connections, Tools, About and Administrator cards. Display shows Appearance Dark, Units Standard (in), Viewport quality 'Auto — faster while moving'. Copy says display quality does not change geometry/saved files/final render resolution, Auto restores detail after movement, and theme/units save automatically to account. AI connections exposes Manage Meshy key and Test connection. Tools exposes Commands and macros, Error logs, Recover unsaved session, Agent access and Agent administration. Administrator includes account requests/approvals entry. About reports SW Auto3D v0.47.6 and build `0ffd76defb75157f3c701b2360e8939d14ebdf6e`, with unknown source units remaining model units.

**Evidence update:** version/build are now visually reported by the user's running UI, matching the commit previously observed as upload base. This is **Verified as displayed text**, not independent verification of served bundles, deployment status or endpoint health. Visible admin controls do not prove server-side admin authorization; no secret entry or key contents are visible.

**Unknown:** whether values are defaults, successful auto-save/cross-device loading, actual quality restoration, Meshy test result and agent authorization health. User reports MCP agent authorization unavailable; this is a user-reported issue with cause unconfirmed, not a screenshot-proven failure.

**Proposed acceptance:** retain discoverable settings/diagnostics/recovery/admin entry points, unit clarity, quality-versus-geometry explanation, build identity and interactive credential management. Verify persistence, roles, clear error feedback, modal keyboard/focus/scrolling and responsive layout.

**References:** preferences.js, aiconnection.js, agentaccess.js, accountadmin.js, docs/account-storage.md, docs/meshy-api-keys.md; F05/F15/F17/F25–F28.

## Cross-screen migration requirements

Each item below is **Proposed**, supported by the cited visual sources and existing feature contracts:

| Requirement | Source | Acceptance |
|---|---|---|
| UX-01 Preserve empty/populated action states | SC-01/03/04/07 | Action preconditions agree across UI/commands; no silent action on open |
| UX-02 Preserve independent docks and extended module workspace | SC-01/02/07 | Reopen/collapse retains state; explicit keyboard/focus behavior |
| UX-03 Keep CAD values distinct from display units | SC-03/04/10 | Unit label/rounding improve readability without numerical change |
| UX-04 Preserve selection/parts/history/dirty state | SC-04 | Identity and textures survive selection/Undo/update |
| UX-05 Separate account/device/shared workflows | SC-05 | Open/Add/Move/Share retain distinct guarded outcomes |
| UX-06 Preserve share consent, lifecycle and privacy | SC-06 | Explicit upload; code/link separation; expiry/revoke server tests |
| UX-07 Preserve AI project-versus-scene boundary | SC-07 | Preview does not mutate scene; complete durable project save |
| UX-08 Preserve HDRI choices/fallback | SC-08 | Catalog outage cannot remove packaged previews |
| UX-09 Preserve explicit welcome continuation | SC-09 | Keyboard/reduced-motion/auth-transition acceptance |
| UX-10 Keep settings and operational recovery discoverable | SC-10 | Persistence/permissions/errors verified, build identity visible |

## Remaining visual coverage

**Unknown and requiring confirmation:** login/account request/error states; mobile/tablet layouts; CAD designer/Measurement layer; board CSV editor and 409 conflict; material/texture/relief/varnish editor; animation tracks and playback; render progress/completed image; Mini viewer wrong/correct code and expired/revoked states; Device/Shared Library; key-entry dialog (only with key blank/hidden); agent connection error; accessibility and keyboard focus. These are requested future evidence targets, not claims that the functionality is missing.

## Asset register

All ten sources are visually reviewed. SC-01–SC-08: seven original PNGs included unchanged; SC-06 included as a labeled AI-assisted redacted derivative; filename/dimensions/byte size/SHA-256 are in screenshots/index.json. SC-09 Welcome and SC-10 Preferences: binary included=false, still cataloged from inline chat. Capture timestamp is unknown; upload filenames are not proof of original capture time. The eight source images have been visually matched to their catalog states. Open screenshots/gallery.html after extraction to browse them.


### Uploaded image links

Links resolve inside the extracted handoff archive. The repository catalog itself is a textual index; actual image files are packaged inside the ZIP.

- [SC-01: SC-01-empty-workspace.png](screenshots/SC-01-empty-workspace.png)
- [SC-02: SC-02-collapsed-docks.png](screenshots/SC-02-collapsed-docks.png)
- [SC-03: SC-03-packaging-setup.png](screenshots/SC-03-packaging-setup.png)
- [SC-04: SC-04-generated-box.png](screenshots/SC-04-generated-box.png)
- [SC-05: SC-05-account-library.png](screenshots/SC-05-account-library.png)
- [SC-06: SC-06-share-dialog-redacted.png](screenshots/SC-06-share-dialog-redacted.png)
- [SC-07: SC-07-ai-workspace.png](screenshots/SC-07-ai-workspace.png)
- [SC-08: SC-08-hdri-lighting.png](screenshots/SC-08-hdri-lighting.png)
- SC-09 Welcome: image file not in uploaded screenshot.zip.
- SC-10 Preferences: image file not in uploaded screenshot.zip.
