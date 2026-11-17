import { PulpDefinition, ValidatePulpDefinition, MaxStoredProducts } from '../../modules/molded-pulp/src/definition.js';
import { PulpTypes } from '../../modules/molded-pulp/src/state.js';
import { MoldedPulpModelAsync, SessionTrianglesMm, PulpMillimeters } from './moldedpulpadapter.js';
const nextFrame = () => new Promise (resolve => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout) (() => resolve ()));

export const MoldedPulpDataKey = '_auto3dMoldedPulp';
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia ('(prefers-reduced-motion: reduce)').matches;
const LiveDelayMs = 140, SliceTriangles = 40000;

// Runs forming jobs off the main thread. One job is in flight at a time: a newer request terminates the stale worker so
// its CPU time is not wasted. Without Worker support the module plans inline.
export class PulpJobs
{
    constructor (url) { this.url = url; this.worker = null; this.pending = null; this.seq = 0; }
    Run (module, message, onProgress)
    {
        if (typeof Worker !== 'function' || !this.url) { return Promise.resolve (module.PlanPulp (message.stage, message.triangles, message.draft, { detail : message.detail, onProgress })); }
        this.Cancel (); const id = ++this.seq, worker = this.worker ||= new Worker (this.url ());
        return new Promise ((resolve, reject) => {
            this.pending = { id, reject };
            worker.onmessage = event => {
                const data = event.data; if (data?.id !== id) { return; }
                if (data.progress !== undefined) { onProgress?.(data.phase, data.progress); return; }
                this.pending = null; if (data.error) { reject (new Error (data.error)); } else { resolve (data.plan); }
            };
            worker.onerror = event => { event.preventDefault?.(); this.pending = null; this.worker?.terminate (); this.worker = null; reject (new Error ('Molded pulp forming failed: ' + (event.message || 'worker error'))); };
            worker.postMessage ({ id, ...message });
        });
    }
    Cancel () { if (this.pending) { const { reject } = this.pending; this.pending = null; this.worker?.terminate (); this.worker = null; reject (Object.assign (new Error ('Superseded by a newer forming request.'), { superseded : true })); } }
    Dispose () { this.Cancel (); this.worker?.terminate (); this.worker = null; }
}

// Scene operations for the Molded Pulp module: sense the selected products, place a flat sheet directly under them and
// form it into a tray or clamshell. A sheet or tray generated for the same products is replaced in place (same object
// identity), so Sense → Generate sheet → Form tray → Form depth edits one pulp object.
//   • Each committed change is one Undo step. Consecutive live edits merge into one step until another action adds a
//     history entry (or a non-live build or Sense runs), so Undo returns to the state before the live tweaking began.
//   • Trays are formed in a worker. Detail above Draft is progressive: the draft shape is committed first and the requested
//     detail replaces it in place (same Undo step) when ready, unless the user has moved on.
export class MoldedPulpWorkspace
{
    constructor (panel, load, workerUrl = null)
    {
        this.panel = panel; this.load = load; this.active = false; this.sensed = null; this.result = null; this.pulpId = null;
        this.jobs = new PulpJobs (workerUrl); this.token = 0; this.refining = null; this.liveEntry = null; this.liveTimer = null; this.pendingLive = null;
    }
    get editor () { return this.panel.website.sessionEditor; }
    IsPulp (object) { return object?.userData?.[MoldedPulpDataKey] !== undefined; }
    Products (ids)
    {
        const objects = this.editor.document.objects, found = ids.map (id => objects.find (object => object.id === id));
        if (found.some (object => !object)) { throw new Error ('A sensed product was removed. Select the products and sense again.'); }
        return found;
    }
    Sense ()
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        const editor = this.editor, chosen = editor.SelectedObjects ().length ? editor.SelectedObjects () : editor.selected ? [editor.selected] : [];
        const primary = chosen.includes (editor.selected) && !this.IsPulp (editor.selected) ? editor.selected : null;
        const products = [primary, ...chosen.filter (object => object !== primary)].filter (object => object && object.visible !== false && !this.IsPulp (object));
        if (!products.length) { throw new Error ('Select one or more products (or a group) to sense.'); }
        if (products.length > 1000) { throw new Error ('Sense at most 1000 products at a time.'); }
        this.SetSensed (products); this.result = null; this.liveEntry = null; this.panel.Refresh ();
        const r = v => Math.round (v * 10) / 10, f = this.sensed.footprint;
        return { ...this.Summary (), message : `Sensed ${products.length} product${products.length === 1 ? '' : 's'}: ${r (f.lengthMm)} × ${r (f.widthMm)} × ${r (f.heightMm)} mm (L × W × H).` };
    }
    SetSensed (products)
    {
        const triangles = SessionTrianglesMm (this.editor.document, products), bounds = this.Bounds (triangles);
        this.sensed = { objectIds : products.map (p => p.id), primaryId : products[0].id, primaryName : products[0].name, count : products.length, triangleCount : triangles.length / 9, footprint : { lengthMm : bounds.size[0], widthMm : bounds.size[2], heightMm : bounds.size[1] }, bounds };
    }
    Bounds (triangles)
    {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < triangles.length; i += 3) { for (let a = 0; a < 3; a++) { min[a] = Math.min (min[a], triangles[i + a]); max[a] = Math.max (max[a], triangles[i + a]); } }
        if (!Number.isFinite (min[0])) { throw new Error ('The selected products have no triangle geometry.'); }
        return { min, max, size : max.map ((v, a) => v - min[a]) };
    }
    Summary () { return this.sensed ? { count : this.sensed.count, objectIds : [...this.sensed.objectIds], primaryId : this.sensed.primaryId, primaryName : this.sensed.primaryName, triangleCount : this.sensed.triangleCount, footprint : { ...this.sensed.footprint }, units : 'mm' } : null; }
    Current ()
    {
        const object = this.pulpId && this.editor.document.objects.find (item => item.id === this.pulpId);
        return object && this.IsPulp (object) ? object : null;
    }
    CurrentStage () { const object = this.Current (); return object ? ValidatePulpDefinition (JSON.parse (object.userData[MoldedPulpDataKey])).stage : null; }
    // Load a selected generated sheet/tray back into the draft and sensed product list without changing the scene.
    LoadSelected ()
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        const object = this.editor.selected; if (!this.IsPulp (object)) { throw new Error ('Select a generated molded pulp sheet or tray.'); }
        const definition = ValidatePulpDefinition (JSON.parse (object.userData[MoldedPulpDataKey])); if (!definition.productIds.length) { throw new Error ('This pulp object was formed over more than ' + MaxStoredProducts + ' products. Select them and sense again.'); }
        this.SetSensed (this.Products (definition.productIds)); this.panel.draft = definition.draft; this.pulpId = object.id; this.result = null; this.liveEntry = null;
        this.panel.Refresh (); return { objectId : object.id, stage : definition.stage, draft : { ...definition.draft }, sensed : this.Summary () };
    }
    // Live preview after a draft edit: debounce keystrokes, then rebuild the current sheet/tray (or place a sheet once
    // products are sensed). Latest edit wins; a build in progress reruns once it finishes.
    ScheduleLive ()
    {
        if (!this.sensed && !this.Current ()) { return; }
        clearTimeout (this.liveTimer);
        this.liveTimer = setTimeout (() => { this.liveTimer = null; this.RunLive (); }, LiveDelayMs);
    }
    async RunLive ()
    {
        const stage = this.CurrentStage () || 'sheet';
        if (this.active) { this.pendingLive = stage; return; }
        try { await this.Build (stage, { live : true }); }
        catch (error) { if (!error.superseded) { this.panel.Notice?.(error.message); } }
    }
    async Build (stage, { live = false, waitForDetail = false } = {})
    {
        const panel = this.panel, editor = this.editor;
        if (this.active || panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        if (!this.sensed) { this.Sense (); }
        const token = ++this.token, draft = { ...panel.draft }, ids = [...this.sensed.objectIds], target = editor.document, owner = panel.website.auth?.user?.id;
        const detail = stage === 'tray' ? draft.detail : 'draft', progressive = stage === 'tray' && detail !== 'draft';
        const sameSession = () => { if (editor.document !== target || panel.website.auth?.user?.id !== owner || editor.readOnly || panel.website.accountReady === false) { throw new Error ('The account or session changed while forming pulp.'); } };
        this.active = true; this.refining = null; panel.Refresh ();
        let commit, first;
        try {
            const module = await this.load (); sameSession ();
            const triangles = SessionTrianglesMm (target, this.Products (ids));
            first = stage === 'sheet' ? module.PlanSheet (triangles, draft) : await this.jobs.Run (module, { stage, triangles, draft, detail : progressive ? 'draft' : detail });
            if (token !== this.token) { throw Object.assign (new Error ('Superseded by a newer forming request.'), { superseded : true }); }
            sameSession ();
            commit = await this.Commit (module, first, stage, draft, ids, live);
            this.result = this.Result (stage, first);
            if (stage === 'tray' && !live && first.clamshell === 'none') { await this.Animate (commit.object); }
        } finally {
            this.active = false; panel.Refresh ();
            if (this.pendingLive) { this.pendingLive = null; this.ScheduleLive (); }
        }
        const refine = progressive ? this.Refine (token, stage, draft, ids, detail, commit) : null;
        const final = waitForDetail && refine ? await refine : null;
        const plan = final || commit.plan, warnings = plan.checks.filter (c => c.severity === 'warning').length, m = plan.metrics;
        const what = stage === 'tray' ? `${plan.clamshell !== 'none' ? 'Formed clamshell' : 'Formed tray'}: ${m.pocketCount} pocket${m.pocketCount === 1 ? '' : 's'}, depth ${m.achievedDepthMm} mm${m.ribCount ? `, ${m.ribCount} rib${m.ribCount === 1 ? '' : 's'}` : ''}${m.lugCount ? `, ${m.lugCount} lugs` : ''}` : `Sheet ${m.lengthMm} × ${m.widthMm} × ${draft.thicknessMm} mm placed${plan.components.length > 1 ? ' on both sides of' : ' under'} the products`;
        return { objectId : commit.object.id, stage, replaced : commit.replaced, units : 'mm', detail : final ? detail : first.metrics.detail || detail, refining : Boolean (refine && !final), metrics : { ...m }, checks : plan.checks.map (c => ({ ...c })), trace : plan.features?.trace?.map (t => ({ ...t })) || [], draft, message : what + (warnings ? ` · ${warnings} design warning${warnings === 1 ? '' : 's'}` : '') + (refine && !final ? ` · refining at ${detail} detail in the background.` : '.') };
    }
    // Background refinement at the requested detail; swaps the geometry in place within the same Undo step if nothing
    // has changed meanwhile. Returns the refined plan, or null when superseded.
    async Refine (token, stage, draft, ids, detail, commit)
    {
        const panel = this.panel, editor = this.editor, target = editor.document;
        this.refining = { detail, progress : 0, phase : 'starting' }; panel.Refresh ();
        try {
            const module = await this.load (), triangles = SessionTrianglesMm (target, this.Products (ids));
            const plan = await this.jobs.Run (module, { stage, triangles, draft, detail }, (phase, progress) => { if (token === this.token) { this.refining = { detail, phase, progress }; panel.Refresh (); } });
            const preview = commit.record.after;
            if (token !== this.token || this.active || editor.document !== target || !target.objects.includes (preview) || editor.history.undo.at (-1) !== commit.entry) { return null; }
            this.active = true;
            try { await this.Commit (module, plan, stage, draft, ids, false, commit); this.result = this.Result (stage, plan); editor.Status?.(`Refined molded pulp at ${detail} detail.`); return plan; }
            finally { this.active = false; }
        } catch (error) { if (!error.superseded) { panel.Notice?.(error.message); } return null; }
        finally { if (token === this.token) { this.refining = null; } panel.Refresh (); }
    }
    Result (stage, plan) { return { stage, clamshell : plan.clamshell, metrics : plan.metrics, checks : plan.checks, trace : plan.features?.trace || [] }; }
    // Places plan geometry in the scene, replacing the current pulp object in place. A new Undo step is pushed unless the
    // change merges into the live-edit step (consecutive live edits) or refines an existing step (into).
    async Commit (module, plan, stage, draft, ids, live, into = null)
    {
        const editor = this.editor, target = editor.document, source = this.Current (), index = source ? target.objects.indexOf (source) : target.objects.length;
        if (!source && target.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const previous = editor.selected, unit = target.objects.length ? target.model.GetUnit () : null;
        const { model, position } = await MoldedPulpModelAsync (plan, unit ?? target.model.GetUnit (), PulpTypes[draft.pulpType].roughness, plan.metrics.triangles > SliceTriangles ? nextFrame : null);
        if (source && !target.objects.includes (source)) { throw new Error ('The pulp object was removed while forming pulp.'); }
        const name = stage === 'tray' ? (plan.clamshell !== 'none' ? 'Molded pulp clamshell · ' + PulpTypes[draft.pulpType].short + ' · ' + draft.thicknessMm + ' mm' : module.PulpName (draft)) : 'Molded pulp sheet · ' + draft.thicknessMm + ' mm';
        const object = target.AddImported (model, source && !(stage === 'tray' && source.name.startsWith ('Molded pulp sheet')) && !source.name.startsWith ('Molded pulp') ? source.name : name, undefined, true, true);
        if (source) { for (const key of ['id', 'visible', 'castShadow', 'receiveShadow']) { object[key] = source[key]; } }
        object.position = position; object.rotation = [0, 0, 0]; object.scale = [1, 1, 1]; object.userData = { ...(source?.userData || {}) };
        object.userData[MoldedPulpDataKey] = JSON.stringify (PulpDefinition (draft, stage, ids.length <= MaxStoredProducts ? ids : [])); target.ApplyTransform (object);
        if (source) { target.Remove (object); target.Remove (source); target.Restore (object, index); }
        editor.selected = previous && target.objects.includes (previous) && !this.IsPulp (previous) ? previous : object;
        editor.busy = true;
        try { await editor.Render (); } finally { editor.busy = false; editor.RefreshButtons?.(); }
        this.pulpId = object.id;
        const top = editor.history.undo.at (-1), merging = into || (live && this.liveEntry && top === this.liveEntry.entry && this.liveEntry.record.after === source ? this.liveEntry : null);
        if (merging) { merging.record.after = object; merging.time = Date.now (); merging.plan = plan; return merging; }
        const record = { before : source, after : object, index };
        const apply = async forward => {
            if (editor.document !== target) { throw new Error ('This pulp object belongs to another session.'); }
            const out = forward ? record.before : record.after, into2 = forward ? record.after : record.before;
            if (out && target.objects.includes (out)) { target.Remove (out); }
            if (into2) { target.Restore (into2, record.index); }
            this.pulpId = into2?.id || null; this.liveEntry = null; this.token++; this.jobs.Cancel (); this.refining = null;
            editor.selected = into2 || (previous && target.objects.includes (previous) ? previous : null);
            await editor.Render (); this.panel.Refresh ();
        };
        const entry = { undo : () => apply (false), redo : () => apply (true) };
        editor.history.Push (entry);
        const handle = { entry, record, object, plan, replaced : Boolean (source), time : Date.now () };
        this.liveEntry = live ? handle : null;
        editor.Status?.(stage === 'tray' ? (plan.clamshell !== 'none' ? 'Formed molded pulp clamshell.' : 'Formed molded pulp tray.') : 'Placed molded pulp sheet.');
        return handle;
    }
    // Presentation only: the formed tray rises from the flat sheet about its base plane. The committed geometry and
    // object transform are unchanged; reduced-motion preference skips the motion.
    async Animate (object)
    {
        const three = object.threeObject, viewer = this.panel.website.viewer; if (!three || reducedMotion () || typeof requestAnimationFrame !== 'function') { return; }
        const start = performance.now (), duration = 900;
        await new Promise (resolve => {
            const step = now => {
                const t = Math.min (1, (now - start) / duration), eased = 1 - (1 - t) ** 3;
                three.scale.y = object.scale[1] * Math.max (0.02, eased); three.updateMatrixWorld?.(true); viewer.Render?.();
                if (t < 1 && object.threeObject === three) { requestAnimationFrame (step); } else { three.scale.y = object.scale[1]; three.updateMatrixWorld?.(true); viewer.Render?.(); resolve (); }
            };
            requestAnimationFrame (step);
        });
    }
    async SetFormDepth (mm, options = {})
    {
        this.panel.Configure ({ formDepthMm : mm });
        if (this.CurrentStage () === 'tray') { const result = await this.Build ('tray', options); return { ...result, formDepthMm : mm, message : 'Form depth ' + mm + ' mm · ' + result.message }; }
        return { formDepthMm : mm, updated : false, message : `Form depth set to ${mm} mm. Form tray pulls the sheet up to this height.` };
    }
    Reset () { this.token++; this.jobs.Cancel (); clearTimeout (this.liveTimer); this.sensed = null; this.result = null; this.pulpId = null; this.refining = null; this.liveEntry = null; }
    UnitFactor () { return PulpMillimeters[this.editor.document.model.GetUnit ()] || null; }
}
