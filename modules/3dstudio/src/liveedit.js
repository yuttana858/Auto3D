export function MergeStudioPatch (before = {}, after = {})
{
    const result = { ...before, ...after };
    for (const key of ['parameters', 'material', 'transform']) {
        if (before[key] || after[key]) { result[key] = { ...before[key], ...after[key] }; }
    }
    return result;
}

// The module owns interaction timing. The host owns validation, rendering and
// scene history, and receives pinned object/node IDs for every accepted update.
export class StudioEditQueue
{
    constructor (context, apply, changed = () => {}) { this.context = context; this.apply = apply; this.changed = changed; this.active = null; this.pending = null; this.disposed = false; }
    Patch () { return MergeStudioPatch (this.active?.context === this.context () ? this.active.patch : {}, this.pending?.context === this.context () ? this.pending.patch : {}); }
    Cancel () { for (const waiter of this.pending?.waiters || []) { waiter.resolve (false); } this.pending = null; }
    Dispose () { this.disposed = true; this.Cancel (); }
    Push (objectId, nodeId, patch)
    {
        if (this.disposed) { return Promise.resolve (false); }
        const context = this.context ();
        if (this.pending && this.pending.context !== context) { this.Cancel (); }
        const promise = new Promise ((resolve, reject) => {
            this.pending = { objectId, nodeId, context, patch : MergeStudioPatch (this.pending?.patch, patch), waiters : [...(this.pending?.waiters || []), { resolve, reject }] };
        });
        if (!this.active) { this.Drain (); }
        return promise;
    }
    async Drain ()
    {
        try {
            while (this.pending && !this.disposed) {
                const edit = this.pending; this.pending = null;
                if (edit.context !== this.context ()) { for (const waiter of edit.waiters) { waiter.resolve (false); } continue; }
                this.active = edit; this.changed ();
                try {
                    const result = await this.apply ({ objectId : edit.objectId, nodeId : edit.nodeId, ...edit.patch });
                    const accepted = !this.disposed && edit.context === this.context () && result !== false;
                    for (const waiter of edit.waiters) { waiter.resolve (accepted ? result ?? true : false); }
                } catch (error) {
                    for (const waiter of edit.waiters) { waiter.reject (error); }
                }
                this.active = null;
            }
        } finally { this.active = null; if (!this.disposed) { this.changed (); } }
    }
}
