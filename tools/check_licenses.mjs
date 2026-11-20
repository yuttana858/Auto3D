import fs from 'node:fs';

const lock = JSON.parse (fs.readFileSync (new URL ('../package-lock.json', import.meta.url), 'utf8'));
const allowed = new Set (['MIT']);
const packages = [];
// This build dependency contributes exactly its factory and WASM to the browser
// worker. Its CLI/export toolchain is not distributed (enforced by the module
// build's input audit). Keep the reviewed exception pinned and ship its license.
const manifold = lock.packages['node_modules/manifold-3d'];
if (manifold?.version !== '3.5.5' || manifold.license !== 'Apache-2.0') {
    throw new Error ('Review the new Manifold version and license before bundling it.');
}
packages.push ({ name : 'manifold-3d (bundled worker kernel)', version : manifold.version, license : manifold.license });

for (const [path, data] of Object.entries (lock.packages || {})) {
    if (!path.startsWith ('node_modules/') || data.dev) { continue; }
    const name = path.substring ('node_modules/'.length);
    packages.push ({ name, version : data.version, license : data.license || 'UNKNOWN' });
}

const blocked = packages.filter ((item) => !allowed.has (item.license) && !(item.name === 'manifold-3d (bundled worker kernel)' && item.version === '3.5.5' && item.license === 'Apache-2.0'));
console.log ('Production dependency licenses:');
packages.sort ((a, b) => a.name.localeCompare (b.name)).forEach ((item) => console.log ('- ' + item.name + '@' + item.version + ': ' + item.license));

if (blocked.length) {
    console.error ('Unreviewed production dependency license(s): ' + blocked.map ((item) => item.name + '=' + item.license).join (', '));
    process.exit (1);
}
