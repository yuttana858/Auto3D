import { SimplifyPackedMesh } from './polygoncore.js';
self.onmessage = async (event) => {
    try { const result = await SimplifyPackedMesh (event.data.mesh, event.data.retain, event.data.error); self.postMessage ({ result }, [result.corners.buffer, result.materials.buffer]); }
    catch (error) { self.postMessage ({ error : error.message }); }
};
