import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const id = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const sha = createHash ('sha256').update ('public-fixture').digest ('hex');
const job = { id, owner_id : owner, state : 'failed', source_extension : 'x_t', source_unit : 'mm', source_bytes : 14, source_sha256 : sha, expires_at : new Date (Date.now () + 3600000).toISOString (), attempts : 1, diagnostic_attempts : 0 };
const runtimeRecord = { schema : 1, profile : 'production', purpose : 'runtime', revision : owner, settings : { workspace : 'fixture', environment : 'main', app : 'cloud-3d-studio', endpoint : 'https://fixture--cad-gateway.us-east.modal.run', tokenId : 'wk-runtimefixture', tokenSecret : 'ws-runtimefixture' } };
const key = createHmac ('sha256', runtimeRecord.settings.tokenSecret).update ('auto3d-conversion-control:v1:production:fixture:main').digest ('base64url');
let disabled = false, patch = {};
const script = `import {onRequest as control} from './functions/internal/conversion-control/[[path]].js';
import {onRequest as source} from './functions/internal/conversion-proof/[[path]].js';
export default {async fetch(request,env){if(new URL(request.url).pathname==='/seed'){await env.AUTO3D_LIBRARY_R2.put('conversion-jobs/${owner}/${id}/source.x_t','public-fixture',{customMetadata:{sha256:'${sha}'}});return new Response('ok');}return new URL(request.url).pathname.includes('conversion-control')?control({request,env}):source({request,env});}};`;
const bundle = await build ({ stdin : { contents : script, resolveDir : process.cwd () }, bundle : true, format : 'esm', platform : 'browser', write : false });
const mf = new Miniflare (convertV4MiniflareOptions ({ workers : [{ name : 'proof', modules : true, script : bundle.outputFiles[0].text, compatibilityDate : '2026-11-03', r2Buckets : ['AUTO3D_LIBRARY_R2'], bindings : { AUTO3D_MODAL_PROFILE : 'production', SUPABASE_URL : 'https://fixture.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_fixture' }, outboundService : async request => {
    if (request.url.includes ('auto3d_modal_connection_read')) { assert.equal (request.method, 'POST'); return Response.json (runtimeRecord); }
    assert.equal (request.method, 'GET', 'proof must never mutate metadata');
    if (request.url.includes ('account_controls')) { return Response.json ([{ disabled }]); }
    return Response.json ([{ ...job, ...patch }]);
} }] }));
const origin = 'https://proof.test';
const grant = (body = { jobId : id }, authorization = key) => mf.dispatchFetch (origin + '/internal/conversion-control/proof', { method : 'POST', headers : { Authorization : 'Bearer ' + authorization }, body : JSON.stringify (body) });
const read = (token, jobId = id, method = 'GET', host = origin) => mf.dispatchFetch (host + '/internal/conversion-proof/' + jobId + '/source', { method, headers : { Authorization : 'Bearer ' + token } });
try {
    await mf.dispatchFetch (origin + '/seed');
    assert.equal ((await grant ({ jobId : id }, 'wrong')).status, 404);
    assert.notEqual ((await grant ({ jobId : id, scope : 'write' })).status, 200);
    const response = await grant (); assert.equal (response.status, 200);
    const ref = await response.json (); assert.ok (ref.token); assert.equal (ref.sourceUnit, 'mm');
    assert.equal (await (await read (ref.token)).text (), 'public-fixture');
    assert.equal ((await read (ref.token)).headers.get ('Cache-Control'), 'private, no-store');
    assert.equal ((await read (ref.token, id, 'PUT')).status, 404, 'read capability cannot publish');
    assert.equal ((await read (ref.token, id, 'GET', 'https://another.test')).status, 404, 'origin binding');
    assert.equal ((await read (ref.token.slice (0, -1) + (ref.token.endsWith ('a') ? 'b' : 'a'))).status, 404);
    assert.equal ((await read ('1000000000.' + 'a'.repeat (64))).status, 404, 'expired capability');
    for (const value of [{ owner_id : id }, { source_sha256 : 'b'.repeat (64) }, { source_unit : 'in' }, { state : 'ready' }, { state : 'deleted' }]) {
        patch = value; assert.notEqual ((await read (ref.token)).status, 200, 'changed ownership/source/state revokes capability');
    }
    patch = { expires_at : new Date (Date.now () - 1).toISOString () }; assert.equal ((await read (ref.token)).status, 410);
    patch = {}; disabled = true; assert.equal ((await read (ref.token)).status, 403); assert.notEqual ((await grant ()).status, 200);
    assert.equal (job.attempts, 1); assert.equal (job.diagnostic_attempts, 0);
    console.log ('Private CAD proof passed in workerd: control authorization, read-only streaming, source/owner/origin binding, revocation and expiry; no job writes.');
} finally { await mf.dispose (); }
