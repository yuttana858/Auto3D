# Auto3D 0.96.0 — Live primary products, glass construction and CAD labels

Packaging **1.18.0** / Primary Products **0.16.0** / Molded Pulp **0.3.0**.

Based on main `66320103aacccb9e3997c58a9c8312f327250f55` (0.94.0). Version 0.95.0 is reserved by the separate animation workstream in PR #167. This candidate is not deployed. Related product changes are collected in one draft PR to avoid repeated Actions runs.

## Selected products update live

Editing a selected product in the right panel updates that object, preserving its identity, transform, artwork and unrelated advanced material settings. Valid numeric edits settle after a short pause; Enter or blur flushes them immediately. Incomplete numbers remain editable. Edits arriving during a rebuild are coalesced, and the resulting burst has one Undo step. Without a matching selected product, controls configure the next generation. Generate new remains an explicit way to add another object.

Automatic framing and Fit model use the selected object's projected bounds and the current viewport aspect ratio, including the split editor. New products finish their initial fit before generation resolves. Live edits and Undo preserve the current camera and orbit pivot.

## Glass bottles and closures

New bottle drafts and bottle catalog designs default to glass. Previously saved explicit material choices are retained. Bottle reconstruction uses an outer and inner wall joined at the open mouth, with a thicker base and a cavity followed by the contents mesh. Lightweight (1.2/2.4 mm wall/base), standard (2/4 mm) and heavy (3/6 mm) presets are editable through Custom. Geometry limits clamp construction to the selected profile; these are presentation presets, not certified manufacturing specifications.

Caps have a hollow skirt, roof, bevel and closure-specific detail. Ribbed, smooth and flip-top presentations support height, wall thickness, PP/HDPE/aluminum/steel and independent color. Cap material and grain update independently of the bottle's glass tint, transmission, roughness and IOR. Cap-top UVs support a round label. Threads, opening mechanisms and liquid motion are not simulated.

## Labels in the shared CAD editor

Every bottle profile exposes front, back, wrap and cap-top label designs. Front and back can coexist with the cap label; wrap replaces the body pair. Open a label in the existing CAD editor to edit its cut outline and artwork paths, then Apply label to update the selected model with Undo. SVG paths remain editable vectors; text and raster images use a disclosed, bounded vector-trace approximation. Unsupported or oversized artwork is rejected before replacing the existing label.

CAD profiles, rendered label images and physical label dimensions survive save/reopen, recovery and product scaling. Packaging 1.18.0 recognizes artwork paths as a separate layer and excludes them from board extrusion and folds. Closing label CAD restores the ordinary Packaging workspace.

## Agent access and validation

New shared commands: `primary.live.configure`, `primary.fit`, `primary.label.cad.open`, `primary.label.cad.inspect`, `primary.label.cad.apply`, and `packaging.artwork.style`. Existing profile/detail commands include the new construction controls; existing label commands include cap-top. Opening label CAD is interactive; applying it is a separate command. The generated browser and MCP catalogs are synchronized.

Validation results and the exact tested commit are recorded in the PR. Local checks cover asynchronous editing, stale selection/account guards, render rollback, camera movement, construction topology, cap materials, CAD layers/vector conversion, label persistence and actual browser interaction. Full release CI remains a separate gate before merge/deployment; skipped draft checks are not passing results.
