// Molded Pulp forming worker. The host posts { id, stage, triangles, draft, detail } and receives progress messages and a
// final plan whose typed arrays are transferred (not copied). Forming at fine/ultra detail runs here so the viewer stays
// responsive; the same HandlePulpJob function runs inline when workers are unavailable (tests, old browsers).
import { PlanPulp } from './plan.js';

export function HandlePulpJob (message, post = () => {})
{
    const { id, stage, triangles, draft, detail } = message;
    const plan = PlanPulp (stage, triangles, draft, { detail, onProgress : (phase, value) => post ({ id, progress : value, phase }) });
    const transfer = [];
    for (const component of plan.components) { for (const key of ['positions', 'normals', 'uvs', 'indices']) { transfer.push (component[key].buffer); } }
    return { message : { id, plan }, transfer };
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
    self.onmessage = event => {
        try { const { message, transfer } = HandlePulpJob (event.data, data => self.postMessage (data)); self.postMessage (message, transfer); }
        catch (error) { self.postMessage ({ id : event.data?.id, error : error.message }); }
    };
}
