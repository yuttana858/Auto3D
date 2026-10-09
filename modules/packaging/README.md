# Packaging module v1.0.0

A separate package for FEFCO 0200–0203 boxes, canonical-mm dielines, physical board extrusion, kraft textures, catalog controls and flat-sheet unfolding. It can be developed or copied to a separate repository without Auto3D source. Its only runtime dependencies are Three.js and fflate, under MIT licenses.

From the Auto3D repository root:

```bash
npm run build_packaging
npm run test_packaging
npm run preview_packaging
```

For a standalone checkout of this folder, install Node.js 22+, run `npm install`, then `npm run build`, `npm test` or `npm run preview`. Preview serves localhost:8082, watches source/CSS changes and has no login, backend, cloud storage or Auto3D dependency. The standalone UI supports generating a box and unfolding it. Auto3D provides history/saving through its host adapter.

## Source and build

| File | Responsibility |
| --- | --- |
| src/profile.js | Archive-safe profile validation, contours, bounds, calipers and SVG/DXF |
| src/fefco.js | FEFCO dimensions, validation and original concept layouts |
| src/geometry.js, mesh.js | Folded boxes, connected flat boards and neutral mesh data |
| src/material.js | Embedded PNG kraft grain and corrugated-edge textures |
| src/catalog.js, panel.js, packaging.css | Categories, original thumbnails and host-driven controls |
| preview/ | Independent Three.js viewer and module host |
| test/ | Tests with no Auto3D imports |

The build produces dist/packaging.module.js (ES module), packaging.module.css, module.json and a standalone preview. Auto3D copies only module assets into its website build. Module JavaScript/CSS are loaded on demand. The app imports lightweight pure validation/layout code for archive checks and commands; geometry, PNG generation and catalog UI remain outside its startup bundle. Root boundary tests enforce these rules.

## API v1

```js
import { CreateFefcoBox, UnfoldFefco } from './src/index.js';
const box = CreateFefcoBox({ code: '0201', length: 400, width: 300, height: 250, thickness: 3, closure: 'closed' });
const flat = UnfoldFefco(box.parameters, box.profile);
```

Returned data has apiVersion, units=mm, parameters, profile, materials and meshes. Meshes contain arrays of vertices/normals/UVs, per-triangle index lists and material IDs, and indexed line guides. Texture buffers are ArrayBuffers with PNG name/MIME. No engine classes or host identifiers are returned. A host converts coordinates into its scene units, maps material roles (liner, edge, cut, score), and can replace liner/edge definitions with the current material. UnfoldFefco retains the supplied saved profile; it does not use an unrelated editable draft. CreateBoard also accepts validated custom profiles.

FefcoPanel takes a narrow host object with inspect(), configure(changes), generate(), unfold(), factor(), run(action), blocked() and canUnfold(). factor() converts displayed values to millimeters; the host handles account permissions, selection, errors, asynchronous execution, history and saving. The independent preview is an example host; Auto3D’s PackagingWorkspace.PanelHost() is another.

Both package.json and PackagingModuleVersion in src/index.js must identify the same release; tests check this. API changes require an explicit PackagingAPIVersion change and adapter compatibility review.

## Scope

These are original parametric concept layouts using FEFCO identifiers, not an imported complete database or supplier-certified tooling drawings. Unfolding produces the flat saved design for supported generated boxes. It does not infer folds from arbitrary imported meshes, simulate all panel hinges, or calculate converter-specific production allowances. Corrugation is an edge texture; individual flute geometry is not modeled. The current neutral-material API is designed for the common kraft liner/edge roles.
