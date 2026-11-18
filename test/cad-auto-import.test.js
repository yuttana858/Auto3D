import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CadConversions } from '../source/website/cadconversion.js';
import { CadFileType } from '../source/website/cadfiletype.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

const glb = Buffer.from (readFileSync ('test/testfiles/cad-conversion-box.glb.b64', 'utf8').trim (), 'base64');
const uuid = () => crypto.randomUUID ();
const deferred = () => { let resolve; const promise = new Promise (done => { resolve = done; }); return { promise, resolve }; };
function setup ()
{
    let subscriber, time = Date.now (), sequence = 0;
    const scheduled = new Map (), calls = [], jobs = new Map ();
    const site = { auth : { user : { id : uuid () }, generation : 1, Subscribe : callback => { subscriber = callback; } }, accountReady : true };
    const editor = { document : new SceneDocument (), sessions : { active : uuid () }, recoveryRevision : 0, selected : null, selectedIds : new Set (), readOnly : false, busy : false, Status () {}, Render : async (fit, check) => check?.() };
    editor.history = new SceneHistory (() => editor.recoveryRevision++); site.sessionEditor = editor;
    const test = { site, editor, calls, jobs, scheduled, last : null, artifactGate : null, nextGetGate : null, failGet : false };
    const fetch = async (path, options) => {
        calls.push ([path, options.method]);
        if (path === '/api/conversions' && options.method === 'POST') {
            const request = JSON.parse (options.body);
            const job = { id : uuid (), state : 'awaiting_upload', revision : 1, source : { name : request.sourceName, sha256 : request.sourceSha256, unit : request.sourceUnit, extension : request.extension }, summary : { producerVersion : '0.5.0', dimensionsMm : [40, 30, 20] } };
            jobs.set (job.id, job); test.last = job; return Response.json ({ job });
        }
        const parts = path.split ('/'), job = jobs.get (parts[3]); assert.ok (job, path);
        if (parts[4] === 'source') { assert.equal (options.method, 'PUT'); assert.ok (options.body instanceof File); return Response.json ({ uploaded : true }); }
        if (parts[4] === 'submit' || parts[4] === 'retry') { job.state = 'queued'; return Response.json ({ job }); }
        if (parts[4] === 'cancel' || options.method === 'DELETE') { job.state = 'cancelled'; return Response.json ({ job }); }
        if (parts[4] === 'artifacts') {
            assert.equal (parts[5], 'glb', 'automatic import must retain appearance through GLB');
            if (test.artifactGate) { const gate = test.artifactGate; test.artifactGate = null; gate.started.resolve (); await gate.release.promise; }
            return new Response (glb, { headers : { 'Content-Length' : String (glb.length) } });
        }
        if (test.failGet) { test.failGet = false; throw new Error ('temporary network failure'); }
        if (test.nextGetGate) { const gate = test.nextGetGate; test.nextGetGate = null; gate.started.resolve (); await gate.release.promise; }
        return Response.json ({ job });
    };
    const timers = { set : (callback, delay) => { const token = ++sequence; scheduled.set (token, { callback, delay }); return token; }, clear : token => scheduled.delete (token), now : () => time };
    const cad = new CadConversions (site, fetch, timers); site.cadConversions = cad;
    Object.assign (test, { cad, tick : async () => { const [token, next] = [...scheduled][0] || []; assert.ok (next, 'a polling timer must be scheduled'); scheduled.delete (token); await next.callback (); }, elapse : ms => { time += ms; }, logout : () => { site.auth.user = null; site.auth.generation++; subscriber (null); }, stage : (name = 'public.step') => cad.Stage (new File (['public fixture source'], name)), artifacts : () => calls.filter (([path]) => path.includes ('/artifacts/')).length });
    return test;
}

describe ('Automatic private CAD import', () => {
    it ('detects canonical formats and Parasolid aliases without guessing coordinate units', async () => {
        for (const [name, extension, units] of [['part.STEP', 'step', false], ['part.StP', 'stp', false], ['part.X_T', 'x_t', true], ['part.xmt_txt', 'x_t', true], ['part.XMT_BIN', 'x_b', true]]) {
            const type = CadFileType (name); assert.equal (type.extension, extension); assert.equal (type.requiresUnits, units);
        }
        for (const name of ['part.glb', 'part.step.exe', 'part', '', null]) { assert.equal (CadFileType (name), null); }
        const t = setup (); t.stage ('part.xmt_txt');
        await assert.rejects (t.cad.Start (), /actual Parasolid/); assert.equal (t.calls.length, 0);
        await t.cad.Start ({ sourceUnit : 'in' });
        assert.equal (t.last.source.extension, 'x_t'); assert.equal (t.last.source.unit, 'in'); t.cad.StopAutomatic ();
    });
    it ('uploads once and imports the real colored GLB without a download or manual Add, with Undo/Redo', async () => {
        const t = setup (); t.stage ();
        const started = await t.cad.Start (); t.cad.ClearFile ();
        assert.equal (started.automatic.state, 'converting'); assert.equal (t.editor.document.objects.length, 0);
        t.last.state = 'ready'; await t.tick ();
        assert.equal (t.cad.Inspect ().automatic.state, 'added'); assert.equal (t.editor.document.objects.length, 1);
        assert.equal (t.calls.filter (([path, method]) => path === '/api/conversions' && method === 'POST').length, 1);
        assert.equal (t.artifacts (), 1); assert.equal (t.scheduled.size, 0);
        assert.ok (t.editor.document.model.materials.some (material => Math.abs (material.opacity - .5) < 1e-7));
        assert.deepEqual (t.editor.document.objects[0].scale, [1, 1, 1]); assert.equal (t.editor.history.undo.length, 1);
        await t.editor.history.Undo (); assert.equal (t.editor.document.objects.length, 0);
        await t.editor.history.Redo (); assert.equal (t.editor.document.objects.length, 1);
    });
    it ('supports the explicit manual workflow without scheduling automatic insertion', async () => {
        const t = setup (); t.stage (); await t.cad.Start ({ autoImport : false });
        t.last.state = 'ready'; assert.equal (t.scheduled.size, 0); assert.equal (t.editor.document.objects.length, 0);
        await t.cad.Import (t.last.id, t.cad.Origin ()); assert.equal (t.editor.document.objects.length, 1);
    });
    it ('accepts edits in the same document while conversion runs, then captures a fresh revision for import', async () => {
        const t = setup (); t.stage (); await t.cad.Start (); t.editor.recoveryRevision += 5;
        t.last.state = 'ready'; await t.tick (); assert.equal (t.cad.AutomaticStatus ().state, 'added');
    });
    for (const change of ['document', 'tab', 'readOnly']) {
        it ('pauses automatic insertion after a target ' + change + ' change', async () => {
            const t = setup (); t.stage (); await t.cad.Start ();
            if (change === 'document') { t.editor.document = new SceneDocument (); }
            if (change === 'tab') { t.editor.sessions.active = uuid (); }
            if (change === 'readOnly') { t.editor.readOnly = true; }
            t.last.state = 'ready'; await t.tick ();
            assert.equal (t.cad.AutomaticStatus ().state, 'paused'); assert.equal (t.artifacts (), 0); assert.equal (t.editor.document.objects.length, 0); assert.equal (t.scheduled.size, 0);
        });
    }
    it ('clears prior-account automatic state and timers on logout', async () => {
        const t = setup (); t.stage (); await t.cad.Start (); t.logout ();
        assert.equal (t.cad.automatic, null); assert.equal (t.scheduled.size, 0); assert.equal (t.artifacts (), 0);
    });
    it ('waits for an active scene operation before importing', async () => {
        const t = setup (); t.stage (); await t.cad.Start (); t.last.state = 'ready'; t.editor.busy = true;
        await t.tick (); assert.equal (t.cad.AutomaticStatus ().state, 'waiting'); assert.equal (t.artifacts (), 0);
        t.editor.busy = false; await t.tick (); assert.equal (t.editor.document.objects.length, 1);
    });
    it ('coalesces concurrent ready observations into one GLB import', async () => {
        const t = setup (), gate = { started : deferred (), release : deferred () }; t.stage (); await t.cad.Start (); t.last.state = 'ready'; t.artifactGate = gate;
        const first = t.tick (); await gate.started.promise;
        await t.cad.WatchAutomatic (t.cad.automatic);
        gate.release.resolve (); await first;
        assert.equal (t.artifacts (), 1); assert.equal (t.editor.document.objects.length, 1); assert.equal (t.editor.history.undo.length, 1);
    });
    it ('cancels a late artifact download without inserting the model', async () => {
        const t = setup (), gate = { started : deferred (), release : deferred () }; t.stage (); await t.cad.Start (); t.last.state = 'ready'; t.artifactGate = gate;
        const work = t.tick (); await gate.started.promise; await t.cad.Action (t.last.id, 'cancel'); gate.release.resolve (); await work;
        assert.equal (t.cad.AutomaticStatus ().state, 'cancelled'); assert.equal (t.editor.document.objects.length, 0); assert.equal (t.editor.history.undo.length, 0); assert.equal (t.editor.busy, false);
    });
    it ('rolls back a pending scene render when the source job is deleted', async () => {
        const t = setup (), gate = { started : deferred (), release : deferred () }; t.stage (); await t.cad.Start (); t.last.state = 'ready';
        t.editor.Render = async (fit, check) => { gate.started.resolve (); await gate.release.promise; check?.(); };
        const work = t.tick (); await gate.started.promise; assert.equal (t.editor.document.objects.length, 1);
        await t.cad.Action (t.last.id, 'delete'); gate.release.resolve (); await work;
        assert.equal (t.editor.document.objects.length, 0); assert.equal (t.editor.document.model.materials.length, 0); assert.equal (t.editor.history.undo.length, 0);
    });
    it ('does not unlock a new document operation when an old import finishes', async () => {
        const t = setup (), gate = { started : deferred (), release : deferred () }; t.stage (); await t.cad.Start (); t.last.state = 'ready'; t.artifactGate = gate;
        const work = t.tick (); await gate.started.promise; t.editor.document = new SceneDocument (); t.editor.busy = true;
        gate.release.resolve (); await work; assert.equal (t.editor.busy, true); assert.equal (t.editor.document.objects.length, 0); assert.equal (t.cad.AutomaticStatus ().state, 'paused');
    });
    it ('preserves a newer import when an older cancelled request returns', async () => {
        const t = setup (), gate = { started : deferred (), release : deferred () }; t.stage (); await t.cad.Start (); const old = t.last;
        t.nextGetGate = gate; const previous = t.tick (); await gate.started.promise; await t.cad.Action (old.id, 'cancel');
        t.stage ('second.step'); await t.cad.Start (); const next = t.last; gate.release.resolve (); await previous;
        assert.equal (t.scheduled.size, 1); assert.equal (t.cad.AutomaticStatus ().jobId, next.id);
        next.state = 'ready'; await t.tick (); assert.equal (t.editor.document.objects.length, 1); assert.equal (t.editor.document.objects[0].name, 'second');
    });
    it ('reconnects after a temporary status failure without uploading again', async () => {
        const t = setup (); t.stage (); await t.cad.Start (); t.failGet = true;
        await t.tick (); assert.equal (t.cad.AutomaticStatus ().state, 'retrying'); assert.equal ([...t.scheduled.values ()][0].delay, 3000);
        t.last.state = 'ready'; await t.tick (); assert.equal (t.editor.document.objects.length, 1);
        assert.equal (t.calls.filter (([path, method]) => path === '/api/conversions' && method === 'POST').length, 1);
    });
    it ('keeps failed, expired and diagnostic-only results out of the scene', async () => {
        for (const state of ['failed', 'expired', 'cancelled']) {
            const t = setup (); t.stage (); await t.cad.Start (); Object.assign (t.last, { state, purpose : 'diagnostic', errorCode : 'invalid_geometry' });
            await t.tick (); assert.equal (t.artifacts (), 0); assert.equal (t.editor.document.objects.length, 0); assert.equal (t.scheduled.size, 0);
        }
    });
    it ('bounds the automatic watcher lifetime and refuses a second simultaneous file', async () => {
        const t = setup (); t.stage (); await t.cad.Start (); assert.throws (() => t.stage ('second.step'), /already running/);
        t.elapse (31 * 60 * 1000); await t.tick (); assert.equal (t.cad.AutomaticStatus ().state, 'paused'); assert.equal (t.scheduled.size, 0);
    });
    it ('automatically follows an explicit retry without changing server attempt policy', async () => {
        const t = setup (); t.stage (); await t.cad.Start (); t.last.state = 'failed'; await t.tick ();
        await t.cad.Action (t.last.id, 'retry'); t.last.state = 'ready'; await t.tick (); assert.equal (t.editor.document.objects.length, 1);
    });
    it ('shares automatic submission with strict commands and read-only permissions', async () => {
        const t = setup (); t.stage (); const registry = CreateAgentCommands (t.site);
        assert.equal ((await registry.Execute ('conversion.submit', { autoImport : 'yes' })).ok, false); assert.equal (t.calls.length, 0);
        registry.context.readOnly = true; assert.equal ((await registry.Execute ('conversion.submit', {})).ok, false); assert.equal (t.calls.length, 0);
        registry.context.readOnly = false; const result = await registry.Execute ('conversion.submit', {}); assert.equal (result.ok, true); assert.equal (result.result.automatic.active, true);
        t.last.state = 'ready'; await t.tick (); assert.equal ((await registry.Execute ('conversion.inspect', {})).result.automatic.state, 'added');
    });
    it ('returns a trackable queued result from macros and completes automatic insertion afterward', async () => {
        const t = setup (); t.stage (); const registry = CreateAgentCommands (t.site);
        const result = await registry.RunMacro ({ version : 1, steps : [{ id : 'convert', command : 'conversion.submit', arguments : {} }, { id : 'track', command : 'conversion.inspect', arguments : {} }] });
        assert.equal (result.ok, true); assert.equal (result.completed[0].result.job.id, t.last.id);
        assert.equal (result.completed[1].result.automatic.state, 'converting'); assert.equal (t.editor.document.objects.length, 0);
        t.last.state = 'ready'; await t.tick (); assert.equal (t.editor.document.objects.length, 1);
    });
});
