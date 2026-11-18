import { WorkspaceDialog } from './modellibrary.js';
import { AgentError } from '../../mcp/common.js';
import { CadLimits, CadArtifacts, CadMessages, CadUuid, CadRequest, CadProgressView, CadPhases } from './cadconversioncontract.js';
import { ParseConvertedGlb, AddConvertedModel } from './cadconversionimport.js';
import { CadDiagnosticReport, CadDiagnosticAdvice, CadDiagnosticChecks } from './cadconversiondiagnostics.js';
import { CadAppearanceReport, CadAppearanceLines } from './cadconversionappearance.js';
import { CadFileType, CadFileAccept } from './cadfiletype.js';

function ClientError (code)
{
    const agentCode = ['wrong_target', 'unauthenticated'].includes (code) ? 'session_changed' : ['conflict', 'import_busy'].includes (code) ? 'conflict' : code === 'forbidden' ? 'permission_required' : ['invalid_request', 'source_units_required', 'unknown_units', 'too_large'].includes (code) ? 'invalid_arguments' : 'unavailable';
    return Object.assign (AgentError (agentCode, CadMessages[code] || CadMessages.unavailable), { cadCode : code });
}
function Element (tag, text, parent) { const node = document.createElement (tag); if (text) { node.textContent = text; } parent?.appendChild (node); return node; }
const liveStates = new Set (['awaiting_upload', 'queued', 'running', 'cancelling']);
const automaticStates = new Set (['submitting', 'converting', 'retrying', 'waiting', 'importing']);
function ProgressElement (parent)
{
    const root = Element ('div', null, parent); root.className = 'cad_conversion_progress';
    const heading = Element ('div', null, root); heading.className = 'cad_conversion_progress_heading';
    const label = Element ('span', '', heading), percentage = Element ('strong', '', heading);
    const bar = Element ('div', null, root); bar.className = 'cad_conversion_progress_track'; bar.setAttribute ('role', 'progressbar'); bar.setAttribute ('aria-valuemin', '0'); bar.setAttribute ('aria-valuemax', '100');
    const fill = Element ('div', null, bar); fill.className = 'cad_conversion_progress_fill';
    const detail = Element ('span', '', root); detail.className = 'cad_conversion_progress_detail';
    return { root, update : view => {
        label.textContent = view.label; percentage.textContent = view.percent === null ? '' : view.percent + '%'; detail.textContent = view.detail || '';
        bar.setAttribute ('aria-label', view.label); root.classList.toggle ('indeterminate', view.active && view.percent === null); root.classList.toggle ('is_active', view.active);
        if (view.percent === null) { bar.removeAttribute ('aria-valuenow'); } else { bar.setAttribute ('aria-valuenow', String (view.percent)); }
        fill.style.width = view.percent === null ? view.active ? '35%' : '0%' : view.percent + '%';
    } };
}

export class CadConversions
{
    constructor (website, fetchImpl = (...args) => fetch (...args), timers = {})
    {
        this.website = website; this.fetch = fetchImpl; this.windowId = crypto.randomUUID (); this.file = null; this.pending = null; this.submitting = false;
        this.submissionProgress = null;
        this.automatic = null; this.autoTimer = null; this.selectionRequested = false;
        this.timers = { set : (callback, delay) => setTimeout (callback, delay), clear : handle => clearTimeout (handle), now : Date.now, ...timers };
        this.unsubscribe = website.auth?.Subscribe?.(user => { if (!user || this.owner && user.id !== this.owner) { this.StopAutomatic (); this.automatic = null; this.uploadRequest?.abort (); this.Progress (null); this.ClearFile (); this.jobs = []; this.dialog?.close (); } });
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
    Inspect () { this.Account (); return { windowId : this.windowId, target : this.Origin (), stagedFile : this.file ? { name : this.file.name, bytes : this.file.size, type : CadFileType (this.file.name) } : null, submitting : this.submitting, automatic : this.AutomaticStatus (), submissionProgress : this.submissionProgress ? { ...this.submissionProgress } : null, opened : !!this.dialog?.open }; }
    AutomaticStatus ()
    {
        const value = this.automatic;
        return value ? { active : automaticStates.has (value.state), state : value.state, jobId : value.jobId, type : value.type, errorCode : value.errorCode || null, result : value.result || null } : null;
    }
    AutomaticActive () { return automaticStates.has (this.automatic?.state); }
    AutomaticChanged (flow, state, errorCode = null)
    {
        if (this.automatic !== flow) { return; }
        if (flow.state === state && flow.errorCode === errorCode) { return; }
        flow.state = state; flow.errorCode = errorCode;
        if (!automaticStates.has (state)) { this.timers.clear (this.autoTimer); this.autoTimer = null; }
        this.updateAutomatic?.();
    }
    StopAutomatic ()
    {
        if (this.automatic && this.AutomaticActive ()) { this.AutomaticChanged (this.automatic, 'cancelled'); }
    }
    NewAutomatic (type)
    {
        if (this.AutomaticActive ()) { throw ClientError ('import_busy'); }
        const account = this.Account (), editor = this.website.sessionEditor;
        this.owner = account.owner;
        if (editor.readOnly) { throw ClientError ('forbidden'); }
        const flow = { ...account, document : editor.document, tabId : editor.sessions.active, type, name : this.file?.name, jobId : null, state : 'submitting', deadline : this.timers.now () + 30 * 60 * 1000 };
        this.automatic = flow; this.AutomaticChanged (flow, 'submitting'); return flow;
    }
    AssertAutomatic (flow)
    {
        this.Account (flow.owner, flow.generation);
        const editor = this.website.sessionEditor;
        if (this.automatic !== flow || !this.AutomaticActive () || editor.document !== flow.document || editor.sessions.active !== flow.tabId || editor.readOnly) { throw ClientError ('wrong_target'); }
    }
    ScheduleAutomatic (flow, delay = 1500)
    {
        if (this.automatic !== flow || !this.AutomaticActive ()) { return; }
        this.timers.clear (this.autoTimer);
        this.autoTimer = this.timers.set (() => this.WatchAutomatic (flow), delay);
        this.autoTimer?.unref?.();
    }
    async WatchAutomatic (flow)
    {
        if (this.automatic !== flow || !this.AutomaticActive ()) { return; }
        try {
            this.AssertAutomatic (flow);
            if (this.timers.now () > flow.deadline) { this.AutomaticChanged (flow, 'paused', 'timeout'); return; }
            const job = await this.Get (flow.jobId); this.AssertAutomatic (flow);
            flow.failures = 0; await this.ObserveAutomatic (flow, job);
            if (this.AutomaticActive ()) { this.ScheduleAutomatic (flow); }
        } catch (error) {
            if (this.automatic !== flow || !this.AutomaticActive ()) { return; }
            if (['wrong_target', 'unauthenticated', 'forbidden', 'not_found', 'expired'].includes (error.cadCode)) { this.AutomaticChanged (flow, 'paused', error.cadCode); return; }
            flow.failures = (flow.failures || 0) + 1; this.AutomaticChanged (flow, 'retrying', 'unavailable');
            this.ScheduleAutomatic (flow, Math.min (15000, 1500 * Math.pow (2, Math.min (flow.failures, 4))));
        }
    }
    async ObserveAutomatic (flow, job)
    {
        if (this.automatic !== flow || !this.AutomaticActive () || flow.state === 'importing') { return; }
        if (job.id !== flow.jobId) { throw ClientError ('wrong_target'); }
        if (liveStates.has (job.state)) { this.AutomaticChanged (flow, 'converting'); return; }
        if (job.state !== 'ready') { this.AutomaticChanged (flow, job.state === 'cancelled' ? 'cancelled' : 'failed', job.errorCode || (job.state === 'expired' ? 'expired' : 'conversion_failed')); return; }
        this.AssertAutomatic (flow);
        const editor = this.website.sessionEditor;
        if (editor.busy || editor.sessions.switching || this.website.rendering?.running || editor.packaging?.foldOperation || editor.arrayOperation) { this.AutomaticChanged (flow, 'waiting'); return; }
        this.AutomaticChanged (flow, 'importing');
        this.Progress ({ label : 'Adding converted model to Auto3D', percent : null, active : true, detail : '' });
        try {
            // The target document/account is pinned for the whole job. Its latest
            // revision is captured here, then Import guards every asynchronous step.
            flow.result = await this.Import (job.id, this.Origin (), () => this.AssertAutomatic (flow));
            this.AutomaticChanged (flow, 'added');
        } catch (error) { if (this.automatic === flow && this.AutomaticActive ()) { this.AutomaticChanged (flow, 'paused', error.cadCode || 'unavailable'); } }
        finally { this.Progress (null); }
    }
    async Start ({ sourceUnit = null, quality = 'standard', autoImport = true } = {})
    {
        if (typeof autoImport !== 'boolean') { throw ClientError ('invalid_request'); }
        if (this.AutomaticActive ()) { throw ClientError ('import_busy'); }
        this.selectionRequested = false;
        if (!autoImport) { this.automatic = null; this.updateAutomatic?.(); return this.Submit ({ sourceUnit, quality }); }
        const flow = this.NewAutomatic (CadFileType (this.file?.name));
        try {
            const result = await this.Submit ({ sourceUnit, quality });
            flow.jobId = result.job.id;
            if (this.automatic === flow && this.AutomaticActive ()) {
                this.AssertAutomatic (flow); this.AutomaticChanged (flow, 'converting');
                await this.ObserveAutomatic (flow, result.job); this.ScheduleAutomatic (flow);
            }
            return { ...result, automatic : this.AutomaticStatus () };
        } catch (error) { if (this.AutomaticActive ()) { this.AutomaticChanged (flow, flow.jobId && error.cadCode === 'wrong_target' ? 'paused' : 'failed', error.cadCode || 'unavailable'); } throw error; }
    }
    Progress (value) { this.submissionProgress = value; this.updateProgress?.(value); }
    async UploadSource (job, file)
    {
        const { owner, generation } = this.Account (), path = this.JobPath (job.id) + '/source';
        const progress = (loaded, total) => { this.Account (owner, generation); this.Progress ({ label : 'Uploading source privately', percent : total > 0 ? Math.floor (100 * Math.min (loaded, total) / total) : null, active : true, detail : total > 0 ? (loaded / 1048576).toFixed (1) + ' / ' + (total / 1048576).toFixed (1) + ' MiB' : '' }); };
        progress (0, file.size);
        if (typeof XMLHttpRequest === 'undefined') { await this.Request (path, 'PUT', file, true); progress (file.size, file.size); return; }
        try {
            await new Promise ((resolve, reject) => {
                const xhr = new XMLHttpRequest (); this.uploadRequest = xhr; xhr.open ('PUT', '/api/conversions' + path); xhr.withCredentials = true; xhr.timeout = 90000; xhr.responseType = 'json';
                xhr.setRequestHeader ('X-Auto3D-Account', owner); xhr.setRequestHeader ('Content-Type', 'application/octet-stream');
                xhr.upload.onprogress = event => { try { progress (event.loaded, event.lengthComputable ? event.total : file.size); } catch (error) { reject (error); xhr.abort (); } };
                xhr.upload.onload = () => { try { this.Account (owner, generation); this.Progress ({ label : 'Confirming private upload', percent : null, active : true, detail : '' }); } catch (error) { reject (error); xhr.abort (); } };
                xhr.onload = () => { try { this.Account (owner, generation); if (xhr.status < 200 || xhr.status >= 300) { throw ClientError (Object.hasOwn (CadMessages, xhr.response?.code || '') ? xhr.response.code : 'unavailable'); } resolve (); } catch (error) { reject (error); } };
                xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject (ClientError ('unavailable')); xhr.send (file);
            });
        } finally { this.uploadRequest = null; }
    }
    ClearFile () { this.file = null; this.pending = null; this.selectionRequested = false; if (this.picker) { this.picker.value = ''; } }
    Stage (file)
    {
        this.owner = this.Account ().owner; if (this.submitting || this.AutomaticActive ()) { throw ClientError ('import_busy'); }
        if (!file || typeof file.arrayBuffer !== 'function' || !CadFileType (file.name) || file.size <= 0) { throw ClientError ('invalid_request'); }
        if (file.size > CadLimits.inputBytes) { throw ClientError ('too_large'); }
        this.file = file; this.pending = null; this.automatic = null; this.selectionRequested = false; this.resetFileOptions?.(); return this.Inspect ();
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
        this.Progress ({ label : 'Preparing and verifying source', percent : null, active : true, detail : '' });
        try {
            const extension = CadFileType (file.name).extension;
            if (this.pending && (this.pending.sourceUnit !== sourceUnit || this.pending.quality !== quality)) { throw ClientError ('conflict'); }
            if (!this.pending) {
                const digest = new Uint8Array (await crypto.subtle.digest ('SHA-256', await file.arrayBuffer ()));
                this.Account (owner, generation);
                this.pending = CadRequest ({ requestKey : crypto.randomUUID (), sourceName : file.name, extension, sourceBytes : file.size, sourceSha256 : Array.from (digest, byte => byte.toString (16).padStart (2, '0')).join (''), sourceUnit, quality, origin });
            }
            let job = (await this.Request ('', 'POST', this.pending)).job;
            if (job.state === 'awaiting_upload') { await this.UploadSource (job, file); }
            this.Progress ({ label : 'Starting private conversion', percent : null, active : true, detail : '' });
            job = await this.Get (job.id);
            if (['awaiting_upload', 'queued'].includes (job.state)) { job = (await this.Request (this.JobPath (job.id) + '/submit', 'POST', { revision : job.revision })).job; }
            this.Progress (null); return { job };
        } catch (error) { if (error instanceof Error && error.cadCode) { throw error; } throw ClientError (error.code || 'unavailable'); }
        finally { this.submitting = false; if (this.submissionProgress) { this.Progress ({ ...this.submissionProgress, active : false }); } if (this.file !== file) { this.pending = null; } this.updateFile?.(); }
    }
    async Action (id, action)
    {
        if (!['cancel', 'retry', 'delete', 'diagnose'].includes (action) || this.website.sessionEditor.readOnly) { throw ClientError ('invalid_request'); }
        if (['cancel', 'delete'].includes (action) && this.automatic?.jobId === id) { this.StopAutomatic (); }
        if (action === 'retry' && this.AutomaticActive ()) { throw ClientError ('import_busy'); }
        const path = this.JobPath (id);
        if (action === 'delete') { return this.Request (path, 'DELETE'); }
        const job = await this.Get (id);
        if (action !== 'retry') { return this.Request (path + '/' + action, 'POST', { revision : job.revision }); }
        const flow = this.NewAutomatic (CadFileType (job.source?.name)); flow.jobId = id; flow.name = job.source?.name;
        try {
            const result = await this.Request (path + '/retry', 'POST', { revision : job.revision });
            this.AssertAutomatic (flow); this.AutomaticChanged (flow, 'converting');
            await this.ObserveAutomatic (flow, result.job); this.ScheduleAutomatic (flow);
            return { ...result, automatic : this.AutomaticStatus () };
        } catch (error) { if (this.AutomaticActive ()) { this.AutomaticChanged (flow, error.cadCode === 'wrong_target' ? 'paused' : 'failed', error.cadCode || 'unavailable'); } throw error; }
    }
    async Diagnostics (id)
    {
        const job = await this.Get (id), value = job.diagnostics;
        return { jobId : job.id, status : value?.status || 'not_run', errorCode : value?.errorCode || null,
            canRun : value?.canRun === true, report : value?.report ? CadDiagnosticReport (value.report) : null };
    }
    async Artifact (id, kind)
    {
        if (!Object.hasOwn (CadArtifacts, kind)) { throw ClientError ('invalid_request'); }
        return this.Request (this.JobPath (id) + '/artifacts/' + kind, 'GET', undefined, true);
    }
    async Appearance (id)
    {
        const job = await this.Get (id), sourceOnly = !job.summary?.appearance;
        const value = job.summary?.appearance || job.diagnostics?.appearance;
        return { jobId : job.id, status : value ? 'completed' : 'not_available', sourceOnly,
            report : value ? CadAppearanceReport (value, sourceOnly) : null };
    }
    async Download (id, kind)
    {
        const buffer = await this.Artifact (id, kind), url = URL.createObjectURL (new Blob ([buffer], { type : CadArtifacts[kind].type }));
        const link = document.createElement ('a'); link.href = url; link.download = CadArtifacts[kind].file; link.click (); setTimeout (() => URL.revokeObjectURL (url), 10000);
        return { downloaded : true, bytes : buffer.byteLength, format : kind, units : CadArtifacts[kind].units || null };
    }
    async Import (id, target, assertAutomatic = null)
    {
        const editor = this.website.sessionEditor, origin = this.Origin (), account = this.Account (), document = editor.document;
        if (!target || ['windowId', 'tabId', 'revision'].some (key => target[key] !== origin[key])) { throw ClientError ('wrong_target'); }
        if (!assertAutomatic && this.automatic?.jobId === id && this.AutomaticActive ()) { throw ClientError ('import_busy'); }
        const assert = () => { assertAutomatic?.(); this.Account (account.owner, account.generation); if (editor.document !== document || editor.sessions.active !== origin.tabId || editor.recoveryRevision !== origin.revision || editor.readOnly || this.website.rendering?.running || editor.packaging?.foldOperation || editor.arrayOperation) { throw ClientError ('wrong_target'); } };
        if (editor.busy || editor.sessions.switching) { throw ClientError ('conflict'); } assert ();
        editor.busy = true; editor.RefreshButtons?.();
        try {
            const job = await this.Get (id); assert (); if (job.state !== 'ready') { throw ClientError ('conflict'); }
            const buffer = await this.Artifact (id, 'glb'); assert ();
            const result = await ParseConvertedGlb (buffer); assert ();
            const current = await this.Get (id); assert (); if (current.state !== 'ready') { throw ClientError ('conflict'); }
            return await AddConvertedModel (editor, result, job, assert);
        } finally { if (editor.document === document) { editor.busy = false; } editor.RefreshButtons?.(); }
    }
    async Sample ()
    {
        const account = this.Account (); const response = await this.fetch ('/assets/samples/cad-box-40x30x20.step', { credentials : 'same-origin', redirect : 'error' }); this.Account (account.owner, account.generation);
        if (!response.ok) { throw ClientError ('unavailable'); } const buffer = await response.arrayBuffer (); this.Account (account.owner, account.generation);
        this.Stage (new File ([buffer], 'sample-40x30x20.step', { type : 'application/step' })); return this.Start ();
    }
    async Open (file, notice = '')
    {
        this.Account (); if (this.website.sessionEditor.readOnly) { throw ClientError ('forbidden'); }
        if (this.dialog && !this.dialog.open) { this.disposeDialog?.(); }
        if (this.dialog?.open) { if (file) { this.Stage (file); this.selectionRequested = true; } if (this.notice) { this.notice.textContent = notice; this.notice.hidden = !notice; } this.updateFile?.(); this.tryStart?.(); return { opened : true, interactive : true }; }
        if (file) { this.Stage (file); this.selectionRequested = true; }
        this.owner = this.website.auth.user.id;
        const dialog = WorkspaceDialog ('Convert CAD'); this.dialog = dialog; dialog.classList.add ('cad_conversion_dialog');
        const form = Element ('form', null, dialog); form.className = 'workspace_save_form';
        this.notice = Element ('p', notice, form); this.notice.hidden = !notice; this.notice.setAttribute ('role', 'status');
        Element ('p', 'Private cloud conversion · Parasolid (.x_t / .x_b) or STEP → STEP, GLB and STL.', form);
        Element ('p', 'Choosing a file starts private conversion and adds the finished GLB to this session automatically. Parasolid files need their actual coordinate units before starting. Temporary files expire after 24 hours; Parasolid support covers a subset of entities.', form).className = 'cad_conversion_note';
        const label = Element ('label', 'Source CAD file · up to 50 MiB', form), picker = Element ('input', null, label); picker.type = 'file'; picker.accept = CadFileAccept; this.picker = picker;
        const filename = Element ('p', '', form);
        const detected = Element ('p', '', form); detected.setAttribute ('aria-label', 'Detected CAD type');
        const options = Element ('div', null, form); options.className = 'cad_conversion_options';
        const unitLabel = Element ('label', 'Parasolid coordinate units', options), units = Element ('select', null, unitLabel); units.setAttribute ('aria-label', 'Parasolid coordinate units');
        for (const [value, text] of [['', 'Select actual units'], ['mm', 'Millimeters'], ['cm', 'Centimeters'], ['m', 'Meters'], ['in', 'Inches'], ['ft', 'Feet']]) { units.add (new Option (text, value)); }
        const qualityLabel = Element ('label', 'Mesh quality', options), quality = Element ('select', null, qualityLabel); quality.add (new Option ('Standard · 0.10 mm', 'standard')); quality.add (new Option ('Fine · 0.05 mm', 'fine'));
        const actions = Element ('div', null, form); actions.className = 'mode_buttons';
        const submit = Element ('button', 'Convert and add to Auto3D', actions); submit.type = 'submit';
        const sample = Element ('button', 'Convert sample · 40 × 30 × 20 mm', actions); sample.type = 'button';
        const status = Element ('p', 'Checking CAD service…', form); status.setAttribute ('role', 'status');
        const automatic = Element ('p', '', form); automatic.setAttribute ('role', 'status'); automatic.className = 'cad_conversion_automatic';
        const submission = ProgressElement (form); submission.root.hidden = true;
        this.updateProgress = value => { submission.root.hidden = !value; if (value) { submission.update (value); } }; this.updateProgress (this.submissionProgress);
        const jobs = Element ('div', null, dialog); jobs.className = 'cad_conversion_jobs'; jobs.setAttribute ('aria-label', 'My CAD conversions');
        const empty = Element ('p', 'Your conversions will appear here.', jobs), rows = new Map ();
        let closed = false, busy = false, ready = false, diagnosticsReady = false, timer = null, pollDelay = 1500;
        const update = () => {
            const type = CadFileType (this.file?.name), active = this.AutomaticActive (), flow = this.AutomaticStatus ();
            filename.textContent = this.file ? this.file.name + ' · ' + (this.file.size / 1048576).toFixed (2) + ' MiB' : active ? this.automatic.name || 'CAD import in progress.' : 'Choose a file or convert the public sample.';
            detected.textContent = type ? 'Detected ' + type.label + ' (.' + type.suffix + ')' + (type.requiresUnits ? ' · choose units to start automatically.' : ' · units read from the file.') : active && flow.type ? 'Detected ' + flow.type.label : ''; detected.hidden = !detected.textContent;
            unitLabel.hidden = !type?.requiresUnits; units.disabled = busy || active || !type?.requiresUnits; quality.disabled = busy || active; picker.disabled = busy || active;
            submit.disabled = busy || active || !ready || !this.file || type?.requiresUnits && !units.value; sample.disabled = busy || active || !ready;
            const messages = { submitting : 'Starting private conversion…', converting : 'Converting · the finished model will be added automatically. You can close this panel.', retrying : 'Reconnecting to the conversion service…', waiting : 'Ready · waiting for the current operation to finish before adding the model.', importing : 'Adding the converted GLB to Auto3D…', added : 'Added to the current session automatically. Undo is available.', paused : 'Automatic add paused. The result stays in My CAD conversions; use Add to current session when ready.', cancelled : 'Automatic CAD import cancelled.', failed : 'CAD conversion did not complete.' };
            automatic.textContent = flow ? messages[flow.state] + (flow.errorCode && CadMessages[flow.errorCode] ? ' ' + CadMessages[flow.errorCode] : '') : ''; automatic.hidden = !flow;
        };
        this.resetFileOptions = () => { units.value = ''; };
        this.updateFile = update;
        const run = async action => { if (closed || busy) { return; } busy = true; update (); try { await action (); if (!closed) { await refresh (); } } catch (error) { if (!closed) { status.textContent = error.message || CadMessages.unavailable; } } finally { busy = false; if (!closed) { update (); } } };
        const button = (text, parent, action) => { const node = Element ('button', text, parent); node.type = 'button'; node.onclick = () => run (action); return node; };
        const elapsed = () => { for (const record of rows.values ()) { const seconds = Math.max (0, Math.floor (((record.finished || Date.now ()) - record.started) / 1000)); record.elapsed.textContent = Number.isFinite (seconds) ? Math.floor (seconds / 60) + ':' + String (seconds % 60).padStart (2, '0') + ' elapsed' : ''; } };
        const clock = setInterval (elapsed, 1000);
        const schedule = (delay = pollDelay) => {
            clearTimeout (timer);
            if (closed || !this.jobs?.some (job => liveStates.has (job.state))) { return; }
            timer = setTimeout (async () => {
                if (closed) { return; } if (busy) { schedule (); return; }
                try { await refresh (); } catch { if (!closed) { status.textContent = CadMessages.unavailable; schedule (6000); } }
            }, delay);
        };
        const refresh = async () => {
            const result = await this.List (); if (closed) { return; } empty.hidden = !!result.jobs.length;
            const ids = new Set (result.jobs.map (job => job.id)); for (const [id, record] of rows) { if (!ids.has (id)) { record.row.remove (); rows.delete (id); } }
            let anchor = empty;
            for (const job of result.jobs) {
                let record = rows.get (job.id);
                if (!record) {
                    const row = Element ('article', null, jobs); row.className = 'cad_conversion_job'; row.dataset.jobId = job.id;
                    const title = Element ('strong', '', row), progress = ProgressElement (row), elapsed = Element ('span', '', row), message = Element ('p', '', row), summary = Element ('p', '', row), appearance = Element ('details', null, row), diagnostic = Element ('details', null, row), controls = Element ('div', null, row);
                    appearance.hidden = true;
                    diagnostic.className = 'cad_conversion_diagnostic'; diagnostic.hidden = true;
                    elapsed.className = 'cad_conversion_elapsed'; controls.className = 'mode_buttons'; record = { row, title, progress, elapsed, message, summary, appearance, diagnostic, controls }; rows.set (job.id, record);
                }
                const { row, controls } = record; if (anchor.nextSibling !== row) { anchor.after (row); } anchor = row; row.dataset.state = job.state;
                record.title.textContent = job.source.name;
                const view = CadProgressView (job); if (job.purpose === 'diagnostic' && view.active) { view.label = 'Server diagnostic · ' + view.label; } record.progress.update (view);
                record.started = Date.parse (job.createdAt); record.finished = liveStates.has (job.state) ? null : Date.parse (job.updatedAt);
                record.message.hidden = !job.errorCode || job.purpose === 'diagnostic'; record.message.textContent = job.errorCode ? (CadMessages[job.errorCode] || CadMessages.conversion_failed) + (CadPhases[job.progress?.phase] ? ' Stopped during: ' + CadPhases[job.progress.phase].toLowerCase () + '.' : '') : '';
                record.summary.hidden = !job.summary; record.summary.textContent = job.summary ? 'X × Y × Z: ' + job.summary.dimensionsMm.map (n => Number (n.toFixed (3))).join (' × ') + ' mm · ' + job.summary.topology.solids + ' solids · independently validated' : '';
                const appearance = job.summary?.appearance || job.diagnostics?.appearance;
                const appearanceKey = JSON.stringify (appearance);
                if (record.appearanceKey !== appearanceKey) {
                    record.appearanceKey = appearanceKey; record.appearance.replaceChildren (); record.appearance.hidden = !appearance;
                    if (appearance) {
                        try {
                            const lines = CadAppearanceLines (appearance, !job.summary?.appearance);
                            Element ('summary', 'Appearance report', record.appearance);
                            for (const line of lines) { Element ('p', line, record.appearance); }
                        } catch { record.appearance.hidden = true; }
                    }
                }
                const reportKey = JSON.stringify ([job.diagnostics?.report, job.diagnostics?.errorCode]);
                if (record.reportKey !== reportKey) {
                    record.reportKey = reportKey; record.diagnostic.replaceChildren (); record.diagnostic.hidden = !job.diagnostics?.report && !job.diagnostics?.errorCode;
                    Element ('summary', 'Server diagnostic report', record.diagnostic);
                    if (job.diagnostics?.report) {
                        try {
                            const report = CadDiagnosticReport (job.diagnostics.report);
                            Element ('p', CadDiagnosticAdvice (report), record.diagnostic);
                            const checks = Element ('ul', null, record.diagnostic);
                            for (const [key, text] of Object.entries (CadDiagnosticChecks)) { Element ('li', text + ' · ' + report.checks[key].replace ('_', ' '), checks); }
                            Element ('p', 'Worker ' + report.versions.worker + ' · Reader ' + (report.versions.reader || 'unknown') + ' · OCCT ' + (report.versions.occt || 'unknown'), record.diagnostic);
                            if (report.readerCode || report.exception) { Element ('p', [report.readerCode, report.exception, ...report.frames].filter (Boolean).join (' · '), record.diagnostic).className = 'cad_conversion_diagnostic_code'; }
                            Element ('p', 'Source geometry and raw logs stay on the private server. This report contains only checks and library error locations.', record.diagnostic);
                        } catch { Element ('p', 'The server report could not be verified.', record.diagnostic); }
                    } else if (job.diagnostics?.errorCode) { Element ('p', 'The diagnostic run could not complete. ' + (CadMessages[job.diagnostics.errorCode] || CadMessages.unavailable), record.diagnostic); }
                }
                const auto = this.automatic?.jobId === job.id ? this.AutomaticStatus () : null;
                const signature = JSON.stringify ([job.state, job.canRetry, job.diagnostics?.canRun, job.purpose, Object.keys (job.artifacts), auto?.state]); if (record.signature === signature) { continue; } record.signature = signature; controls.replaceChildren ();
                if (liveStates.has (job.state)) { button ('Cancel', controls, () => this.Action (job.id, 'cancel')); }
                if (job.canRetry) { button ('Retry', controls, () => this.Action (job.id, 'retry')); }
                if (job.diagnostics?.canRun && diagnosticsReady) { button ('Diagnose on server', controls, async () => { await this.Action (job.id, 'diagnose'); status.textContent = 'Inspecting the existing private upload on the server. No source file is sent to the agent.'; }); }
                if (job.state === 'ready') {
                    if (auto?.state === 'added') { Element ('p', 'Added to this session automatically · Undo available.', controls); }
                    else if (auto?.active) { Element ('p', auto.state === 'waiting' ? 'Waiting to add automatically…' : 'Adding automatically…', controls); }
                    else { button ('Add to current session', controls, async () => { const target = this.Origin (); await this.Import (job.id, target); status.textContent = 'Added to the current session. Undo is available.'; }); }
                    for (const kind of Object.keys (job.artifacts)) { button (kind.toUpperCase () + (CadArtifacts[kind].units ? ' · ' + CadArtifacts[kind].units : ''), controls, () => this.Download (job.id, kind)); }
                }
                button ('Delete files', controls, () => this.Action (job.id, 'delete'));
            }
            elapsed (); schedule (); pollDelay = Math.min (4000, pollDelay * 1.15);
        };
        this.updateAutomatic = () => { if (!closed) { update (); if (!busy) { refresh ().catch (() => { if (!closed) { status.textContent = CadMessages.unavailable; } }); } } };
        const start = () => run (async () => { status.textContent = 'Hashing and uploading your source privately…'; const result = await this.Start ({ sourceUnit : CadFileType (this.file?.name)?.requiresUnits ? units.value : null, quality : quality.value }); this.ClearFile (); status.textContent = 'Conversion submitted · the finished GLB will be added automatically.'; return result; });
        this.tryStart = () => { if (!closed && !busy && ready && this.selectionRequested && this.file && !this.AutomaticActive () && (!CadFileType (this.file.name).requiresUnits || units.value)) { return start (); } };
        picker.onchange = () => { try { if (picker.files[0]) { this.Stage (picker.files[0]); this.selectionRequested = true; } status.textContent = ready ? 'CAD type detected.' : 'CAD service is not ready.'; } catch (error) { status.textContent = error.message; } update (); this.tryStart (); };
        units.onchange = () => { this.selectionRequested = !!this.file; update (); this.tryStart (); };
        form.onsubmit = event => { event.preventDefault (); if (!submit.disabled) { start (); } };
        sample.onclick = () => run (async () => { status.textContent = 'Converting the public sample…'; await this.Sample (); this.ClearFile (); status.textContent = 'Sample submitted. Expected size: 40 × 30 × 20 mm.'; });
        const dispose = () => {
            if (closed) { return; } closed = true; clearTimeout (timer); clearInterval (clock);
            if (this.dialog === dialog) { this.ClearFile (); this.dialog = null; this.picker = null; this.updateFile = null; this.updateProgress = null; this.updateAutomatic = null; this.tryStart = null; this.resetFileOptions = null; this.notice = null; this.disposeDialog = null; }
        };
        this.disposeDialog = dispose; dialog.addEventListener ('close', dispose, { once : true });
        update ();
        try { const caps = await this.Capabilities (); if (!closed) { ready = caps.ready; diagnosticsReady = ready && caps.diagnosticProtocol === 1; status.textContent = ready ? 'CAD service ready · STEP/STL in mm · GLB in meters.' : 'The CAD service is not ready yet.'; await refresh (); } }
        catch (error) { if (!closed) { status.textContent = error.message; } }
        if (!closed) { update (); this.tryStart?.(); } return { opened : !closed, interactive : true };
    }
}
export function CadConversionsFor (website) { website.cadConversions ||= new CadConversions (website); return website.cadConversions; }
