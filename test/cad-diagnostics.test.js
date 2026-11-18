import assert from 'node:assert/strict';
import { CadDiagnosticReport } from '../source/website/cadconversiondiagnostics.js';
import { PublicJob } from '../functions/_lib/conversionjobs.js';
import { onRequest } from '../functions/api/conversions/[[path]].js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { CadConversions } from '../source/website/cadconversion.js';

const owner = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002', jobId = '00000000-0000-4000-8000-000000000003';
export const failureReport = () => ({ schemaVersion : 1, versions : { worker : '0.4.0', reader : '0.3.17', occt : '7.9.3.1.1' }, outcome : 'error_detected', phase : 'build_geometry', failureCode : 'invalid_geometry', readerCode : 'occt.construction_failed', exception : 'Standard_ConstructionError', frames : ['conversion:292', 'surfaces:100'], checks : { sourceRead : 'passed', geometryBuild : 'failed', geometryValidation : 'not_run', stepExport : 'not_run', stepReimport : 'not_run' } });
const job = () => ({ id : jobId, owner_id : owner, state : 'failed', stage : 'failed', revision : 7, source_bytes : 7, source_sha256 : 'a'.repeat (64), attempts : 2, diagnostic_attempts : 0, error_code : 'invalid_geometry', summary : { diagnostic : { private : 'private log' }, progress : { phase : 'build_geometry', completed : null, total : null, unit : null } }, artifacts : {}, expires_at : new Date (Date.now () + 600000).toISOString (), deadline_at : new Date (Date.now () - 1).toISOString () });

describe ('Private server CAD diagnostics', () => {
    it ('rejects arbitrary content and inconsistent evidence in diagnostic reports', () => {
        const report = failureReport (); assert.deepEqual (CadDiagnosticReport (report), report);
        for (const patch of [{ message : 'private geometry' }, { frames : ['/private/file.x_t:4'] }, { readerCode : 'occt.private_source' }, { exception : 'private-file' }, { checks : { ...report.checks, geometryBuild : 'passed' } }, { versions : { ...report.versions, worker : 'private-token' } }, { outcome : 'cad_validated' }, { failureCode : 'private-error' }]) { assert.throws (() => CadDiagnosticReport ({ ...report, ...patch })); }
    });
    it ('exposes only validated owner report fields and does not reset conversion attempts', () => {
        const source = job (), dto = PublicJob ({ ...source, diagnostic_report : failureReport () });
        assert.equal (dto.canRetry, false); assert.equal (dto.diagnostics.canRun, true); assert.equal (dto.diagnostics.report.readerCode, 'occt.construction_failed');
        assert.ok (!JSON.stringify (dto).includes ('private log'));
        assert.equal (PublicJob ({ ...source, diagnostic_report : { ...failureReport (), text : 'private' } }).diagnostics.report, null);
        assert.equal (PublicJob ({ ...source, diagnostic_attempts : 2 }).diagnostics.canRun, false);
        assert.equal (PublicJob ({ ...source, expires_at : new Date (0).toISOString (), diagnostic_report : failureReport () }).diagnostics.report, null);
        const running = PublicJob ({ ...source, state : 'running', purpose : 'diagnostic', deadline_at : new Date (Date.now () + 60000).toISOString (), diagnostic_progress : { phase : 'read_source', completed : null, total : null, unit : null } });
        assert.equal (running.progress.phase, 'read_source'); assert.equal (running.diagnostics.status, 'running'); assert.equal (running.canRetry, false);
        const timedOut = PublicJob ({ ...source, state : 'queued', purpose : 'diagnostic' });
        assert.equal (timedOut.state, 'failed'); assert.equal (timedOut.diagnostics.errorCode, 'timeout'); assert.equal (timedOut.diagnostics.canRun, false);
        assert.equal (timedOut.expiresAt, source.expires_at, 'diagnostic queue timeout must not expire the source');
    });
    it ('reads a server report without requesting source CAD or artifacts', async () => {
        const paths = [], site = { auth : { user : { id : owner }, generation : 1 }, sessionEditor : {} };
        const cad = new CadConversions (site, async path => { paths.push (path); return Response.json ({ job : { id : jobId, diagnostics : { status : 'completed', canRun : true, report : failureReport () } } }); });
        const result = await cad.Diagnostics (jobId); assert.equal (result.report.phase, 'build_geometry'); assert.deepEqual (paths, ['/api/conversions/' + jobId]);
        site.sessionEditor.readOnly = true; await assert.rejects (cad.Action (jobId, 'diagnose'));
    });
    it ('registers read and run commands with strict separate mutation permissions', async () => {
        let runs = 0; const registry = CreateAgentCommands ({ sessionEditor : {}, cadConversions : { Diagnostics : async () => ({ report : failureReport () }), Action : async () => { runs++; return { queued : true }; } } });
        const catalog = registry.Catalog (); assert.equal (catalog.find (item => item.id === 'conversion.diagnostics').mutates, false); assert.equal (catalog.find (item => item.id === 'conversion.diagnose').mutates, true);
        assert.equal ((await registry.Execute ('conversion.diagnostics', { jobId })).ok, true);
        assert.equal ((await registry.Execute ('conversion.diagnose', { jobId, url : 'https://elsewhere.invalid' })).ok, false); assert.equal (runs, 0);
        assert.equal ((await registry.Execute ('conversion.diagnose', { jobId })).ok, true); assert.equal (runs, 1);
        registry.context.readOnly = true;
        assert.equal ((await registry.Execute ('conversion.diagnose', { jobId })).ok, false); assert.equal (runs, 1);
        assert.equal ((await registry.Execute ('conversion.diagnostics', { jobId })).ok, true);
    });
    it ('requires current ownership, native diagnostic support and immutable source identity', async () => {
        const previous = globalThis.fetch, events = [], row = job (); let ready = false, source = true;
        globalThis.fetch = async (url, init) => {
            if (String (url).includes ('account_controls')) { return Response.json ([]); }
            if (String (url).includes ('auto3d_conversion_jobs?')) { return Response.json (String (url).includes ('owner_id=eq.' + owner) ? [row] : []); }
            if (String (url).includes ('auto3d_modal_connection_read')) { return Response.json ({ schema : 1, profile : 'production', purpose : 'runtime', revision : owner, settings : { workspace : 'fixture', environment : 'main', app : 'cloud-3d-studio', endpoint : 'https://fixture--cad-gateway.modal.run', tokenId : 'wk-runtimefixture', tokenSecret : 'ws-runtimefixture' } }); }
            if (String (url).endsWith ('/connection')) { return Response.json ({ service : 'cloud-3d-studio', protocol : 1, version : '0.4.0', workspace : 'fixture', environment : 'main', app : 'cloud-3d-studio', conversionReady : true, jobApiVersion : 1, diagnosticApiVersion : ready ? 1 : undefined }); }
            if (String (url).includes ('auto3d_conversion_transition')) { const body = JSON.parse (init.body); events.push (body); return Response.json ({ job : { ...row, state : 'queued', purpose : 'diagnostic', dispatched_at : new Date ().toISOString () } }); }
            throw new Error ('Unexpected server request');
        };
        const env = { SUPABASE_URL : 'https://fixture.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_fixture', AUTO3D_MODAL_PROFILE : 'production', AUTO3D_LIBRARY_R2 : { head : async () => source ? { size : 7, customMetadata : { sha256 : row.source_sha256 } } : null } };
        const invoke = (account = owner, revision = row.revision) => onRequest ({ env, data : { user : { id : account } }, request : new Request ('https://auto3d-5av.pages.dev/api/conversions/' + jobId + '/diagnose', { method : 'POST', headers : { 'X-Auto3D-Account' : account, Origin : 'https://auto3d-5av.pages.dev', 'Content-Type' : 'application/json' }, body : JSON.stringify ({ revision }) }) });
        try {
            assert.equal ((await invoke (other)).status, 404); assert.equal ((await invoke (owner, 6)).status, 409);
            assert.equal ((await invoke ()).status, 503); assert.equal (events.length, 0);
            ready = true; source = false; assert.equal ((await invoke ()).status, 400); assert.equal (events.length, 0);
            source = true; assert.equal ((await invoke ()).status, 200); assert.equal (events.length, 1); assert.equal (events[0].p_event, 'diagnose'); assert.equal (events[0].p_revision, 7);
        } finally { globalThis.fetch = previous; }
    });
});
