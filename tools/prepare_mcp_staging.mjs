import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PilotConfig } from '../mcp/common.js';

// Configuration inputs are non-secret. Credentials remain in Cloudflare secrets.
const names = ['AUTO3D_MCP_PILOT_ACCOUNTS', 'AUTO3D_MCP_STAGING_SUPABASE_URL', 'AUTO3D_MCP_PRODUCTION_SUPABASE_URL'];
const vars = Object.fromEntries (names.map (name => [name, process.env[name] || '']));
Object.assign (vars, { AUTO3D_MCP_PILOT : '1', AUTO3D_MCP_ORIGIN : 'https://auto3d-mcp-pilot.pages.dev', SUPABASE_URL : vars.AUTO3D_MCP_STAGING_SUPABASE_URL });
PilotConfig (vars);
const kv = process.env.AUTO3D_MCP_OAUTH_KV_ID;
if (!/^[a-f0-9]{32}$/.test (kv || '')) { throw new Error ('Set the isolated staging AUTO3D_MCP_OAUTH_KV_ID.'); }
await mkdir ('build/mcp-config', { recursive : true });
const broker = 'auto3d-mcp-broker-staging';
for (const role of ['broker', 'auth', 'gateway', 'resource']) {
    const config = {
        name : 'auto3d-mcp-' + role + '-staging', main : path.resolve ('build/mcp-workers/' + role + '.js'),
        compatibility_date : '2026-11-03', compatibility_flags : ['nodejs_compat', 'global_fetch_strictly_public'],
        workers_dev : false, preview_urls : false, keep_vars : true, observability : { enabled : true },
        vars : role === 'broker' ? {} : vars,
        durable_objects : { bindings : [{ name : 'AUTO3D_AGENT_BROKER', class_name : 'Auto3DAgentBroker', ...(role === 'broker' ? {} : { script_name : broker }) }] }
    };
    if (role === 'broker') { config.migrations = [{ tag : 'v1', new_sqlite_classes : ['Auto3DAgentBroker'] }]; }
    if (role === 'auth') { config.kv_namespaces = [{ binding : 'OAUTH_KV', id : kv }]; }
    if (role === 'resource') { config.services = [{ binding : 'AUTO3D_AUTH_SERVER', service : 'auto3d-mcp-auth-staging' }]; }
    await writeFile ('build/mcp-config/' + role + '.json', JSON.stringify (config, null, 2));
}
await writeFile ('build/mcp-config/pages.json', JSON.stringify ({ name : 'auto3d-mcp-pilot', pages_build_output_dir : path.resolve ('build/mcp-pilot'), compatibility_date : '2026-11-03', compatibility_flags : ['nodejs_compat'], vars, services : [
    { binding : 'AUTO3D_MCP_AUTH', service : 'auto3d-mcp-auth-staging' },
    { binding : 'AUTO3D_MCP_GATEWAY', service : 'auto3d-mcp-gateway-staging' },
    { binding : 'AUTO3D_MCP_RESOURCE', service : 'auto3d-mcp-resource-staging' }
] }, null, 2));
console.log ('Staging-only deployment configurations prepared; no secrets written and no deployment performed.');
