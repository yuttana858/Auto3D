// Disposable local test provider; no real service or account is contacted.
globalThis.fetch = async (url, options = {}) => {
    const path = new URL (url).pathname;
    if (path === '/.well-known/oauth-authorization-server/oauth') { return Response.json ({ authorization_endpoint : 'https://auto3d-5av.pages.dev/oauth/authorize', token_endpoint : 'https://auto3d-5av.pages.dev/oauth/token', registration_endpoint : 'https://auto3d-5av.pages.dev/oauth/register' }); }
    if (path === '/oauth/register') { return Response.json ({ client_id : 'fixture-client' }); }
    if (path === '/oauth/token') { return Response.json ({ access_token : 'fixture-secret-token' }); }
    if (path === '/mcp') { const request = JSON.parse (options.body); return Response.json ({ jsonrpc : '2.0', id : request.id, result : request.method === 'initialize' ? { serverInfo : { name : 'Auto3D', version : 'test-version' } } : { tools : [{ name : 'auto3d.sessions.pair_code' }, { name : 'auto3d.design' }] } }); }
    throw new Error ('Unexpected diagnostic request');
};
