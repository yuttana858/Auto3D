import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const destination = process.argv[2];
if (!destination) { throw new Error ('Provide the viewer output directory.'); }
await mkdir (destination, { recursive : true });
await cp ('node_modules/three/examples/jsm/libs/draco/gltf', destination + '/draco', { recursive : true });
// Import libraries the site hosts itself (see source/website/externallibraries.js).
await mkdir (destination + '/libs/rhino3dm', { recursive : true });
for (const file of ['rhino3dm.min.js', 'rhino3dm.wasm']) { await cp ('node_modules/rhino3dm/' + file, destination + '/libs/rhino3dm/' + file); }
await writeFile (destination + '/libs/rhino3dm/LICENSE.txt', 'rhino3dm 8.17.0 - MIT License\nCopyright (c) Robert McNeel & Associates and contributors\nhttps://github.com/mcneel/rhino3dm\n\n' + (await readFile ('THIRD_PARTY_NOTICES.md', 'utf8')).match (/<!-- rhino3dm license start -->\n([\s\S]*?)<!-- rhino3dm license end -->/)[1]);
