import { CreateRecoveryArchive } from './sessionrecoverypack.js';
let meshes = null;
self.onmessage = ({ data }) => {
    try { meshes = data.meshes || meshes; data.meshes = meshes; const archive = CreateRecoveryArchive (data); self.postMessage ({ archive }, [archive.buffer]); }
    catch (error) { self.postMessage ({ error : error.message }); }
};
