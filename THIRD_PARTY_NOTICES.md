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
| occt-import-js (with Open CASCADE Technology) | 0.0.22 | LGPL-2.1 | `o3dv/libs/occt-import-js/` | STEP, IGES, BREP and FreeCAD import |
| web-ifc | 0.0.68 | MPL-2.0 | `o3dv/libs/web-ifc/` | IFC import |

The project owner approved hosting the two copyleft libraries on 2026-11-09. They are outside the MIT allowlist that `tools/check_licenses.mjs` applies to bundled production dependencies, so they stay separate, unmodified files loaded at runtime rather than being bundled into Auto3D code. Each directory carries its license text (`license.occt-import-js.txt` and `license.occt.txt`; `LICENSE.txt` with MPL-2.0 from `third_party/licenses/`) and a `NOTICE.txt` naming the exact version and where its source is published. Replace them only with unmodified upstream builds, or publish the changed source alongside if they are ever modified.

<!-- rhino3dm license start -->
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
<!-- rhino3dm license end -->
