import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const appearance = { schemaVersion : 1, sourceFormat : 'step', colors : { detected : 2, glb : 'preserved', step : 'preserved' }, transparency : { detected : 1, glb : 'preserved', step : 'preserved' }, materials : { detected : 0, glb : 'not_present', step : 'not_present' }, imageTextures : { detected : null, status : 'not_exposed_by_reader' }, stl : 'geometry_only', validation : 'passed' };
const inventory = structuredClone (appearance); inventory.validation = 'not_run';
for (const key of ['colors', 'transparency', 'materials']) { inventory[key].glb = inventory[key].step = 'not_run'; }

const owner = '00000000-0000-4000-8000-000000000001', jobId = '00000000-0000-4000-8000-000000000002', attempt = '00000000-0000-4000-8000-000000000003', token = 'a'.repeat (43);
const hash = data => createHash ('sha256').update (data).digest ('hex');
const report = { schemaVersion : 1, versions : { worker : '0.4.0', reader : '0.3.17', occt : '7.9.3.1.1' }, outcome : 'error_detected', phase : 'build_geometry', failureCode : 'invalid_geometry', readerCode : 'occt.construction_failed', exception : 'Standard_ConstructionError', frames : ['surfaces:100'], checks : { sourceRead : 'passed', geometryBuild : 'failed', geometryValidation : 'not_run', stepExport : 'not_run', stepReimport : 'not_run' } };
const job = { id : jobId, owner_id : owner, active_attempt : attempt, token_hash : hash (token), state : 'running', source_sha256 : hash ('fixture'), source_name : 'public.step', source_extension : 'step', source_bytes : 7, source_unit : null, lease_until : new Date (Date.now () + 120000).toISOString (), deadline_at : new Date (Date.now () + 600000).toISOString (), expires_at : new Date (Date.now () + 86400000).toISOString () };
const script = `import { UploadJobObject, ArtifactKey, SourceKey } from './functions/_lib/conversionjobs.js';
import { WorkerOperation, ValidateJobResult } from './functions/_lib/conversionworker.js';
export default {async fetch(request,env) {try { const u=new URL(request.url), job=env.JOB;
if(u.pathname==='/put') { const object=await UploadJobObject(env,request,u.searchParams.get('key')||SourceKey(job),Number(u.searchParams.get('bytes')),u.searchParams.get('hash'),'application/octet-stream'); return Response.json({bytes:object.size}); }
if(u.pathname==='/read') {const object=await env.AUTO3D_LIBRARY_R2.get(SourceKey(job));return new Response(object?.body||null,{status:object?200:404});}
if(u.pathname==='/validate') return Response.json(await ValidateJobResult(env,job));
const result=await WorkerOperation(env,request,u.pathname.slice(1).split('/')); return result instanceof Response?result:Response.json(result);
}catch(error){return Response.json({code:error.code||'invalid_evidence'},{status:error.status||400});}}};`;
const bundled = await build ({ stdin : { contents : script, resolveDir : process.cwd () }, bundle : true, format : 'esm', platform : 'browser', write : false });
let disabled = false, published = 0, reports = 0;
const runtime = new Miniflare (convertV4MiniflareOptions ({ workers : [{ name : 'cad-streams', modules : true, script : bundled.outputFiles[0].text, compatibilityDate : '2026-11-03', r2Buckets : ['AUTO3D_LIBRARY_R2'], bindings : { JOB : job, SUPABASE_URL : 'https://fixture.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_fixture' }, outboundService : async request => {
    assert.equal (request.headers.get ('apikey'), 'sb_secret_fixture');
    if (request.url.includes ('account_controls')) { return Response.json ([{ disabled }]); }
    if (request.url.includes ('rpc/auto3d_conversion_transition')) { const body = await request.json (); assert.equal (body.p_owner, owner); assert.equal (body.p_attempt, attempt); if (body.p_event === 'complete') { if (job.purpose === 'diagnostic') { reports++; assert.deepEqual (body.p_data.report, report); } else { published++; assert.ok (body.p_data.summary.stepReimportPassed); } } return Response.json ({ job : { ...job, state : body.p_event === 'complete' ? job.purpose === 'diagnostic' ? 'failed' : 'ready' : 'running' }, claimed : body.p_event === 'claim' }); }
    return Response.json ([job]);
} }] }));
const origin = 'https://cad.test';
const prefix = 'conversion-jobs/' + owner + '/' + jobId + '/';
const put = (data, key = prefix + 'source.step', expected = hash (data), bytes = data.length) => runtime.dispatchFetch (origin + '/put?key=' + encodeURIComponent (key) + '&bytes=' + bytes + '&hash=' + expected, { method : 'PUT', headers : { 'Content-Length' : String (data.length) }, body : data });
const callback = (operation, body = {}, bearer = token, protocol = '1') => runtime.dispatchFetch (origin + '/' + jobId + '/' + attempt + '/' + operation, { method : 'POST', headers : { Authorization : 'Bearer ' + bearer, 'Content-Type' : 'application/json', ...(protocol ? { 'X-Auto3D-Diagnostic-Protocol' : protocol } : {}) }, body : JSON.stringify (body) });
try {
    let response = await put ('fixture'); assert.equal (response.status, 200); assert.equal (await (await runtime.dispatchFetch (origin + '/read')).text (), 'fixture');
    assert.equal ((await put ('fixture')).status, 200, 'identical replay is idempotent');
    assert.equal ((await put ('changed')).status, 409, 'source is immutable');
    assert.equal ((await put ('mismatch', prefix + 'bad', hash ('other'))).status, 400, 'R2 verifies checksum rather than trusting a header');
    assert.equal ((await put ('fixture', prefix + 'length', hash ('fixture'), 3)).status, 400, 'declared/expected length mismatch rejected');
    assert.equal ((await callback ('claim', {}, 'b'.repeat (43))).status, 404);
    assert.equal ((await callback ('claim')).status, 200);
    disabled = true; assert.equal ((await callback ('progress', { stage : 'converting' })).status, 403); disabled = false;
    assert.equal ((await callback ('complete')).status, 400, 'incomplete artifacts cannot publish'); assert.equal (published, 0);
    const artifacts = {};
    for (const [kind, units] of [['step', 'mm'], ['glb', 'm'], ['stl', 'mm']]) { const data = 'public-' + kind; const key = prefix + attempt + '/model.' + kind; assert.equal ((await put (data, key)).status, 200); artifacts[kind] = { filename : 'model.' + kind, bytes : data.length, sha256 : hash (data), units }; }
    const manifest = { schema_version : 1, producer : 'cloud-3d-studio', producer_version : '0.5.0', appearance, status : 'validated', source : { sha256 : job.source_sha256 }, artifacts, cad_validation : { passed : true }, mesh_validation : { passed : true }, cad : { dimensions_mm : [40, 30, 20], topology : { solids : 1, shells : 1, faces : 6, edges : 12, vertices : 8 } } };
    assert.equal ((await put (JSON.stringify (manifest), prefix + attempt + '/manifest.json')).status, 200);
    response = await callback ('complete'); assert.equal (response.status, 200); assert.equal ((await response.json ()).state, 'ready'); assert.equal (published, 1);
    const validated = await (await runtime.dispatchFetch (origin + '/validate')).json (); assert.deepEqual (validated.summary.appearance, appearance);
    assert.equal ((await callback ('complete', { arbitrary : 'private' })).status, 400);
    job.purpose = 'diagnostic';
    assert.equal ((await (await callback ('claim', {}, token, null)).json ()).accepted, false, 'an older worker must not claim diagnostic work');
    assert.equal ((await (await callback ('claim')).json ()).purpose, 'diagnostic');
    const forbiddenArtifact = await runtime.dispatchFetch (origin + '/' + jobId + '/' + attempt + '/artifacts/glb', { method : 'PUT', headers : { Authorization : 'Bearer ' + token, 'Content-Length' : '7', 'X-Content-SHA256' : hash ('fixture') }, body : 'fixture' });
    assert.equal (forbiddenArtifact.status, 409, 'diagnostic capability cannot publish model artifacts');
    assert.equal ((await callback ('complete', { report : { ...report, text : 'private raw log' } })).status, 400);
    assert.equal ((await callback ('complete', { report : { ...report, frames : ['/private/source.x_t:1'] } })).status, 400);
    response = await callback ('complete', { report }); assert.equal (response.status, 200); assert.equal ((await response.json ()).state, 'failed'); assert.equal (reports, 1); assert.equal (published, 1);
    assert.equal ((await callback ('complete', { report, appearance : { ...inventory, path : '/private' } })).status, 400);
    assert.equal ((await callback ('complete', { report, appearance : inventory })).status, 200); assert.equal (reports, 2); assert.equal (published, 1);
    job.deadline_at = new Date (Date.now () - 1).toISOString ();
    assert.equal ((await callback ('claim')).status, 410, 'diagnostic deadline revokes the worker capability');
    assert.equal ((await runtime.dispatchFetch (origin + '/' + jobId + '/' + attempt + '/source', { headers : { Authorization : 'Bearer ' + token } })).status, 410, 'expired diagnostic capability cannot stream the retained source');
    console.log ('CAD transfers passed in workerd: known-length streaming, SHA-256 enforcement, immutable replay, account revocation, job capability authorization and complete-manifest publication.');
    console.log ('Server diagnostics passed in workerd: protocol negotiation, model publication denied and strict geometry-free report egress.');
} finally { await runtime.dispose (); }
