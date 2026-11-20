import { EvaluateStudio } from './kernel.js';

const wasmUrl = new URL ('./manifold.wasm', import.meta.url);
wasmUrl.search = new URL (import.meta.url).search;

/** Worker protocol is deliberately independent from the host scene. */
export async function HandleStudioJob (message, post, evaluate = EvaluateStudio)
{
    const id = message && message.id;
    let response;
    let transfer = [];
    try {
        if (!Number.isSafeInteger (id) || id < 1 || message.type !== 'evaluate') {
            throw new Error ('Invalid 3Dstudio worker request.');
        }
        const result = await evaluate (message.definition, { wasmUrl: wasmUrl.href });
        response = { id, result };
        transfer = [...new Set ([result.positions.buffer, result.normals.buffer, result.indices.buffer, result.materialIndices.buffer])];
    } catch (error) {
        response = { id, error: String (error && error.message ? error.message : error).slice (0, 500) };
    }
    if (post) {
        post (response, transfer);
    }
    return { message: response, transfer };
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof window === 'undefined') {
    self.onmessage = (event) => HandleStudioJob (event.data, (message, transfer) => self.postMessage (message, transfer));
}
