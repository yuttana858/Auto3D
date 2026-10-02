# Auto3D

Auto3D is a branded, self-hostable browser 3D viewer based on [Online3DViewer](https://github.com/kovacsv/Online3DViewer). It includes the upstream viewer engine and web app, with Auto3D branding and self-hosted share/embed links.

## Run locally

Install the npm dependencies, then run `npm start`. This builds the development viewer and starts a local static server.

## Prototype hosting

The prototype is hosted at https://yuttana858.github.io/Auto3D/ from the `gh-pages` branch. Source code lives on `main`.

To publish an update, run `npm run build_website` and `node tools/build_pages.mjs`. In `build/pages`, commit the updated files and push `gh-pages`. GitHub Pages publishes that branch automatically. Source pushes to `main` do not deploy the site.

This is a prototype; the dependency-license, security, and privacy checks in `3d-viewer-review.md` remain outstanding.

## Supported formats

- **Import:** 3dm, 3ds, 3mf, amf, bim, brep, dae, fbx, fcstd, gltf/glb, ifc, iges, step, stl, obj, off, ply, wrl.
- **Export:** 3dm, bim, gltf/glb, obj, off, stl, ply.

Some formats are provided by separate libraries. Dependencies are listed in `package.json` and their licenses apply independently.

## Upstream and licensing

The upstream [Online3DViewer source](https://github.com/kovacsv/Online3DViewer) and [developer documentation](https://kovacsv.github.io/Online3DViewer) are useful references. The upstream project by Viktor Kovacs is distributed under the MIT License. Auto3D retains the upstream [LICENSE.md](LICENSE.md) and required copyright notice. Review third-party dependency licenses before redistribution.
