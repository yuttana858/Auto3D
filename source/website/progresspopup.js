// A non-modal progress popup over the main viewer for multi-step modelling operations. Each step has a
// weight; the percentage is the weighted share of work actually completed (finished steps plus the real
// fraction reported inside the current step), and each finished step shows how long it really took.
// Agents read the same record through the operation's result.

const Clock = () => (typeof performance !== 'undefined' ? performance.now () : Date.now ());
export const NextFrame = () => new Promise (resolve => {
    // Let the popup paint; background tabs do not run animation frames, so fall back to a timer.
    let done = false; const finish = () => { if (!done) { done = true; resolve (); } };
    if (typeof requestAnimationFrame === 'function') { requestAnimationFrame (() => setTimeout (finish, 0)); }
    setTimeout (finish, 50);
});

export class ProgressRecord
{
    constructor (title, steps)
    {
        if (!Array.isArray (steps) || !steps.length || steps.some (s => typeof s.id !== 'string' || typeof s.label !== 'string' || !(s.weight > 0))) { throw new Error ('A progress record needs labelled, weighted steps.'); }
        this.title = title; this.steps = steps.map (s => ({ id : s.id, label : s.label, weight : s.weight, state : 'pending', detail : '', fraction : 0, ms : null })); this.total = this.steps.reduce ((sum, s) => sum + s.weight, 0);
        this.state = 'running'; this.message = ''; this.started = Clock (); this.listeners = new Set ();
    }
    Step (id, { detail = '', fraction = 0 } = {})
    {
        const index = this.steps.findIndex (s => s.id === id); if (index < 0) { throw new Error ('Unknown progress step: ' + id); }
        const now = Clock ();
        this.steps.forEach ((step, i) => {
            if (i < index && step.state !== 'done') { step.state = 'done'; step.fraction = 1; step.ms = step.startedAt === undefined ? 0 : now - step.startedAt; }
        });
        const step = this.steps[index]; if (step.state !== 'active') { step.state = 'active'; step.startedAt = now; }
        step.detail = detail; step.fraction = Math.max (0, Math.min (1, fraction)); this.Changed (); return this;
    }
    Done (message = '')
    {
        const now = Clock (); this.steps.forEach (step => { if (step.state !== 'done') { step.ms = step.startedAt === undefined ? 0 : now - step.startedAt; step.state = 'done'; step.fraction = 1; } });
        this.state = 'done'; this.message = message; this.Changed (); return this;
    }
    Fail (message)
    {
        const now = Clock (); const active = this.steps.find (step => step.state === 'active'); if (active) { active.state = 'failed'; active.ms = now - active.startedAt; }
        this.state = 'failed'; this.message = message; this.Changed (); return this;
    }
    get percent () { return Math.round (1000 * this.steps.reduce ((sum, s) => sum + s.weight * (s.state === 'done' ? 1 : s.state === 'active' || s.state === 'failed' ? s.fraction : 0), 0) / this.total) / 10; }
    Inspect ()
    {
        return { title : this.title, state : this.state, percent : this.percent, message : this.message, totalMs : Math.round (Clock () - this.started), steps : this.steps.map (({ id, label, state, detail, fraction, ms }) => ({ id, label, state, detail, fraction : Math.round (fraction * 1000) / 1000, ms : ms === null ? null : Math.round (ms) })) };
    }
    Changed () { this.listeners.forEach (listener => listener (this)); }
}

function Element (tag, className, parent, text)
{
    const node = document.createElement (tag); if (className) { node.className = className; } if (text !== undefined) { node.textContent = text; } parent?.appendChild (node); return node;
}

// The popup for a ProgressRecord. It closes itself a moment after the record finishes.
export function ShowProgressPopup (record, { host = null, closeAfterMs = 2600 } = {})
{
    if (typeof document === 'undefined') { return { Close () {} }; }
    const parent = host || document.getElementById ('main_viewer') || document.body;
    const root = Element ('section', 'progress_popup', parent); root.setAttribute ('role', 'dialog'); root.setAttribute ('aria-label', record.title + ' progress');
    const head = Element ('div', 'progress_popup_head', root); Element ('strong', null, head, record.title); const percent = Element ('span', 'progress_popup_percent', head, '0%');
    const bar = Element ('div', 'progress_popup_bar', root); bar.setAttribute ('role', 'progressbar'); bar.setAttribute ('aria-label', record.title); bar.setAttribute ('aria-valuemin', '0'); bar.setAttribute ('aria-valuemax', '100');
    const fill = Element ('div', null, bar);
    const list = Element ('ol', 'progress_popup_steps', root);
    const rows = record.steps.map (step => { const row = Element ('li', null, list); row.dataset.step = step.id; Element ('span', 'progress_popup_mark', row); const text = Element ('span', 'progress_popup_label', row, step.label); const detail = Element ('span', 'progress_popup_detail', row); const time = Element ('span', 'progress_popup_time', row); return { row, text, detail, time }; });
    const status = Element ('p', 'progress_popup_message', root); status.setAttribute ('role', 'status'); status.setAttribute ('aria-live', 'polite');
    let timer = null;
    const draw = () => {
        const value = record.percent; percent.textContent = value.toFixed (value % 1 ? 1 : 0) + '%'; fill.style.width = value + '%'; bar.setAttribute ('aria-valuenow', String (value));
        record.steps.forEach ((step, i) => {
            const r = rows[i]; r.row.dataset.state = step.state;
            r.detail.textContent = step.detail || '';
            r.time.textContent = step.ms !== null ? (step.ms < 1000 ? Math.round (step.ms) + ' ms' : (step.ms / 1000).toFixed (2) + ' s') : step.state === 'active' && step.fraction > 0 ? Math.round (step.fraction * 100) + '%' : '';
        });
        root.dataset.state = record.state; status.textContent = record.message;
        if (record.state !== 'running' && !timer) { timer = setTimeout (() => root.remove (), record.state === 'failed' ? closeAfterMs * 2 : closeAfterMs); }
    };
    record.listeners.add (draw); draw();
    return { element : root, Close () { record.listeners.delete (draw); clearTimeout (timer); root.remove (); } };
}
