import { WorkspaceDialog } from './modellibrary.js';
import { AgentError } from '../../mcp/common.js';
import { CadLimits, CadArtifacts, CadMessages, CadUuid, CadRequest } from './cadconversioncontract.js';
import { ParseConvertedGlb, AddConvertedModel } from './cadconversionimport.js';

function ClientError (code)
{
    const agentCode = ['wrong_target', 'unauthenticated'].includes (code) ? 'session_changed' : code === 'conflict' ? 'conflict' : code === 'forbidden' ? 'permission_required' : ['invalid_request', 'source_units_required', 'unknown_units', 'too_large'].includes (code) ? 'invalid_arguments' : 'unavailable';
    return Object.assign (AgentError (agentCode, CadMessages[code] || CadMessages.unavailable), { cadCode : code });
}
function Element (tag, text, parent) { const node = document.createElement (tag); if (text) { node.textContent = text; } parent?.appendChild (node); return node; }
const liveStates = new Set (['awaiting_upload', 'queued', 'running', 'cancelling']);
const stageText = { awaiting_upload : 'Waiting for private upload', queued : 'Queued', downloading : 'Reading private source', converting : 'Converting and validating CAD', uploading : 'Publishing validated files', cancelling : 'Cancelling', cancelled : 'Cancelled', ready : 'Ready', failed : 'Failed', expired : 'Expired' };

export class CadConversions
{
    constructor (website, fetchImpl = (...args) => fetch (...args))
    {
        this.website = website; this.fetch = fetchImpl; this.windowId = crypto.randomUUID (); this.file = null; this.pending = null; this.submitting = false;
        this.unsubscribe = website.auth?.Subscribe?.(user => { if (!user || this.owner && user.id !== this.owner) { this.ClearFile (); this.jobs = []; this.dialog?.close (); } });
    }
    Account (owner = this.website.auth?.user?.id, generation = this.website.auth?.generation)
    {
        if (!owner || this.website.auth?.user?.id !== owner || this.website.auth?.generation !== generation || this.website.auth.loggedOut || this.website.accountReady === false) { throw ClientError ('wrong_target'); }
        return { owner, generation };
    }
    Origin ()
    {
        this.Account (); return { windowId : this.windowId, tabId : this.website.sessionEditor.sessions.active, revision : this.website.sessionEditor.recoveryRevision };
    }
    Inspect () { this.Account (); return { windowId : this.windowId, target : this.Origin (), stagedFile : this.file ? { name : this.file.name, bytes : this.file.size } : null, submitting : this.submitting, opened : !!this.dialog?.open }; }
    ClearFile () { this.file = null; this.pending = null; if (this.picker) { this.picker.value = ''; } }
    Stage (file)
    {
        this.owner = this.Account ().owner; if (this.submitting) { throw ClientError ('conflict'); }
        if (!file || typeof file.arrayBuffer !== 'function' || !/\.(x_t|x_b|step|stp)$/i.test (file.name || '') || file.size <= 0) { throw ClientError ('invalid_request'); }
        if (file.size > CadLimits.inputBytes) { throw ClientError ('too_large'); }
        this.file = file; this.pending = null; return this.Inspect ();
    }
    async Request (path = '', method = 'GET', body, binary = false)
    {
        const { owner, generation } = this.Account (); let response;
        try { response = await this.fetch ('/api/conversions' + path, { method, credentials : 'same-origin', cache : 'no-store', redirect : 'error', signal : AbortSignal.timeout (90000), headers : { 'X-Auto3D-Account' : owner, ...(body !== undefined ? { 'Content-Type' : binary ? 'application/octet-stream' : 'application/json' } : {}) }, body : body === undefined ? undefined : binary ? body : JSON.stringify (body) }); }
        catch { throw ClientError ('unavailable'); }
        this.Account (owner, generation);
        if (!response.ok) { let data; try { data = await response.json (); } catch { /* Static error below. */ } throw ClientError (Object.hasOwn (CadMessages, data?.code || '') ? data.code : 'unavailable'); }
        if (binary && method === 'GET') {
            if (Number (response.headers.get ('Content-Length')) > CadLimits.artifactBytes) { throw ClientError ('too_large'); }
            const buffer = await response.arrayBuffer (); this.Account (owner, generation);
            if (!buffer.byteLength || buffer.byteLength > CadLimits.artifactBytes) { throw ClientError ('too_large'); } return buffer;
        }
        const result = await response.json (); this.Account (owner, generation); return result;
    }
    JobPath (id) { if (!CadUuid (id)) { throw ClientError ('invalid_request'); } return '/' + id; }
    Capabilities () { return this.Request ('/capabilities'); }
    async List () { const result = await this.Request (); this.jobs = result.jobs; return result; }
    async Get (id) { return (await this.Request (this.JobPath (id))).job; }
    async Submit ({ sourceUnit = null, quality = 'standard' } = {})
    {
        const { owner, generation } = this.Account ();
        if (this.submitting || !this.file || this.website.sessionEditor.readOnly) { throw ClientError ('invalid_request'); }
        this.submitting = true; const file = this.file, origin = this.Origin ();
        try {
            const extension = file.name.split ('.').pop ().toLowerCase ();
            if (this.pending && (this.pending.sourceUnit !== sourceUnit || this.pending.quality !== quality)) { throw ClientError ('conflict'); }
            if (!this.pending) {
                const digest = new Uint8Array (await crypto.subtle.digest ('SHA-256', await file.arrayBuffer ()));
                this.Account (owner, generation);
                this.pending = CadRequest ({ requestKey : crypto.randomUUID (), sourceName : file.name, extension, sourceBytes : file.size, sourceSha256 : Array.from (digest, byte => byte.toString (16).padStart (2, '0')).join (''), sourceUnit, quality, origin });
            }
            let job = (await this.Request ('', 'POST', this.pending)).job;
            if (job.state === 'awaiting_upload') { await this.Request (this.JobPath (job.id) + '/source', 'PUT', file, true); }
            job = await this.Get (job.id);
            if (['awaiting_upload', 'queued'].includes (job.state)) { job = (await this.Request (this.JobPath (job.id) + '/submit', 'POST', { revision : job.revision })).job; }
            return { job };
        } catch (error) { if (error instanceof Error && error.cadCode) { throw error; } throw ClientError (error.code || 'unavailable'); }
        finally { this.submitting = false; if (this.file !== file) { this.pending = null; } this.updateFile?.(); }
    }
    async Action (id, action)
    {
        if (!['cancel', 'retry', 'delete'].includes (action) || this.website.sessionEditor.readOnly) { throw ClientError ('invalid_request'); }
        const path = this.JobPath (id);
        if (action === 'delete') { return this.Request (path, 'DELETE'); }
        const job = await this.Get (id); return this.Request (path + '/' + action, 'POST', { revision : job.revision });
    }
    async Artifact (id, kind)
    {
        if (!Object.hasOwn (CadArtifacts, kind)) { throw ClientError ('invalid_request'); }
        return this.Request (this.JobPath (id) + '/artifacts/' + kind, 'GET', undefined, true);
    }
    async Download (id, kind)
    {
        const buffer = await this.Artifact (id, kind), url = URL.createObjectURL (new Blob ([buffer], { type : CadArtifacts[kind].type }));
        const link = document.createElement ('a'); link.href = url; link.download = CadArtifacts[kind].file; link.click (); setTimeout (() => URL.revokeObjectURL (url), 10000);
        return { downloaded : true, bytes : buffer.byteLength, format : kind, units : CadArtifacts[kind].units || null };
    }
    async Import (id, target)
    {
        const editor = this.website.sessionEditor, origin = this.Origin (), account = this.Account (), document = editor.document;
        if (!target || ['windowId', 'tabId', 'revision'].some (key => target[key] !== origin[key])) { throw ClientError ('wrong_target'); }
        const assert = () => { this.Account (account.owner, account.generation); if (editor.document !== document || editor.sessions.active !== origin.tabId || editor.recoveryRevision !== origin.revision || editor.readOnly || this.website.rendering?.running || editor.packaging?.foldOperation || editor.arrayOperation) { throw ClientError ('wrong_target'); } };
        if (editor.busy || editor.sessions.switching) { throw ClientError ('conflict'); } assert ();
        editor.busy = true; editor.RefreshButtons?.();
        try {
            const job = await this.Get (id); assert (); if (job.state !== 'ready') { throw ClientError ('conflict'); }
            const buffer = await this.Artifact (id, 'glb'); assert ();
            const result = await ParseConvertedGlb (buffer); assert ();
            const current = await this.Get (id); assert (); if (current.state !== 'ready') { throw ClientError ('conflict'); }
            return await AddConvertedModel (editor, result, job, assert);
        } finally { editor.busy = false; editor.RefreshButtons?.(); }
    }
    async Sample ()
    {
        const account = this.Account (); const response = await this.fetch ('/assets/samples/cad-box-40x30x20.step', { credentials : 'same-origin', redirect : 'error' }); this.Account (account.owner, account.generation);
        if (!response.ok) { throw ClientError ('unavailable'); } const buffer = await response.arrayBuffer (); this.Account (account.owner, account.generation);
        this.Stage (new File ([buffer], 'sample-40x30x20.step', { type : 'application/step' })); return this.Submit ();
    }
    async Open (file, notice = '')
    {
        this.Account (); if (this.website.sessionEditor.readOnly) { throw ClientError ('forbidden'); }
        if (this.dialog?.open) { if (file) { this.Stage (file); } if (this.notice) { this.notice.textContent = notice; this.notice.hidden = !notice; } this.updateFile?.(); return { opened : true, interactive : true }; }
        if (file) { this.Stage (file); }
        this.owner = this.website.auth.user.id;
        const dialog = WorkspaceDialog ('Convert CAD'); this.dialog = dialog; dialog.classList.add ('cad_conversion_dialog');
        const form = Element ('form', null, dialog); form.className = 'workspace_save_form';
        this.notice = Element ('p', notice, form); this.notice.hidden = !notice; this.notice.setAttribute ('role', 'status');
        Element ('p', 'Private cloud conversion · Parasolid (.x_t / .x_b) or STEP → STEP, GLB and STL.', form);
        Element ('p', 'Files are processed in your existing Cloud 3D Studio service. Downloads expire after 24 hours and temporary files are cleaned up automatically. Parasolid support covers a subset of entities. Choose Convert to upload; selecting a file alone keeps it on this device.', form).className = 'cad_conversion_note';
        const label = Element ('label', 'Source CAD file · up to 50 MiB', form), picker = Element ('input', null, label); picker.type = 'file'; picker.accept = '.x_t,.x_b,.step,.stp'; this.picker = picker;
        const filename = Element ('p', '', form);
        const options = Element ('div', null, form); options.className = 'cad_conversion_options';
        const unitLabel = Element ('label', 'Parasolid coordinate units', options), units = Element ('select', null, unitLabel); units.setAttribute ('aria-label', 'Parasolid coordinate units');
        for (const [value, text] of [['', 'Select actual units'], ['mm', 'Millimeters'], ['cm', 'Centimeters'], ['m', 'Meters'], ['in', 'Inches'], ['ft', 'Feet']]) { units.add (new Option (text, value)); }
        const qualityLabel = Element ('label', 'Mesh quality', options), quality = Element ('select', null, qualityLabel); quality.add (new Option ('Standard · 0.10 mm', 'standard')); quality.add (new Option ('Fine · 0.05 mm', 'fine'));
        const actions = Element ('div', null, form); actions.className = 'mode_buttons';
        const submit = Element ('button', 'Convert privately', actions); submit.type = 'submit';
        const sample = Element ('button', 'Convert sample · 40 × 30 × 20 mm', actions); sample.type = 'button';
        const status = Element ('p', 'Checking CAD service…', form); status.setAttribute ('role', 'status');
        const jobs = Element ('div', null, dialog); jobs.className = 'cad_conversion_jobs'; jobs.setAttribute ('aria-label', 'My CAD conversions');
        let closed = false, busy = false, ready = false, timer = null, pollDelay = 1500;
        const update = () => { const parasolid = /\.(x_t|x_b)$/i.test (this.file?.name || ''); filename.textContent = this.file ? this.file.name + ' · ' + (this.file.size / 1048576).toFixed (2) + ' MiB' : 'Choose a file or convert the public sample.'; units.disabled = busy || !parasolid; quality.disabled = busy; picker.disabled = busy; submit.disabled = busy || !ready || !this.file || parasolid && !units.value; sample.disabled = busy || !ready; };
        this.updateFile = update;
        const run = async action => { if (closed || busy) { return; } busy = true; update (); try { await action (); if (!closed) { await refresh (); } } catch (error) { if (!closed) { status.textContent = error.message || CadMessages.unavailable; } } finally { busy = false; if (!closed) { update (); } } };
        const button = (text, parent, action) => { const node = Element ('button', text, parent); node.type = 'button'; node.onclick = () => run (action); return node; };
        const refresh = async () => {
            const result = await this.List (); if (closed) { return; } jobs.replaceChildren ();
            if (!result.jobs.length) { Element ('p', 'Your conversions will appear here.', jobs); }
            for (const job of result.jobs) {
                const row = Element ('article', null, jobs); row.className = 'cad_conversion_job'; row.dataset.jobId = job.id;
                Element ('strong', job.source.name, row); Element ('span', stageText[job.stage] || stageText[job.state] || 'Processing', row).className = 'cad_conversion_stage';
                if (job.errorCode) { Element ('p', CadMessages[job.errorCode] || CadMessages.conversion_failed, row); }
                if (job.summary) { Element ('p', 'X × Y × Z: ' + job.summary.dimensionsMm.map (n => Number (n.toFixed (3))).join (' × ') + ' mm · ' + job.summary.topology.solids + ' solids · independently validated', row); }
                const controls = Element ('div', null, row); controls.className = 'mode_buttons';
                if (liveStates.has (job.state)) { button ('Cancel', controls, () => this.Action (job.id, 'cancel')); }
                if (job.canRetry) { button ('Retry', controls, () => this.Action (job.id, 'retry')); }
                if (job.state === 'ready') {
                    button ('Add to current session', controls, async () => { const target = this.Origin (); await this.Import (job.id, target); status.textContent = 'Added to the current session. Undo is available.'; });
                    for (const kind of Object.keys (job.artifacts)) { button (kind.toUpperCase () + (CadArtifacts[kind].units ? ' · ' + CadArtifacts[kind].units : ''), controls, () => this.Download (job.id, kind)); }
                }
                button ('Delete files', controls, () => this.Action (job.id, 'delete'));
            }
            clearTimeout (timer); if (result.jobs.some (job => liveStates.has (job.state))) { timer = setTimeout (async () => { try { if (!closed && !busy) { await refresh (); } } catch { if (!closed) { status.textContent = CadMessages.unavailable; timer = setTimeout (() => run (refresh), 6000); } } }, pollDelay); pollDelay = Math.min (6000, pollDelay * 1.3); }
        };
        picker.onchange = () => { try { if (picker.files[0]) { this.Stage (picker.files[0]); } status.textContent = ready ? 'Ready to convert privately.' : 'CAD service is not ready.'; } catch (error) { status.textContent = error.message; } update (); };
        units.onchange = update;
        form.onsubmit = event => { event.preventDefault (); run (async () => { status.textContent = 'Hashing and uploading your source privately…'; const result = await this.Submit ({ sourceUnit : /\.(x_t|x_b)$/i.test (this.file.name) ? units.value : null, quality : quality.value }); status.textContent = 'Conversion submitted. You can close this window while it runs.'; this.ClearFile (); return result; }); };
        sample.onclick = () => run (async () => { status.textContent = 'Converting the public sample…'; await this.Sample (); this.ClearFile (); status.textContent = 'Sample submitted. Expected size: 40 × 30 × 20 mm.'; });
        dialog.addEventListener ('close', () => { closed = true; clearTimeout (timer); this.ClearFile (); this.dialog = null; this.picker = null; this.updateFile = null; this.notice = null; }, { once : true });
        update ();
        try { const caps = await this.Capabilities (); if (!closed) { ready = caps.ready; status.textContent = ready ? 'CAD service ready · STEP/STL in mm · GLB in meters.' : 'The CAD service is not ready yet.'; await refresh (); } }
        catch (error) { if (!closed) { status.textContent = error.message; } }
        if (!closed) { update (); } return { opened : !closed, interactive : true };
    }
}
export function CadConversionsFor (website) { website.cadConversions ||= new CadConversions (website); return website.cadConversions; }
