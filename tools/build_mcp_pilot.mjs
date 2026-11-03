import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve (new URL ('..', import.meta.url).pathname);
process.chdir (root);
const output = 'build/mcp-pilot';
await rm (output, { recursive : true, force : true });
await mkdir (output, { recursive : true });
await cp ('build/pages', output, { recursive : true });
const bundles = {};
for (const role of ['broker', 'auth', 'gateway', 'resource', 'pages-worker']) {
    const outfile = role === 'pages-worker' ? output + '/_worker.js' : 'build/mcp-workers/' + role + '.js';
    const result = await build ({ entryPoints : ['mcp/' + role + '.js'], bundle : true, format : 'esm', platform : 'browser', target : 'es2022', external : ['cloudflare:workers', 'node:*'], outfile, metafile : true, legalComments : 'eof' });
    if (role === 'pages-worker' && Object.keys (result.metafile.inputs).some (input => /functions\/api\/(personal|library|share|ai)\//.test (input))) { throw new Error ('Production data routes entered the pilot bundle.'); }
    const bytes = await readFile (outfile); bundles[role] = { sha256 : createHash ('sha256').update (bytes).digest ('hex'), bytes : bytes.length };
}
await writeFile (output + '/_routes.json', JSON.stringify ({ version : 1, include : ['/*'], exclude : [] }, null, 2));
await writeFile (output + '/mcp-pilot.json', JSON.stringify ({ pilot : true, productionReady : false, origin : 'https://auto3d-mcp-pilot.pages.dev', appVersion : JSON.parse (await readFile ('package.json')).version, packagingVersion : JSON.parse (await readFile ('modules/packaging/package.json')).version, bundles }, null, 2));
console.log ('Isolated MCP pilot built at ' + output + '; no deployment performed.');
