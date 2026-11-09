# Third-Party Notices

Auto3D retains the upstream Online3DViewer MIT license in `LICENSE.md`.

The production JavaScript dependency inventory is pinned by `package-lock.json` and enforced by `tools/check_licenses.mjs`. At the v0.21.0 hardening baseline the production dependency closure is:

| Package | Version | License |
| --- | --- | --- |
| @simonwep/pickr | 1.9.0 | MIT |
| core-js | 3.32.2 | MIT |
| fflate | 0.8.2 | MIT |
| nanopop | 2.3.0 | MIT |
| three | 0.186.1 | MIT |

The automated check intentionally fails closed when a production dependency reports a license outside the reviewed allowlist. Legal/corporate policy approval remains an organizational responsibility; this file is the engineering inventory, not legal advice.

Model files, HDRIs, fonts, decoders and other bundled assets can have separate terms. Asset-specific notices remain alongside those assets (for example `website/assets/hdri/NOTICE.md`).

## Format libraries hosted with the site

These build inputs are copied beside the website bundle and loaded only when a matching format is opened. They are pinned in `package-lock.json` as development dependencies and are not part of the published engine package, which keeps its CDN defaults (`SetExternalLibraryUrl` changes them).

| Library | Version | License | Served from | Used for |
| --- | --- | --- | --- | --- |
| rhino3dm | 8.17.0 | MIT | `o3dv/libs/rhino3dm/` | Rhino `.3dm` import and export |
| Draco decoder (from three 0.186.1 `examples/jsm/libs/draco/gltf`) | Draco 1.5.x | Apache-2.0 | `o3dv/draco/` | Draco-compressed glTF |

Still loaded from cdn.jsdelivr.net pending a redistribution decision, because their licenses are outside the MIT/permissive allowlist:

| Library | Version | License | Used for |
| --- | --- | --- | --- |
| occt-import-js | 0.0.22 | LGPL-2.1 | STEP, IGES, BREP and FreeCAD import |
| web-ifc | 0.0.68 | MPL-2.0 | IFC import |

<!-- rhino3dm license start -->
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
<!-- rhino3dm license end -->
