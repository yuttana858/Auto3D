import fs from 'node:fs';

const lock = JSON.parse (fs.readFileSync (new URL ('../package-lock.json', import.meta.url), 'utf8'));
const allowed = new Set (['MIT']);
const packages = [];

for (const [path, data] of Object.entries (lock.packages || {})) {
    if (!path.startsWith ('node_modules/') || data.dev) { continue; }
    const name = path.substring ('node_modules/'.length);
    packages.push ({ name, version : data.version, license : data.license || 'UNKNOWN' });
}

const blocked = packages.filter ((item) => !allowed.has (item.license));
console.log ('Production dependency licenses:');
packages.sort ((a, b) => a.name.localeCompare (b.name)).forEach ((item) => console.log ('- ' + item.name + '@' + item.version + ': ' + item.license));

if (blocked.length) {
    console.error ('Unreviewed production dependency license(s): ' + blocked.map ((item) => item.name + '=' + item.license).join (', '));
    process.exit (1);
}
