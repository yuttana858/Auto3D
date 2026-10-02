# Auto3D

Auto3D is a branded, self-hostable browser 3D viewer based on [Online3DViewer](https://github.com/kovacsv/Online3DViewer). It includes the upstream viewer engine and web app, with Auto3D branding and self-hosted share/embed links.

## Run locally

Install the npm dependencies, then run `npm start`. The server at `http://localhost:8080/website/index.html` watches source changes and automatically rebuilds the development viewer. Browser caching is disabled. Refresh after the watcher reports a successful build; save your session first to retain edits. The header displays the application version, currently **v0.20.0**.

## Prototype hosting

The prototype is hosted at https://yuttana858.github.io/Auto3D/ from the `gh-pages` branch. Source code lives on `main`.

To publish an update, run `npm run build_website` and `node tools/build_pages.mjs`. In `build/pages`, commit the updated files and push `gh-pages`. GitHub Pages publishes that branch automatically. Source pushes to `main` do not deploy the site.

This is a prototype; the dependency-license, security, and privacy checks in `3d-viewer-review.md` remain outstanding.

## Lighting and materials

The left panel has collapsible Session objects, Materials and Lighting sections. Select a model part to inspect its assigned surface materials. The advanced editor opens below the viewer with surface controls, texture previews, tiling/offset/rotation controls and a UV0 layout. Edits affect parts sharing a material within that object. Save a `.auto3d` session to retain materials, textures, object placement, visibility, animation data and view settings across refreshes.

## Object editing and library

Uploads append objects. **Update** replaces the selected object's source geometry while retaining its placement. The viewer tool strip supports Select (V), Move (W), Rotate (E), Scale (R), Duplicate (Ctrl+D), visibility (H), Focus (F), Delete, and Undo/Redo for object edits. Transform tools provide a gizmo and numeric fields. Undo applies to object and placement edits; material controls are saved in the session but do not use that history.

GLB/glTF models with embedded clips have independent Play/Pause, clip selection, timeline, Reset and speed controls. Skeletal and morph animations are retained in portable sessions and GLB/glTF exports. Include referenced binary/texture files when uploading a glTF. Animation extensions requiring additional decoders may show an unavailable-animation message while retaining a static preview. Mesh-format exports use the engine's static geometry.

The device library uses IndexedDB, with categories Primary products, Retail shelf, Pallets and Accessories. Cards include thumbnails: **Open** replaces the workspace with a saved session; **Add** appends its objects. Shared Supabase storage and view-only Share links require access to the existing project; the interface currently reports this pending connection. No user models are published with the static site.

Preferences offers Light/Dark appearance, Metric (mm) or Standard (in) dimensions, and About. Models with no declared length unit display model units. GLB/glTF coordinates use meters. Unit preferences change dimension labels, not geometry.

Lighting offers the default environment and eight locally bundled 1K Poly Haven HDRIs, with brightness, rotation and elevation controls. Physical surfaces use prefiltered image-based lighting; Phong surfaces use a diffuse light probe integrated from the same HDR data. The horizon background and ground grid remain independent. Asset licenses and sources are in `website/assets/hdri/NOTICE.md` and `sources.json`; generate previews with `node tools/prepare_hdri_previews.mjs`.

Default lighting includes Standard, Dark, Light, Sunset and Outdoor background presets. Standard follows the app theme; explicit presets retain their colors across theme changes. Background, horizon and grid preferences are saved in cookies. Horizon and ground-grid controls live in Lighting. The viewer's X/Y/Z world indicator follows the camera orientation, including orbit, roll and up-axis changes.

## Supported formats

- **Import:** 3dm, 3ds, 3mf, amf, bim, brep, dae, fbx, fcstd, gltf/glb, ifc, iges, step, stl, obj, off, ply, wrl.
- **Export:** 3dm, bim, gltf/glb, obj, off, stl, ply.

Some formats are provided by separate libraries. Dependencies are listed in `package.json` and their licenses apply independently.

## Upstream and licensing

The upstream [Online3DViewer source](https://github.com/kovacsv/Online3DViewer) and [developer documentation](https://kovacsv.github.io/Online3DViewer) are useful references. The upstream project by Viktor Kovacs is distributed under the MIT License. Auto3D retains the upstream [LICENSE.md](LICENSE.md) and required copyright notice. Review third-party dependency licenses before redistribution.
