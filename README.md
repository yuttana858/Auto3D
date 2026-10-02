# Auto3D

Auto3D is a branded, self-hostable browser 3D viewer based on [Online3DViewer](https://github.com/kovacsv/Online3DViewer). It includes the upstream viewer engine and web app, with Auto3D branding and self-hosted share/embed links.

## Run locally

Install the npm dependencies, then run `npm start`. This builds the development viewer and starts a local static server.

## Prototype hosting

The prototype is hosted at https://yuttana858.github.io/Auto3D/ from the `gh-pages` branch. Source code lives on `main`.

To publish an update, run `npm run build_website` and `node tools/build_pages.mjs`. In `build/pages`, commit the updated files and push `gh-pages`. GitHub Pages publishes that branch automatically. Source pushes to `main` do not deploy the site.

This is a prototype; the dependency-license, security, and privacy checks in `3d-viewer-review.md` remain outstanding.

## Lighting and materials

The left panel has collapsible Materials and Lighting sections. Select a model part to inspect its assigned surface materials. The advanced editor opens below the viewer with color, opacity and physical/Phong surface controls, texture previews, tiling/offset/rotation controls and a UV0 layout. Edits affect all parts sharing that material and update the imported model in the current session. Reloading the model discards these edits; there is no project save system yet.

Lighting offers the default environment and eight locally bundled 1K Poly Haven HDRIs, with brightness, rotation and elevation controls. Physical surfaces use prefiltered image-based lighting; Phong surfaces use a diffuse light probe integrated from the same HDR data. The horizon background and ground grid remain independent. Asset licenses and sources are in `website/assets/hdri/NOTICE.md` and `sources.json`; generate previews with `node tools/prepare_hdri_previews.mjs`.

## Supported formats

- **Import:** 3dm, 3ds, 3mf, amf, bim, brep, dae, fbx, fcstd, gltf/glb, ifc, iges, step, stl, obj, off, ply, wrl.
- **Export:** 3dm, bim, gltf/glb, obj, off, stl, ply.

Some formats are provided by separate libraries. Dependencies are listed in `package.json` and their licenses apply independently.

## Upstream and licensing

The upstream [Online3DViewer source](https://github.com/kovacsv/Online3DViewer) and [developer documentation](https://kovacsv.github.io/Online3DViewer) are useful references. The upstream project by Viktor Kovacs is distributed under the MIT License. Auto3D retains the upstream [LICENSE.md](LICENSE.md) and required copyright notice. Review third-party dependency licenses before redistribution.
