// Discrete visibility keys are independent of the object's saved editor visibility.
export function ValidateVisibilityKeys (keys)
{
    if (!Array.isArray (keys) || keys.length > 1000) { throw new Error ('Use up to 1,000 visibility keyframes.'); }
    const seen = new Set (), ids = new Set ();
    return keys.map (key => {
        if (!key || typeof key.id !== 'string' || !key.id || key.id.length > 128 || !Number.isFinite (key.time) || key.time < 0 || key.time > 3600 || typeof key.visible !== 'boolean' || seen.has (key.time) || ids.has (key.id)) { throw new Error ('Invalid visibility keyframe.'); }
        seen.add (key.time); ids.add (key.id); return { id : key.id, time : key.time, visible : key.visible };
    }).sort ((a, b) => a.time - b.time);
}
export function VisibilityAt (object, time)
{
    const keys = object.visibilityKeys || []; let value = object.visible !== false;
    for (const key of keys) { if (key.time > time) { break; } value = key.visible; }
    return value;
}
