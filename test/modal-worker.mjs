import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Real workerd execution; fake outbound services, no real credentials or Modal billing.
const settings = { workspace : 'fixture', environment : 'main', app : 'cloud-3d-studio', endpoint : 'https://fixture--gateway.modal.run', tokenId : 'wk-workerfixture123', tokenSecret : 'ws-privateworkerfixture123' };
const contents = "import { TestModalConnection } from './functions/_lib/modalconnection.js'; export default { async fetch(request,env) { try { return Response.json(await TestModalConnection(env)); } catch(error) { return Response.json({code:error.code},{status:error.status||500}); } } };";
const bundled = await build ({ stdin : { contents, resolveDir : process.cwd () }, bundle : true, format : 'esm', platform : 'browser', write : false });
let redirect = false; const requests = [];
const runtime = new Miniflare (convertV4MiniflareOptions ({ workers : [{ name : 'modal-bridge',
    modules : true, script : bundled.outputFiles[0].text, compatibilityDate : '2026-11-03',
    bindings : { SUPABASE_URL : 'https://fixture.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_fixture', AUTO3D_MODAL_PROFILE : 'preview', CF_PAGES_BRANCH : 'feature' },
    outboundService : async request => {
        requests.push (request.url);
        if (request.url.startsWith ('https://fixture.supabase.co/')) {
            assert.equal (request.headers.get ('apikey'), 'sb_secret_fixture'); assert.equal (request.headers.get ('authorization'), null);
            assert.deepEqual (await request.json (), { p_profile : 'preview', p_purpose : 'runtime' });
            return Response.json ({ schema : 1, profile : 'preview', purpose : 'runtime', settings, revision : '00000000-0000-4000-8000-000000000001' });
        }
        assert.equal (request.url, settings.endpoint + '/connection'); assert.equal (request.headers.get ('Modal-Key'), settings.tokenId); assert.equal (request.headers.get ('Modal-Secret'), settings.tokenSecret);
        return redirect ? new Response (null, { status : 302, headers : { Location : 'https://evil.test/' } }) : Response.json ({ service : 'cloud-3d-studio', protocol : 1, version : '0.2.0', workspace : 'fixture', environment : 'main', app : 'cloud-3d-studio', conversionReady : false });
    }
}] }));
try {
    let response = await runtime.dispatchFetch ('https://auto3d.test/'); assert.equal (response.status, 200); const result = await response.json ();
    assert.equal (result.connected, true); assert.equal (result.conversionReady, false); assert.ok (!JSON.stringify (result).includes (settings.tokenSecret));
    redirect = true; requests.length = 0;
    response = await runtime.dispatchFetch ('https://auto3d.test/'); assert.equal (response.status, 502); assert.equal ((await response.json ()).code, 'MODAL_NETWORK_FAILED');
    assert.equal (requests.length, 2); assert.ok (!requests.some (url => url.startsWith ('https://evil.test')));
    console.log ('Modal bridge passed in workerd: server-only Vault headers, proxy tokens, identity validation, no conversion claim and refusal of credentialed redirects.');
} finally { await runtime.dispose (); }
