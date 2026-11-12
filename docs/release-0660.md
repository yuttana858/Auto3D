# Auto3D 0.66.0 / Primary Products 0.15.0 / Packaging 1.10.7

Draft PR #116 follows #110, whose split profile editor and Actions cost controls reached main through #109. CAD integration remains paused.

## Walls and glass

The Edit model profile exposes nominal wall thickness as a dimension callout for each product family. Enter rebuilds the selected object immediately; its outside envelope, identity, placement, labels and custom surface finish are retained. Invalid thickness is rejected against the category and neck limits. Thickness remains a presentation-shell offset, not a manufacturing tolerance guarantee.

Material & glass controls expose the category material, roughness, glass tint, opacity, index of refraction and tint depth. Opacity controls the fraction of transmitted light; tint depth is the distance in display units at which the chosen absorption color is reached. Wall geometry and optical thickness now remain synchronized after rebuilding, including conversion from mm to the scene's units. Clear/translucent bottle materials support these controls. Absorption values are preserved through session archives, recovery and glTF KHR_materials_volume export/import.

## Bottle contents

Liquid/water, oil, syrup and lotion presets create a closed static fill by clipping the actual inner cavity of a round, oval or rounded-rectangle bottle and capping it at the requested level. Controls cover fill height (0–100% of cavity height), color, opacity and viscosity (mPa·s). Empty removes the contents mesh; 0% emits no mesh. Resizing and wall edits rebuild the fill within the new cavity. Product presets supply the surface roughness and IOR. Viscosity is saved as a property; no fluid motion or physically measured capacity is claimed. Fill is upright in product coordinates and follows the bottle transform.

For smooth contents visible through refractive glass, a material flag composites the fill after ordinary opaque geometry into Three's transmission background. It avoids the missing nested-transparent-object problem and the grain of alpha hashing. The outer glass still uses physical transmission, IOR and absorption. This is a real-time layered appearance approximation, not nested volumetric ray tracing; overlapping translucent fills and reflection passes can have limitations. Export uses standard BLEND plus an Auto3D extra to restore the same compositing when reimported. Opaque bottles naturally conceal their contents.

## Label art

Label art now lives directly in the profile editor as well as the advanced material editor. Imports, physical width/height, offsets, finishes and removal apply immediately when the profile editor is open, with Undo. Outside that editor, the established draft/Apply workflow remains.

All supported label zones across bottles, cans, pouches and clamshells accept PNG/JPEG/WebP images, restricted self-contained SVG (up to 64 KiB), or editable text (up to six lines/500 characters). Text controls include color, background/transparent background, font family, font size and alignment. SVG accepts geometric paths, text, local gradients and clipping via presentation attributes; scripts, external references, CSS/style blocks, animation, embedded images and unsupported namespaces are rejected. The error identifies when artwork needs conversion to self-contained paths/presentation attributes.

SVG and text retain their authoring source in the saved product definition and use a bounded PNG preview for portable 3D materials. `.auto3d` archives and recovery retain that source; ordinary glTF uses baked image materials. This is preparation for the future CAD handoff: it does not modify CAD layers, convert raster artwork to vectors or claim text outlines are already CAD geometry. Product metadata is validated with a bounded 262,144-character archive allowance; ordinary user metadata keeps its existing limit.

## Commands and validation

`primary.profile.update` accepts wall/material/optics/contents edits; `primary.glass.set` and `primary.contents.set` provide focused APIs. `primary.artwork.text` and `primary.artwork.svg` expose authoring without a file dialog. Existing artwork mapping/removal commands share live behavior in the profile editor. Numeric values are canonical mm, opacity is 0–1, fill is 0–100, and viscosity is mPa·s. Image import still uses the explicit local file picker.

Regression coverage checks closed positive-volume fills for round/oval/rectangle cavities, empty/full fills, validation, unit conversion, selected-object identity, custom finish retention, optical thickness, Undo, long vector-source archives, recovery, GPU material conversion and glTF export/import. Browser coverage checks real glass/liquid appearance, live text/SVG/image labels, blocked executable/external SVG, label Undo, mobile layout and clamshell labels. CI stays draft while work is batched and the monthly Actions quota is exhausted.

## Local validation record

Code commit `9c0a816` includes main through `eff1fe2` (#113/#114). Lint, production website/Pages build, standalone Primary Products build, engine bundle and engine module/type build pass. The complete local unit/integration suite passes **856 tests**; the updated catalog and MCP workers passed **66 MCP tests** before main synchronization (the merge changed no MCP files). The split-profile browser regression passes on desktop and mobile, including dimensions, Undo/Redo, units, orbit/zoom and selection. The new contents browser regression also passes: optical walls, static liquid, live text/SVG/image labels, SVG rejection, label Undo, mobile and clamshell labels. Both browser regressions ran against the production build at `9c0a816`; the CI list now contains 73 browser scenarios. Hosted full-suite results remain outstanding because the owner reported Actions quota exhaustion.

After #109 merged concurrently, integration commit `eec13ca` incorporates main `642877a` and its command-bar/agent-access changes. Conflicts were limited to version and status records; product geometry/editor and engine files were unchanged by this synchronization. Lint, the full **856-test** unit/integration suite, **66 MCP tests**, production/Pages and development builds pass again. The command-bar browser regression passes with agent messages/replies, deselection and live screenshot settings. The initial MCP attempt was denied loopback access by the sandbox; the complete rerun with local-server permission passed. The earlier product browser and engine/module build evidence above remains applicable to those unchanged files. CI cost controls and the original split editor are now also in main via #109; this PR’s remaining feature delta is the 0.66.0 walls/contents/label increment.

Conflict resolution `bc481fd` incorporates main `772d313` through #117, including #115’s folding closeup and #117’s Meshy Workers redirect fix. Only version strings and the release log conflicted; both upstream changes are retained and the candidate stays Auto3D 0.66.0 / Primary Products 0.15.0 / Packaging 1.10.7. Local lint, **858 unit/integration tests**, production website build and Pages packaging pass on this merge. Product and MCP code are unchanged by this synchronization; earlier targeted browser/MCP evidence remains applicable. Hosted full-suite checks remain outstanding and #116 stays draft.
