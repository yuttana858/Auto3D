import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CadRequest, CadLimits } from '../source/website/cadconversioncontract.js';
import { CadConversions } from '../source/website/cadconversion.js';
import { AddConvertedModel } from '../source/website/cadconversionimport.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { Model } from '../source/engine/model/model.js';
import { Unit } from '../source/engine/model/unit.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import { GenerateCuboid, GeneratorParams } from '../source/engine/model/generator.js';
import { FinalizeModel } from '../source/engine/model/modelfinalization.js';
import { Direction } from '../source/engine/geometry/geometry.js';
import { MeasureWorldBoundsMm } from '../source/website/autopackworkspace.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { onRequest } from '../functions/api/conversions/[[path]].js';
import { PublicJob, ControlKey, SafeEqual } from '../functions/_lib/conversionjobs.js';

const owner = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
const id = () => crypto.randomUUID ();
const request = () => ({ requestKey : id (), sourceName : 'public-box.step', extension : 'step', sourceBytes : 7, sourceSha256 : 'a'.repeat (64), sourceUnit : null, quality : 'standard', origin : { windowId : id (), tabId : id (), revision : 0 } });
function sourceModel (unit = Unit.Meter, sizes = [.04, .03, .02]) { const model = new Model (); model.SetUnit (unit); model.AddMaterial (new PhysicalMaterial ()); model.AddMeshToRootNode (GenerateCuboid (new GeneratorParams ().SetMaterial (0), ...sizes)); FinalizeModel (model, {}); return model; }
function website ()
{
    const website = { auth : { user : { id : owner }, generation : 1, Subscribe : () => () => {} }, accountReady : true };
    const editor = { website, document : new SceneDocument (), selected : null, selectedIds : new Set (), sessions : { active : id () }, recoveryRevision : 0, Render : async (fit, check) => check?.(), Status () {} };
    editor.history = new SceneHistory (() => editor.recoveryRevision++); website.sessionEditor = editor; return website;
}
const resultJob = () => ({ id : id (), source : { name : 'public-box.step', sha256 : 'a'.repeat (64), unit : null }, summary : { producerVersion : '0.3.0', dimensionsMm : [40, 30, 20] } });

describe ('Private CAD conversion contract and account service', () => {
    it ('requires known Parasolid units, embedded STEP units, strict fields and bounded input', () => {
        assert.ok (CadRequest (request ()));
        for (const change of [{ sourceBytes : CadLimits.inputBytes + 1 }, { sourceName : '../private.step' }, { sourceName : 'bad\n.step' }, { sourceUnit : 'mm' }, { quality : 'invented' }, { url : 'https://evil.test' }, { origin : { ...request ().origin, token : 'private' } }]) { assert.throws (() => CadRequest ({ ...request (), ...change })); }
        assert.throws (() => CadRequest ({ ...request (), extension : 'x_t' }));
        assert.ok (CadRequest ({ ...request (), extension : 'x_b', sourceUnit : 'in' }));
    });
    it ('stages on device without uploading and refuses read-only submission', async () => {
        let calls = 0; const site = website (), cad = new CadConversions (site, async () => { calls++; });
        cad.Stage (new File (['fixture'], 'product.x_t')); assert.equal (calls, 0);
        await assert.rejects (cad.Submit (), /actual Parasolid/); assert.equal (calls, 0);
        site.sessionEditor.readOnly = true; await assert.rejects (cad.Submit ({ sourceUnit : 'mm' })); assert.equal (calls, 0);
    });
    it ('fails closed when account or login generation changes during a request', async () => {
        const site = website (), cad = new CadConversions (site, async () => { site.auth.generation++; return Response.json ({ jobs : [] }); });
        await assert.rejects (cad.List (), /account or session changed/i);
        const changed = new CadConversions (site, async () => { site.auth.user = { id : other }; return Response.json ({ jobs : [] }); });
        await assert.rejects (changed.List (), /account or session changed/i);
    });
    it ('clears staged file handles when the owner changes', () => {
        const site = website (); let changed; site.auth.Subscribe = listener => { changed = listener; return () => {}; };
        const cad = new CadConversions (site); cad.Stage (new File (['private-local-fixture'], 'product.step'));
        site.auth.user = { id : other }; changed (site.auth.user); assert.equal (cad.file, null); assert.equal (cad.pending, null);
    });
    it ('uses one idempotency key after a lost create response and never imports automatically', async () => {
        const site = website (), requests = [], keys = []; let lose = true, state = 'awaiting_upload'; const jobId = id ();
        const cad = new CadConversions (site, async (path, options) => {
            requests.push ([path, options.method]); assert.equal (options.headers['X-Auto3D-Account'], owner);
            const job = () => ({ id : jobId, revision : 1, state });
            if (path === '/api/conversions') { keys.push (JSON.parse (options.body).requestKey); if (lose) { lose = false; throw new Error ('Network response lost'); } return Response.json ({ job : job () }); }
            if (path.endsWith ('/source')) { assert.ok (options.body instanceof File); return Response.json ({ uploaded : true }); }
            if (path.endsWith ('/submit')) { state = 'queued'; return Response.json ({ job : job () }); }
            return Response.json ({ job : job () });
        });
        cad.Stage (new File (['fixture'], 'public-box.step'));
        await assert.rejects (cad.Submit ()); assert.equal ((await cad.Submit ()).job.state, 'queued'); assert.equal (keys[0], keys[1]);
        assert.equal (site.sessionEditor.document.objects.length, 0); assert.equal (requests.filter (item => item[0].endsWith ('/source')).length, 1);
    });
    it ('requires an explicit current window/tab/revision before any import transfer', async () => {
        const site = website (), cad = new CadConversions (site, () => { throw new Error ('Must not transfer'); });
        await assert.rejects (cad.Import (id (), { ...cad.Origin (), windowId : id () }), /account or session changed/i);
        const registry = CreateAgentCommands (site);
        assert.equal ((await registry.Execute ('conversion.import', { jobId : id () })).ok, false);
        assert.equal ((await registry.Execute ('conversion.submit', { sourceUrl : 'https://evil.test' })).ok, false);
        assert.equal ((await registry.Execute ('conversion.sample', { arbitrary : true })).ok, false);
        const inspected = await registry.Execute ('conversion.inspect', {}); assert.equal (inspected.ok, true);
    });
    it ('rechecks ready state after parsing so a withdrawn result never commits', async () => {
        const site = website (), cad = new CadConversions (site); let reads = 0;
        cad.Get = async () => ({ ...resultJob (), state : ++reads === 1 ? 'ready' : 'cancelled' });
        cad.Artifact = async () => Uint8Array.from (Buffer.from (readFileSync ('test/testfiles/cad-conversion-box.glb.b64', 'utf8').trim (), 'base64')).buffer;
        await assert.rejects (cad.Import (id (), cad.Origin ()), /conversion changed/i);
        assert.equal (reads, 2); assert.equal (site.sessionEditor.document.objects.length, 0); assert.equal (site.sessionEditor.history.undo.length, 0);
    });
});

describe ('Converted CAD scene units and atomic import', () => {
    for (const [unit, factor] of [[Unit.Millimeter, 1], [Unit.Centimeter, 10], [Unit.Meter, 1000], [Unit.Inch, 25.4], [Unit.Foot, 304.8]]) {
        it ('preserves physical size in scene unit ' + unit + ' with one Undo/Redo', async () => {
            const site = website (), editor = site.sessionEditor;
            const previous = editor.document.AddImported (sourceModel (unit, [1, 1, 1]), 'existing'); editor.selected = previous; editor.selectedIds = new Set ([previous.id]);
            const value = await AddConvertedModel (editor, { model : sourceModel (), upVector : Direction.Y }, resultJob (), () => {});
            const object = editor.document.objects.find (object => object.id === value.objectId), bounds = MeasureWorldBoundsMm (editor.document, object, factor);
            bounds.size.forEach ((size, index) => assert.ok (Math.abs (size - [40, 30, 20][index]) < 1e-7));
            assert.equal (editor.history.undo.length, 1); assert.equal (object.unit, unit);
            assert.ok (!JSON.stringify (object.userData).includes ('modal.run'));
            await editor.history.Undo (); assert.deepEqual (editor.document.objects, [previous]); assert.equal (editor.selected, previous);
            await editor.history.Redo (); assert.equal (editor.document.objects.length, 2); assert.equal (editor.selected.id, object.id);
        });
    }
    it ('adopts meters only for an empty scene and restores its previous units on Undo', async () => {
        const editor = website ().sessionEditor, original = editor.document.model.GetUnit ();
        await AddConvertedModel (editor, { model : sourceModel (), upVector : Direction.Y }, resultJob (), () => {});
        assert.equal (editor.document.model.GetUnit (), Unit.Meter); await editor.history.Undo (); assert.equal (editor.document.model.GetUnit (), original);
        await editor.history.Redo (); assert.equal (editor.document.model.GetUnit (), Unit.Meter);
    });
    it ('refuses an unknown existing scale and rolls back render/account/session failures before history', async () => {
        const editor = website ().sessionEditor;
        editor.document.AddImported (sourceModel (Unit.Unknown), 'unknown');
        await assert.rejects (AddConvertedModel (editor, { model : sourceModel (), upVector : Direction.Y }, resultJob (), () => {}), /scene units/);
        const fresh = website ().sessionEditor, target = fresh.document;
        fresh.Render = async () => { fresh.document = new SceneDocument (); };
        await assert.rejects (AddConvertedModel (fresh, { model : sourceModel (), upVector : Direction.Y }, resultJob (), () => { if (fresh.document !== target) { throw new Error ('Session changed'); } }), /Session changed/);
        assert.equal (target.objects.length, 0); assert.equal (target.model.meshes.length, 0); assert.equal (fresh.document.objects.length, 0); assert.equal (fresh.history.undo.length, 0);
    });
});

describe ('Owned conversion API isolation', () => {
    it ('requires account binding and refuses cross-origin writes before accessing storage', async () => {
        for (const [data, headers, expected] of [[{}, {}, 401], [{ user : { id : owner } }, {}, 409], [{ user : { id : owner } }, { 'X-Auto3D-Account' : owner, Origin : 'https://evil.test' }, 403]]) {
            const response = await onRequest ({ env : {}, data, request : new Request ('https://auto3d-5av.pages.dev/api/conversions', { method : 'POST', headers }) }); assert.equal (response.status, expected);
        }
    });
    it ('queries the authenticated owner and returns 404 for another account’s job', async () => {
        const original = globalThis.fetch, seen = []; globalThis.fetch = async url => { seen.push (String (url)); return Response.json ([]); };
        try { const response = await onRequest ({ env : { SUPABASE_URL : 'https://fixture.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_fixture', AUTO3D_LIBRARY_R2 : {} }, data : { user : { id : owner } }, request : new Request ('https://auto3d-5av.pages.dev/api/conversions/' + id (), { headers : { 'X-Auto3D-Account' : owner } }) }); assert.equal (response.status, 404); assert.ok (seen.at (-1).includes ('owner_id=eq.' + owner)); }
        finally { globalThis.fetch = original; }
    });
    it ('never exposes provider references, bearer digests or private storage keys in job DTOs', () => {
        const job = PublicJob ({ id : id (), state : 'ready', artifacts : { glb : { bytes : 100 } }, source_name : 'public.step', summary : {}, token_hash : 'private-digest', provider_call_id : 'fc-private', owner_id : owner, active_attempt : id (), source_key : 'private-r2-path', expires_at : new Date (Date.now () + 60000).toISOString () });
        const text = JSON.stringify (job); for (const value of ['private-digest', 'fc-private', 'private-r2-path', 'owner_id', 'active_attempt']) { assert.ok (!text.includes (value)); }
        assert.equal (SafeEqual ('same', 'same'), true); assert.equal (SafeEqual ('same', 'same-long'), false);
    });
    it ('derives exactly the Python profile-bound controller key without using deployment credentials', async () => {
        const original = globalThis.fetch;
        globalThis.fetch = async () => Response.json ({ schema : 1, profile : 'production', purpose : 'runtime', revision : owner, settings : { workspace : 'fixture', environment : 'main', app : 'cloud-3d-studio', endpoint : 'https://fixture--cad-gateway.us-east.modal.run', tokenId : 'wk-runtimefixture', tokenSecret : 'ws-runtimefixture' } });
        try { const env = { AUTO3D_MODAL_PROFILE : 'production', SUPABASE_URL : 'https://fixture.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_fixture' }; const key = await ControlKey (env); const { createHmac } = await import ('node:crypto'); assert.equal (key, createHmac ('sha256', 'ws-runtimefixture').update ('auto3d-conversion-control:v1:production:fixture:main').digest ('base64url')); }
        finally { globalThis.fetch = original; }
    });
});
