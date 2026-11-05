# Auto3D 0.49.0 — Primary Products scene integration

Primary Products 0.3.0 / API 1; Packaging remains 1.10.3. Stacked above geometry PR #64; not deployed.

The Primary Products panel can add opaque round bottles and cans, load a selected generated definition, and apply draft changes through shared strict commands (`primary.generate`, `primary.selected.load`, `primary.update`). Each add/update creates one Undo step. Updating keeps identity, placement, scale, name, group metadata, visibility and shadow flags. Component surfaces are rebuilt from the draft; this is stated in the UI/command description. Animated or partially hidden objects must be cleared before rebuilding. Duplicates remain independent.

Neutral meshes convert from canonical mm into known scene units through a host adapter. Opaque plastics are nonmetallic; aluminum/steel can bodies and ends are metallic. Body color/roughness render through existing physical materials; bottle closures use a neutral plastic finish. No remote uploads, paid calls, new account storage or cloud configuration are introduced.

Versioned authoring definitions are stored in existing bounded per-object metadata alongside baked geometry/materials. Archive loading validates the definition and rejects malformed/future versions. Existing archive/recovery/Library workflows preserve it; older app versions can view baked geometry but do not provide these authoring controls. Generic GLB export contains baked appearance through the existing exporter, without promising parametric authoring restoration.

Glass generation is explicitly blocked. The panel's profile remains illustrative, label zones are preparatory and no label artwork is applied. Hollow walls, transmission, real 3D draft preview, image import/mapping and expanded presets remain later build-plan steps.

Validation: 734 app/module tests, 26 MCP tests, 11 backend tests, application/MCP lint, website/Pages builds and a focused opaque GLB export check pass. Built-app Chromium verifies desktop/mobile panel behavior, UI generation, strict selected-load/update, stable identity, Undo/Redo and glass rejection. Test HTTP servers required local loopback access; an initial pre-existing appearance-test timeout under concurrent Chromium load passed when the suite ran sequentially.
