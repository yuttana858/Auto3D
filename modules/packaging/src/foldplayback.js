export class FoldPlayback
{
    constructor (render, duration = 6, clock = {})
    {
        if (!Number.isFinite (duration) || duration < 1 || duration > 30) { throw new Error ('Animation duration must be 1–30 seconds.'); }
        this.render = render; this.duration = duration; this.now = clock.now || (() => performance.now ()); this.request = clock.request || (callback => requestAnimationFrame (callback)); this.cancel = clock.cancel || (id => cancelAnimationFrame (id)); this.state = 'idle'; this.progress = 0;
    }
    Start ()
    {
        if (this.state !== 'idle') { throw new Error ('This folding playback has already started.'); }
        this.state = 'playing'; this.elapsed = 0; this.last = this.now ();
        this.completion = new Promise ((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); this.Tick (); return this.completion;
    }
    Tick ()
    {
        if (this.state !== 'playing') { return; }
        try {
            const now = this.now (); this.elapsed += Math.max (0, now - this.last); this.last = now; this.progress = Math.min (1, this.elapsed / (this.duration * 1000)); this.render (this.progress);
            if (this.progress === 1) { this.state = 'completed'; this.resolve ({ completed : true }); } else { this.frame = this.request (() => this.Tick ()); }
        } catch (error) { this.state = 'failed'; this.reject (error); }
    }
    Pause () { if (this.state === 'playing') { this.cancel (this.frame); this.state = 'paused'; } return this.Inspect (); }
    Resume () { if (this.state === 'paused') { this.last = this.now (); this.state = 'playing'; this.Tick (); } return this.Inspect (); }
    Stop () { if (['playing', 'paused'].includes (this.state)) { this.cancel (this.frame); this.state = 'cancelled'; this.resolve ({ completed : false }); } return this.Inspect (); }
    Inspect () { return { state : this.state, progress : this.progress, duration : this.duration }; }
}
