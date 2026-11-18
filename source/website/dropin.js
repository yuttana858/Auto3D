import { Box3 } from 'three';
import { EaseSpan } from '../../modules/packaging/src/easing.js';

// Lowers newly added pieces into place from above, one after another, instead of having them appear.
// Pieces keep their saved placement; only their drawn position moves, so cancelling or failing leaves them in place.
const Rank = data => data?.position === 'bottom' ? 0 : data?.position === 'front' || data?.position === 'back' ? 1 : data?.kind === 'partition' ? 2 : data?.position === 'top' ? 3 : 2;

export function DropInPlan (items, { stepSeconds = 0.35, overlap = 0.45, maxSeconds = 1.8 } = {})
{
    const order = [...items].sort ((a, b) => Rank (a.data) - Rank (b.data) || a.minY - b.minY);
    if (!order.length) { return { seconds : 0, slots : [] }; }
    const step = Math.min (stepSeconds, maxSeconds / (1 + (order.length - 1) * (1 - overlap)));
    const seconds = step * (1 + (order.length - 1) * (1 - overlap));
    return { seconds, slots : order.map ((item, i) => ({ item, start : (i * step * (1 - overlap)) / seconds, end : (i * step * (1 - overlap) + step) / seconds })) };
}

export function DropIn (editor, objects, factor, { data = () => null, easing = 'smooth', clock = {} } = {})
{
    const meshes = objects.filter (object => object.threeObject?.position);
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const request = clock.request || globalThis.requestAnimationFrame, now = clock.now || (() => performance.now ());
    if (!meshes.length || reduced || typeof request !== 'function') { return Promise.resolve ({ animated : false }); }
    // Start just above the highest piece by a little more than the tallest one.
    const bounds = new Map (meshes.map (object => { const b = typeof object.threeObject.isObject3D === 'boolean' ? new Box3 ().setFromObject (object.threeObject, true) : null; return [object, b && !b.isEmpty () ? { minY : b.min.y, maxY : b.max.y } : { minY : object.position[1], maxY : object.position[1] }]; }));
    const box = object => bounds.get (object);
    const top = Math.max (...meshes.map (o => box (o).maxY)), lift = Math.max (40 / factor, (top - Math.min (...meshes.map (o => box (o).minY))) * 1.2);
    const plan = DropInPlan (meshes.map (object => ({ object, data : data (object), minY : box (object).minY })));
    const draw = progress => {
        for (const { item, start, end } of plan.slots) {
            const mesh = item.object.threeObject, fall = 1 - EaseSpan (progress, start, end, easing);
            mesh.position.set (item.object.position[0], item.object.position[1] + lift * fall, item.object.position[2]); mesh.visible = item.object.visible !== false && progress >= start; mesh.updateMatrixWorld?.(true);
        }
        editor.website.viewer?.Render?.();
    };
    editor.motionOverride = () => draw (0); draw (0);
    return new Promise (resolve => {
        const begin = now ();
        const tick = () => {
            const progress = Math.min (1, (now () - begin) / (plan.seconds * 1000));
            try { draw (progress); } catch { /* A rebuilt scene ends the drop; pieces are already at their saved placement. */ }
            if (progress < 1) { request (tick); } else { editor.motionOverride = null; resolve ({ animated : true, seconds : plan.seconds }); }
        };
        request (tick);
    });
}
