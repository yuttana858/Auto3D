import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const destination = process.argv[2];
if (!destination) { throw new Error ('Provide the viewer output directory.'); }
await mkdir (destination, { recursive : true });
await cp ('node_modules/three/examples/jsm/libs/draco/gltf', destination + '/draco', { recursive : true });
// Import libraries the site hosts itself (see source/website/externallibraries.js).
await mkdir (destination + '/libs/rhino3dm', { recursive : true });
for (const file of ['rhino3dm.min.js', 'rhino3dm.wasm']) { await cp ('node_modules/rhino3dm/' + file, destination + '/libs/rhino3dm/' + file); }
await writeFile (destination + '/libs/rhino3dm/LICENSE.txt', 'rhino3dm 8.17.0 - MIT License\nCopyright (c) Robert McNeel & Associates and contributors\nhttps://github.com/mcneel/rhino3dm\n\n' + (await readFile ('THIRD_PARTY_NOTICES.md', 'utf8')).match (/<!-- rhino3dm license start -->\n([\s\S]*?)<!-- rhino3dm license end -->/)[1]);
// OpenCascade STEP/IGES/BREP importer: unmodified LGPL-2.1 build files with both license texts and a source pointer.
await mkdir (destination + '/libs/occt-import-js', { recursive : true });
for (const file of ['occt-import-js.js', 'occt-import-js.wasm', 'occt-import-js-worker.js', 'license.occt-import-js.txt', 'license.occt.txt']) { await cp ('node_modules/occt-import-js/dist/' + file, destination + '/libs/occt-import-js/' + file); }
await writeFile (destination + '/libs/occt-import-js/NOTICE.txt', 'occt-import-js 0.0.22 (LGPL-2.1), including Open CASCADE Technology (LGPL-2.1 with exception).\nThese files are unmodified copies of the npm package dist directory.\nSource: https://github.com/kovacsv/occt-import-js (tag v0.0.22) and https://dev.opencascade.org/\nLicense texts: license.occt-import-js.txt and license.occt.txt in this directory.\n');
// IFC importer: unmodified MPL-2.0 files with the license text and a source pointer.
await mkdir (destination + '/libs/web-ifc', { recursive : true });
for (const file of ['web-ifc-api-iife.js', 'web-ifc.wasm']) { await cp ('node_modules/web-ifc/' + file, destination + '/libs/web-ifc/' + file); }
await cp ('third_party/licenses/MPL-2.0.txt', destination + '/libs/web-ifc/LICENSE.txt');
await writeFile (destination + '/libs/web-ifc/NOTICE.txt', 'web-ifc 0.0.68 (Mozilla Public License 2.0). These files are unmodified copies from the npm package.\nSource: https://github.com/ThatOpen/engine_web-ifc (version 0.0.68) and https://www.npmjs.com/package/web-ifc/v/0.0.68\nLicense text: LICENSE.txt in this directory.\n');
