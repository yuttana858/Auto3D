// Run on the user's own computer: node docs/diagnose_mcp_discovery.mjs
// Tokens and authorization codes stay in memory and are never printed.
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';

const origin = 'https://auto3d-5av.pages.dev';
const resource = origin + '/mcp';
async function json (url, options = {})
{
    const response = await fetch (url, { ...options, cache : 'no-store', signal : AbortSignal.timeout (20000) });
    if (!response.ok) { throw new Error ('Request failed (' + response.status + ') at ' + new URL (url).pathname); }
    return response.json ();
}
function postForm (fields) { return { method : 'POST', headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams (fields) }; }
const metadata = await json (origin + '/.well-known/oauth-authorization-server/oauth');
for (const field of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) { if (new URL (metadata[field]).origin !== origin) { throw new Error ('Unexpected authorization endpoint.'); } }
const listener = createServer ();
listener.listen (0, '127.0.0.1'); await once (listener, 'listening');
const callback = 'http://127.0.0.1:' + listener.address ().port + '/callback';
try {
    const client = await json (metadata.registration_endpoint, { method : 'POST', headers : { 'Content-Type' : 'application/json' }, body : JSON.stringify ({ client_name : 'Auto3D discovery diagnostic', redirect_uris : [callback], token_endpoint_auth_method : 'none', grant_types : ['authorization_code'], response_types : ['code'] }) });
    if (typeof client.client_id !== 'string' || !client.client_id) { throw new Error ('Client registration failed.'); }
    const verifier = randomBytes (32).toString ('base64url'), challenge = createHash ('sha256').update (verifier).digest ('base64url'), state = randomBytes (32).toString ('base64url');
    const url = new URL (metadata.authorization_endpoint);
    url.search = new URLSearchParams ({ client_id : client.client_id, response_type : 'code', redirect_uri : callback, resource, scope : 'auto3d.read auto3d.write', state, code_challenge : challenge, code_challenge_method : 'S256' }).toString ();
    const result = new Promise ((resolve, reject) => {
        const timeout = setTimeout (() => reject (new Error ('Authorization timed out.')), 600000);
        listener.on ('request', (request, response) => {
            try {
                const callbackUrl = new URL (request.url, callback), returned = callbackUrl.searchParams.get ('state') || '';
                if (callbackUrl.pathname !== '/callback' || returned.length !== state.length || !timingSafeEqual (Buffer.from (returned), Buffer.from (state))) { response.writeHead (400); response.end ('Invalid callback.'); return; }
                const code = callbackUrl.searchParams.get ('code'); if (!code) { response.writeHead (400); response.end ('Authorization was not completed.'); clearTimeout (timeout); reject (new Error ('Authorization was denied or failed.')); return; }
                response.writeHead (200, { 'Content-Type' : 'text/plain', 'Cache-Control' : 'no-store' }); response.end ('Authorization complete. Return to your terminal.'); clearTimeout (timeout); resolve (code);
            } catch { response.writeHead (400); response.end ('Invalid callback.'); }
        });
    });
    console.log ('Open the following URL in your browser, sign in to Auto3D, and approve the diagnostic. Do not share the URL or callback address.');
    console.log (url.href);
    const code = await result;
    const token = await json (metadata.token_endpoint, postForm ({ grant_type : 'authorization_code', client_id : client.client_id, code, code_verifier : verifier, redirect_uri : callback, resource }));
    if (typeof token.access_token !== 'string') { throw new Error ('Token exchange failed.'); }
    async function rpc (id, method, params)
    {
        const response = await json (resource, { method : 'POST', headers : { Authorization : 'Bearer ' + token.access_token, 'Content-Type' : 'application/json', Accept : 'application/json, text/event-stream' }, body : JSON.stringify ({ jsonrpc : '2.0', id, method, params }) });
        if (response.error || !response.result) { throw new Error ('MCP ' + method + ' failed.'); } return response.result;
    }
    const info = await rpc (1, 'initialize', { protocolVersion : '2025-03-26', capabilities : {}, clientInfo : { name : 'Auto3D discovery diagnostic', version : '1.0.0' } });
    const list = await rpc (2, 'tools/list', {});
    if (!Array.isArray (list.tools)) { throw new Error ('MCP returned an invalid tool list.'); }
    console.log ('Server:', info.serverInfo?.name, info.serverInfo?.version);
    console.log ('Tools:', list.tools.map (item => item.name).sort ().join (', '));
    console.log ('No scene commands were run. Tokens were not saved. Revoke the diagnostic registration in Agent access when finished.');
} finally { listener.close (); }
