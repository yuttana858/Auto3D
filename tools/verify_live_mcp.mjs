const origin = 'https://auto3d-5av.pages.dev';
async function read (path, status = 200)
{
    const response = await fetch (origin + path, { cache : 'no-store', signal : AbortSignal.timeout (15000) });
    if (response.status !== status) { throw new Error ('Live MCP probe failed for ' + path + ': HTTP ' + response.status); } return response;
}
const metadata = await (await read ('/.well-known/oauth-protected-resource/mcp')).json ();
if (metadata.resource !== origin + '/mcp' || metadata.authorization_servers?.[0] !== origin + '/oauth') { throw new Error ('Incorrect MCP resource metadata.'); }
const scopes = ['auto3d.read', 'auto3d.write', 'auto3d.capture'];
if (JSON.stringify (metadata.scopes_supported) !== JSON.stringify (scopes)) { throw new Error ('Live MCP must advertise the unified read, write and screenshot permissions.'); }
const oauth = await (await read ('/.well-known/oauth-authorization-server/oauth')).json ();
if (oauth.issuer !== origin + '/oauth' || !oauth.code_challenge_methods_supported?.includes ('S256')) { throw new Error ('Incorrect OAuth discovery or PKCE support.'); }
for (const endpoint of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) { if (new URL (oauth[endpoint]).origin !== origin) { throw new Error ('OAuth endpoint is outside the live origin.'); } }
const challenge = await read ('/mcp', 401);
if (!challenge.headers.get ('WWW-Authenticate')?.includes ('oauth-protected-resource/mcp')) { throw new Error ('MCP Bearer challenge missing.'); }
if (!challenge.headers.get ('WWW-Authenticate')?.includes ('scope="' + scopes.join (' ') + '"')) { throw new Error ('MCP Bearer challenge does not include every connection permission.'); }
await read ('/api/agent/config', 401); await read ('/api/personal/items', 401);
const consent = await read ('/oauth/authorize', 401);
if (consent.headers.get ('Referrer-Policy') !== 'same-origin') { throw new Error ('Consent page does not preserve its form Origin.'); }
console.log ('Live MCP discovery, S256 PKCE advertisement, unauthenticated challenge, consent referrer policy and existing Library authentication verified. Interactive administrator OAuth and real ChatGPT connection still require testing.');
