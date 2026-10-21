export function ValidateTimelineActions (input = [])
{
    if (!Array.isArray (input) || input.length > 1000) { throw new Error ('Use at most 1,000 timeline actions.'); }
    const ids = new Set (); const actions = input.map (action => {
        if (!action || Object.keys (action).some (key => !['id', 'objectId', 'type', 'time', 'duration', 'direction'].includes (key)) || typeof action.id !== 'string' || !action.id || ids.has (action.id) || typeof action.objectId !== 'string' || !action.objectId || action.type !== 'foldUnfold' || !['toggle', 'fold', 'unfold'].includes (action.direction) || !Number.isFinite (action.time) || action.time < 0 || !Number.isFinite (action.duration) || action.duration < 1 || action.duration > 30 || action.time + action.duration > 3600) { throw new Error ('Invalid fold/unfold action keyframe.'); }
        ids.add (action.id); return { ...action };
    }).sort ((a, b) => a.time - b.time);
    const ends = new Map ();
    for (const action of actions) { if ((ends.get (action.objectId) ?? -1) > action.time + 1e-8) { throw new Error ('Fold actions for the same box must not overlap.'); } ends.set (action.objectId, action.time + action.duration); }
    return actions;
}
export function TimelineFoldSample (actions, objectId, time, base = 1, hold = true)
{
    let value = base; let result = null;
    for (const action of actions) {
        if (action.objectId !== objectId || action.time > time) { continue; }
        const target = action.direction === 'fold' ? 1 : action.direction === 'unfold' ? 0 : value > 1e-8 ? 0 : 1;
        const progress = Math.max (0, Math.min (1, (time - action.time) / action.duration));
        const motion = hold ? Math.max (0, Math.min (1, (progress - .15) / .7)) : progress;
        result = { action, progress, from : value, to : target, pose : value + (target - value) * motion, active : progress < 1 };
        value = target;
    }
    return result;
}
