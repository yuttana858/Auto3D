// A percentage describes one resize session, not a multiplier applied again after
// every keystroke. Keep the last accepted percentage while serializing rebuilds.
export class LiveProductScale
{
    constructor (host, apply) { this.host = host; this.apply = apply; this.percent = 100; this.epoch = 0; this.active = false; }
    Context () { const d = this.host.inspect (); return JSON.stringify ([d.editContext, d.liveObjectId || null, d.family, this.host.units ()]); }
    Geometry ()
    {
        const d = this.host.inspect ();
        return JSON.stringify ([d.heightMm, d.widthMm, d.depthMm, d.diameterMm, d.bottleShape, d.bottleSection, d.pouchShape]);
    }
    CancelQueued () { for (const waiter of this.queued?.waiters || []) { waiter.resolve (false); } this.queued = null; }
    Refresh ()
    {
        const context = this.Context (), geometry = this.Geometry ();
        const reset = context !== this.context || !this.active && geometry !== this.geometry;
        if (reset) { this.CancelQueued (); this.epoch++; this.percent = 100; this.context = context; this.geometry = geometry; }
        return reset;
    }
    Dispose () { this.disposed = true; this.epoch++; this.CancelQueued (); }
    Commit (percent, scaleArtwork)
    {
        if (this.disposed) { return Promise.resolve (false); }
        if (!Number.isFinite (percent) || percent < 10 || percent > 1000) { return Promise.reject (new Error ('Enter a scale from 10% to 1000%.')); }
        this.Refresh ();
        const d = this.host.inspect (), promise = new Promise ((resolve, reject) => {
            this.queued = { percent, scaleArtwork, context : this.context, epoch : this.epoch, objectId : d.liveObjectId || null, waiters : [...(this.queued?.waiters || []), { resolve, reject }] };
        });
        if (!this.active) { this.active = true; Promise.resolve ().then (() => this.Drain ()); }
        return promise;
    }
    async Drain ()
    {
        try {
            while (this.queued && !this.disposed) {
                const edit = this.queued; this.queued = null;
                if (edit.epoch !== this.epoch || edit.context !== this.Context ()) { for (const waiter of edit.waiters) { waiter.resolve (false); } continue; }
                let accepted = false;
                try {
                    const factor = edit.percent / this.percent;
                    const result = factor === 1 ? true : await this.apply ({ factor, scaleArtwork : edit.scaleArtwork, objectId : edit.objectId });
                    accepted = result !== false && !this.disposed && edit.epoch === this.epoch && edit.context === this.Context ();
                    if (accepted) { this.percent = edit.percent; this.geometry = this.Geometry (); }
                } catch (error) { for (const waiter of edit.waiters) { waiter.reject (error); } continue; }
                for (const waiter of edit.waiters) { waiter.resolve (accepted); }
            }
        } finally { this.active = false; }
    }
}
