> Historical UI-shell increment. Opaque generation/update is now implemented in the stacked [0.49.0 increment](release-0490.md); glass and artwork remain pending.

# Primary Products panel — Auto3D 0.48.0 / Primary Products 0.1.0

Primary Products is directly below Packaging in the outlined Generation modules tool-rail group. It opens a compact right panel; the shared Extended, Minimal and Close controls manage its presentation. Extended mode keeps the app header/toolbar and arranges the product catalog, profile reference and controls in columns. Mobile extended mode stacks those areas without horizontal scrolling.

The panel is a draft workspace: bottle/can choice, dimensions, surface color/material/roughness and front/wrap label zone are session-local settings. Its SVG is explicitly labeled Illustrative profile. Model generation, actual PBR rendering and artwork placement are subsequent build-plan work; Add to session stays disabled. Opening or editing the panel does not create objects, change the camera, call Meshy, upload artwork or save anything remotely.

Draft settings survive minimizing, closing, reopening and switching modules within the current browser window. They are not persisted across refresh yet. Values are stored in millimeters and displayed using global mm/in preferences; invalid changes fail before state replacement. Account changes clear the prior account's draft. Read-only/busy/account guards prevent draft edits where appropriate. Keyboard events from draft controls do not reach scene shortcuts, so Delete while adjusting a surface cannot remove a scene object.

The shared ModulePanels controller offers opt-in entry/exit animation. Primary Products opts in: compact entry slides/fades from the right, extended entry uses the shared modal, and close/minimize finishes its exit before restoring/hiding DOM. Newer actions cancel older motion; a stale async load cannot reopen a closed module. Reduced-motion mode skips animation. Existing AI/Packaging panels keep their current behavior.

## Commands

- `ui.primary_products`: open the draft workspace.
- `primary.inspect`: read canonical-mm draft settings and `generationAvailable: false`.
- `primary.configure`: validate/update family, dimensions, surface and label-zone draft settings.
- `primary.reset`: reset only this draft; scene objects remain untouched.
- `ui.module.mode { module: "primary-products", mode: "minimal" | "extended" | "closed" }`: shared panel controls.

These commands share the UI services and have strict schemas. They do not imply model generation or completed artwork uploads.

## Ownership and assets

`modules/primary-products` owns the panel, state validation and CSS. `source/website/primaryproductspanel.js` is its lazy host adapter. Its JS/CSS load on demand, are tracked in Pages version metadata and verified by release hashes. `npm start` watches both module sources and CSS. Packaging remains an independent unchanged module.

`node test/browser/primary-products.mjs` exercises the built website with mocked account APIs, including desktop/mobile layout, lazy loading, module ordering/outline, draft controls, unit conversion, panel state preservation, close motion, rapid transitions and reduced motion. It also checks that an existing scene/camera is preserved. No production account or paid provider is used.
