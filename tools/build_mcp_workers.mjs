import { build } from 'esbuild';

for (const role of ['auth', 'broker', 'gateway', 'resource', 'pages-worker', 'live']) {
    await build ({ entryPoints : ['mcp/' + role + '.js'], bundle : true, format : 'esm', platform : 'browser', target : 'es2022', external : ['cloudflare:workers', 'node:*'], outfile : 'build/mcp-workers/' + role + '.js', legalComments : 'eof' });
}
console.log ('MCP Worker bundles built.');
await build ({ entryPoints : ['test/fixtures/mcp-consent-worker.js'], bundle : true, format : 'esm', platform : 'browser', target : 'es2022', external : ['cloudflare:workers', 'node:*'], outfile : 'work/mcp-consent-worker.js' });
