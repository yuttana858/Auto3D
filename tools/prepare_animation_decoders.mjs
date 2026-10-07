import { cp, mkdir } from 'node:fs/promises';
const destination = process.argv[2];
if (!destination) { throw new Error ('Provide the viewer output directory.'); }
await mkdir (destination, { recursive : true });
await cp ('node_modules/three/examples/jsm/libs/draco/gltf', destination + '/draco', { recursive : true });
