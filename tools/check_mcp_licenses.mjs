import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Review the full dependency closure of the two bundled server libraries,
// including dependencies tree-shaken out of a particular bundle.
const lock = JSON.parse (await readFile ('package-lock.json', 'utf8'));
const allowed = new Set (['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause']);
const queue = ['node_modules/@cloudflare/workers-oauth-provider', 'node_modules/@modelcontextprotocol/sdk'];
const seen = new Set (), notices = [];
while (queue.length) {
    const key = queue.shift (); if (seen.has (key)) { continue; } seen.add (key);
    const pkg = lock.packages[key]; if (!pkg || !allowed.has (pkg.license)) { throw new Error ('Unreviewed MCP dependency license: ' + key + ' ' + pkg?.license); }
    for (const name of Object.keys (pkg.dependencies || {})) {
        let directory = key, resolved = null;
        while (directory) {
            const candidate = directory + '/node_modules/' + name;
            if (lock.packages[candidate]) { resolved = candidate; break; }
            directory = directory.includes ('/node_modules/') ? directory.slice (0, directory.lastIndexOf ('/node_modules/')) : '';
        }
        resolved ||= 'node_modules/' + name;
        if (!lock.packages[resolved]) { throw new Error ('Missing dependency ' + name); } queue.push (resolved);
    }
    const files = await readdir (key);
    const license = files.find (file => /^(licen[cs]e|copying)(\.|$)/i.test (file));
    if (!license) { throw new Error ('Missing license notice: ' + key); }
    notices.push (key + '@' + pkg.version + ' (' + pkg.license + ')\n' + await readFile (path.join (key, license), 'utf8'));
}
const output = process.argv[2];
if (output) { await writeFile (output, notices.sort ().join ('\n\n--------------------\n\n')); }
console.log ('MCP dependency licenses and notices verified: ' + seen.size + ' packages.');
