# Auto3D 0.50.0 — Generate readiness and pillow pouches

Primary Products 0.4.0 / API 1; Packaging remains 1.10.3. Based on current main including the separate MCP authorization workstream. Not deployed.

The Primary Products action is now **Generate**, with a solid enabled appearance; the previous style always applied half-opacity even when enabled. The editor previously refreshed its own buttons after rendering but did not notify Primary Products: a panel refreshed during a busy render could retain disabled controls after the scene became idle. Primary Products now receives availability updates from `SessionEditor.RefreshButtons`, without resetting input values or rebuilding the profile. Generate shows busy feedback and a visible reason for account loading, sign-in, read-only sessions, scene operations or unsupported glass. All existing shared command IDs remain stable.

The next family is an opaque **pillow pouch**, with canonical-mm width, height and filled depth. The independent generator produces a closed bulged presentation envelope with a thin sealed perimeter and front/back zone descriptors. It shares Generate, selected-load, Apply, Undo/Redo, unit conversion and bounded saved definitions. Switching families resets incompatible dimensions/material/zone settings. Existing bottle/can definitions remain valid without migration.

This is a filled presentation shape, not fill-volume simulation or manufacturing wall geometry. Stand-up gussets, zippers/spouts, separately editable seal components, clear films/glass and actual artwork mapping remain pending. Draft profiles are illustrative; no cloud uploads or paid calls occur. The module now owns geometry for bottle, can and pouch while the host adapter owns scene conversion/history.
