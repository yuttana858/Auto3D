# CAD Studio: vector-tool review

Reviewed 2026-11-09 against the projects' published documentation; no source has been incorporated and no embedding prototype has been built.

## Candidates

- [Inkscape](https://wiki.inkscape.org/wiki/PresentationInkscapeOverview) is a mature SVG-based desktop reference for paths, nodes, text, gradients and production file interchange. Its GPL licensing and desktop architecture require a separate license and deployment assessment before code is incorporated; use it as a workflow and compatibility benchmark.
- [Graphite](https://graphite.art/learn/introduction/features-and-limitations/) is a browser-capable vector/raster editor with procedural, nondestructive operations. It describes itself as alpha; [its features roadmap](https://graphite.art/features/) lists PDF/EPS/AI/DXF import as future work. Its [code is dual MIT/Apache-2.0](https://graphite.art/license/) except where otherwise noted. Test import fidelity, embedding and performance rather than assuming the full application is a stable library.
- [VectorCraft](https://getartcraft.com/apps/vectorcraft) advertises browser and desktop versions, selection and path editing, snapping, image tracing, effects and an MCP interface. Its linked [project source](https://github.com/storytold/vectorcraft) reports MIT/Apache-2.0 licensing and a browser WebAssembly build, subject to component/asset notices. Claims and feature maturity require an independent evaluation, especially PDF/EPS import, fonts, color fidelity, stable APIs and embedded operation.

## Proposed architecture and sequence

Keep CAD geometry authoritative in millimeters; create separate locked-by-default CAD manufacturing, editable artwork, and material layers. Store artwork objects, layer ordering, face, transforms, embedded assets, font references and document version separately from packaging paths. Preserve account isolation, session archive/undo and strict command schemas. Do not make the viewer depend on DOM automation of a third-party editor.

1. Prototype VectorCraft and Graphite in isolated sandboxes against a common sample set. Measure browser bundle/CPU/memory, license and dependency notices, offline behavior, embedding interfaces, accessibility, API/command support, crash recovery, lossless editing, SVG/PDF and image imports, and unsupported feature reporting. Test work-PC policies.
2. Introduce an artwork document with safe SVG and raster placement (PNG/JPEG), selectable inside/outside face, 1:1 physical scale, drag/rotate/scale, guides/snapping, clip/bleed/safe zones, layer visibility and locks, plus account/session persistence and undo. Never execute scripts or fetch hidden external resources from artwork. Browser previews alone are not print-ready.
3. Add basic editable vectors: select, pen/Bezier and node editing, shapes, text and fonts, fill/stroke, gradients, grouping, alignment and transforms. Keep CAD line roles distinct from visual styling. Agent actions must use typed shared operations.
4. Add PDF/EPS via a vetted, isolated parser/converter after testing real files and defining fidelity and font behavior. EPS/PostScript is executable input; do not execute untrusted files in the browser or production host. Do not silently rasterize or drop layers; offer an explicit preview and disclose any limitations.
5. Map art in global sheet coordinates to folded 3D faces using existing packaging UVs. Handle inside/outside orientation, glue flap and fold boundaries, print resolution, color-space conversion, registration and previews; changes should update 3D asynchronously without replacing the engineering document. Test saved archives and multiple wall constructions.
6. Add preflight and production output only after validating dimensions, color/spot inks, overprint, fonts, transparency, cutter layers, bleed and print-shop workflows with representative converters. Preserve 1:1 geometry in SVG/DXF and EPS exports; physical output depends on the receiving application's scaling settings.

The existing CAD-to-3D folded rig only supports generated FEFCO paths; arbitrary edited fold geometry needs a separate topology/hinge engine. Art mapping must not be presented as solving that limitation.
