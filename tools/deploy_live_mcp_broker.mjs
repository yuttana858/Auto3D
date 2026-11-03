import { readFile, appendFile } from 'node:fs/promises';

const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
if (!/^[a-f0-9]{32}$/.test (account || '') || !token) { throw new Error ('Cloudflare deployment credentials are unavailable.'); }
async function api (path, options = {})
{
    const response = await fetch ('https://api.cloudflare.com/client/v4/accounts/' + account + path, { ...options, headers : { Authorization : 'Bearer ' + token, ...options.headers }, signal : AbortSignal.timeout (60000) });
    const data = await response.json (); if (!response.ok || !data.success) { throw new Error ('Cloudflare MCP deployment failed (HTTP ' + response.status + ').'); } return data.result;
}
const project = await api ('/pages/projects/auto3d');
const config = project.deployment_configs.production;
if (config.env_vars?.AUTO3D_MCP_LIVE_ADMIN?.value !== '1') { console.log ('Live MCP is disabled; broker upload skipped.'); process.exit (0); }
if (process.env.GITHUB_OUTPUT) { await appendFile (process.env.GITHUB_OUTPUT, 'enabled=true\n'); }
if (!config.durable_object_namespaces?.AUTO3D_AGENT_BROKER?.namespace_id || !config.kv_namespaces?.OAUTH_KV?.namespace_id) { throw new Error ('Live MCP storage bindings must be configured before deployment.'); }
if (process.argv.includes ('--check')) { console.log ('Live MCP storage bindings are configured; the separately deployed private broker is retained.'); process.exit (0); }
const metadata = { main_module : 'broker.js', compatibility_date : '2026-11-03', compatibility_flags : ['nodejs_compat'], bindings : [{ type : 'durable_object_namespace', name : 'AUTO3D_AGENT_BROKER', class_name : 'Auto3DAgentBroker' }], observability : { enabled : true } };
const body = new FormData (); body.set ('metadata', new Blob ([JSON.stringify (metadata)], { type : 'application/json' })); body.set ('broker.js', new Blob ([await readFile ('build/mcp-workers/broker.js')], { type : 'application/javascript+module' }), 'broker.js');
await api ('/workers/scripts/auto3d-mcp-broker-live', { method : 'PUT', body });
console.log ('Private live MCP broker updated; OAuth and identity remain in Pages.');
