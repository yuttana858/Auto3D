// Embedded clip actions use timeline seconds; the original paused clip is the baseline.
export function ValidateTimelineClips (input = [])
{
    if (!Array.isArray (input) || input.length > 1000) { throw new Error ('Use at most 1,000 embedded clip actions.'); }
    const ids = new Set (); const actions = input.map (action => {
        if (!action || Object.keys (action).some (key => !['id', 'objectId', 'clip', 'time', 'duration', 'speed', 'loop', 'baseClip', 'baseTime'].includes (key)) || typeof action.id !== 'string' || !action.id || action.id.length > 128 || ids.has (action.id) || typeof action.objectId !== 'string' || !action.objectId || action.objectId.length > 128 || !Number.isInteger (action.clip) || action.clip < 0 || action.clip > 10000 || !Number.isInteger (action.baseClip) || action.baseClip < 0 || action.baseClip > 10000 || !Number.isFinite (action.baseTime) || action.baseTime < 0 || action.baseTime > 3600 || !Number.isFinite (action.time) || action.time < 0 || !Number.isFinite (action.duration) || action.duration < .01 || action.time + action.duration > 3600 || !Number.isFinite (action.speed) || action.speed < .01 || action.speed > 10 || typeof action.loop !== 'boolean') { throw new Error ('Invalid embedded clip action.'); }
        ids.add (action.id); return { ...action };
    }).sort ((a, b) => a.time - b.time || a.id.localeCompare (b.id));
    const last = new Map ();
    for (const action of actions) { const previous = last.get (action.objectId); if (previous && (previous.time + previous.duration > action.time + 1e-8 || previous.baseClip !== action.baseClip || previous.baseTime !== action.baseTime)) { throw new Error ('Embedded clips for the same object must not overlap and must share a baseline.'); } last.set (action.objectId, action); }
    return actions;
}
export function TimelineClipSample (actions, objectId, time, clips)
{
    const entries = actions.filter (item => item.objectId === objectId); if (!entries.length) { return null; }
    let selected = null; for (const action of entries) { if (action.time > time) { break; } selected = action; }
    if (!selected) { return { clip : entries[0].baseClip, time : entries[0].baseTime, loop : null }; }
    const length = clips[selected.clip]?.duration; if (!Number.isFinite (length) || length <= 0) { return null; }
    const elapsed = Math.max (0, Math.min (selected.duration, time - selected.time)) * selected.speed;
    return { clip : selected.clip, time : selected.loop ? elapsed % length : Math.min (elapsed, length), loop : selected.loop };
}
