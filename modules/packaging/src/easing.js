// Ramp in/out curves shared by every automatic modelling motion (folds, packing, drops, arrays).
// Linear keeps constant speed; Smooth (default) eases in and out; Strong lingers longer at both ends.
export const MotionEasings = Object.freeze (['linear', 'smooth', 'strong']);
export const DefaultMotionEasing = 'smooth';

const clamp = value => Math.max (0, Math.min (1, value));

export function EaseMotion (progress, easing = DefaultMotionEasing)
{
    if (!Number.isFinite (progress)) { throw new Error ('Motion progress must be a finite number.'); }
    if (!MotionEasings.includes (easing)) { throw new Error ('Choose motion easing: ' + MotionEasings.join (', ') + '.'); }
    const t = clamp (progress);
    if (easing === 'linear') { return t; }
    // Smootherstep: zero speed and zero acceleration at both ends.
    if (easing === 'smooth') { return t * t * t * (t * (t * 6 - 15) + 10); }
    // Quintic in-out.
    return t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
}

// Progress of a motion that runs from start to end (fractions of a timeline), eased.
export function EaseSpan (progress, start, end, easing = DefaultMotionEasing)
{
    if (!(end > start)) { return progress >= end ? 1 : 0; }
    return EaseMotion ((progress - start) / (end - start), easing);
}
