import { TextureMap } from '../engine/model/material.js';
import { CloneSurface } from './scenedocument.js';
import { GenerateMissingBoxUVs } from './materialuv.js';
import { LoadPackagingModule } from './packagingadapter.js';

export const SurfaceTextureSlots = [['map', 'Base color', 'diffuseMap'], ['roughnessMap', 'Gloss / roughness', 'roughnessMap'], ['specularMap', 'Reflective', 'specularMap'], ['metalnessMap', 'Metalness', 'metalnessMap'], ['bumpMap', 'Bump', 'bumpMap'], ['normalMap', 'Normal', 'normalMap'], ['aoMap', 'Ambient occlusion', 'aoMap'], ['displacementMap', 'Height', 'displacementMap'], ['emissiveMap', 'Emission', 'emissiveMap']];
export function TextureForSlot (entry, key) { return (key === 'specularMap' && entry.material.isMeshPhysicalMaterial ? entry.material.specularColorMap : entry.material[key]) || (key === 'normalMap' ? entry.material.auto3dNormalMap : key === 'bumpMap' ? entry.material.auto3dBumpMap : null); }
export function OriginalTexture (entry, key) { return entry.original[key === 'map' ? 'diffuseMap' : key] || (key === 'roughnessMap' ? entry.original.metalnessMap : null); }
export function ApplyMaterialRelief (entry)
{
    const m = entry.material; m.auto3dNormalMap ||= m.normalMap; m.auto3dBumpMap ||= m.bumpMap;
    m.normalMap = entry.original.reliefMode === 'bump' || entry.original.reliefMode === 'off' ? null : m.auto3dNormalMap;
    m.bumpMap = entry.original.reliefMode === 'off' ? null : m.auto3dBumpMap; m.needsUpdate = true;
}
export function SetEmissionStrength (entry, value)
{
    if (!Number.isFinite (value) || value < 0 || value > 5) { throw new Error ('Emission strength must be between 0 and 5.'); }
    entry.original.emissiveIntensity = value; entry.material.emissiveIntensity = value;
}
export function MaterialEntry (panel, index)
{
    const entry = panel.AllEntries ().find (entry => entry.index === index); if (!entry) { throw new Error ('Material is not present in the scene.'); } return entry;
}
export function RequireMaterialEdit (panel, entry)
{
    const editor = panel.website.sessionEditor;
    if (!editor || editor.readOnly || editor.busy || !panel.website.auth?.user || panel.website.accountReady === false || entry && !editor.document.model.materials.includes (entry.original)) { throw new Error ('Sign in to an editable, idle workspace.'); }
    return editor;
}
export function CaptureUVs (entries)
{
    const meshes = new Set (entries.flatMap (entry => entry.meshes.map (item => item.mesh.userData.originalMeshInstance.GetMesh ())));
    return [...meshes].map (mesh => ({ mesh, uvs : mesh.uvs.map (uv => uv.Clone ()), triangles : mesh.triangles.map (t => [t.u0, t.u1, t.u2]) }));
}
export function RestoreUVs (snapshots) { for (const { mesh, uvs, triangles } of snapshots) { mesh.uvs = uvs.map (uv => uv.Clone ()); mesh.triangles.forEach ((t, i) => { [t.u0, t.u1, t.u2] = triangles[i]; }); } }
export async function SampleSurfaceImage (panel, entry)
{
    let image = TextureForSlot (entry, 'map')?.image; let decoded = null;
    if (!image && entry.original.diffuseMap?.buffer) { decoded = await createImageBitmap (new Blob ([entry.original.diffuseMap.buffer], { type : entry.original.diffuseMap.mimeType || 'image/png' })); image = decoded; }
    if (!image) { return null; }
    try {
        const width = 128; const height = 128; const canvas = document.createElement ('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext ('2d', { willReadFrequently : true }); context.drawImage (image, 0, 0, width, height); const rgba = context.getImageData (0, 0, width, height).data; const pixels = new Uint8Array (width * height * 3);
        for (let i = 0; i < width * height; i++) { pixels.set (rgba.subarray (i * 4, i * 4 + 3), i * 3); } return { width, height, pixels };
    } finally { decoded?.close (); }
}
export async function AutoGenerateTextures (panel, { index, objectId, overwrite = false } = {})
{
    if (typeof overwrite !== 'boolean') { throw new Error ('Overwrite must be a boolean.'); }
    const editor = RequireMaterialEdit (panel); const doc = editor.document; const account = panel.website.auth.user.id;
    if (index !== undefined && objectId !== undefined || index === undefined && objectId === undefined) { throw new Error ('Choose a material index or object ID.'); }
    let indices;
    if (index !== undefined) { if (!Number.isInteger (index) || index < 0) { throw new Error ('Choose a valid material index.'); } indices = [index]; }
    else { const object = doc.objects.find (item => item.id === objectId); if (!object) { throw new Error ('Object not found.'); } const set = new Set (); object.node.EnumerateMeshIndices (i => doc.model.GetMesh (i).triangles.forEach (t => set.add (t.mat))); indices = [...set]; }
    const entries = indices.map (i => MaterialEntry (panel, i)).filter (entry => Object.hasOwn (entry.original, 'diffuseMap'));
    if (!entries.length) { throw new Error ('Select a surface material.'); }
    const before = entries.map (entry => CloneSurface (entry.original)); const uvBefore = CaptureUVs (entries); const changes = [];
    editor.busy = true; editor.RefreshButtons?.(); editor.Status ('Generating surface texture maps…'); let applied = false;
    const apply = async (surfaces, uvs) => { entries.forEach ((entry, i) => Object.assign (entry.original, CloneSurface (surfaces[i]))); RestoreUVs (uvs); await editor.Render (); editor.MarkDirty?.(); };
    try {
        await new Promise (resolve => setTimeout (resolve, 20)); const module = await LoadPackagingModule ();
        for (const entry of entries) {
            const sampled = await panel.SampleSurfaceImage (entry); const maps = module.GenerateSurfaceTextureSet (sampled || module.ProceduralSurfacePixels (), 'surface-' + entry.index);
            const updates = {};
            for (const [key, map] of Object.entries (maps)) {
                if (key === 'diffuseMap' && entry.original.diffuseMap || !overwrite && (entry.original[key] || key === 'roughnessMap' && entry.original.metalnessMap)) { continue; }
                const previous = entry.original[key] || entry.original.diffuseMap; const next = Object.assign (new TextureMap (), map);
                if (previous) { next.offset = previous.offset.Clone (); next.scale = previous.scale.Clone (); next.rotation = previous.rotation; } updates[key] = next;
            }
            changes.push ({ entry, updates });
        }
        if (editor.document !== doc || panel.website.auth.user?.id !== account || panel.website.accountReady === false || editor.readOnly || entries.some (entry => !doc.model.materials.includes (entry.original))) { throw new Error ('The workspace or account changed during texture generation.'); }
        if (!changes.some (item => Object.keys (item.updates).length)) { editor.Status ('Surface maps are already assigned. Use Regenerate maps to rebuild auxiliary maps.'); return { generated : false, materials : indices, maps : [], reason : 'Surface maps are already assigned.' }; }
        applied = true;
        for (const { entry, updates } of changes) { Object.assign (entry.original, updates); if (updates.diffuseMap) { entry.original.multiplyDiffuseMap = true; } GenerateMissingBoxUVs (panel.website.viewer, entry); }
        const after = entries.map (entry => CloneSurface (entry.original)); const uvAfter = CaptureUVs (entries); await editor.Render ();
        editor.history.Push ({ undo : () => apply (before, uvBefore), redo : () => apply (after, uvAfter) }); editor.MarkDirty?.();
        const result = { generated : true, materials : indices, maps : changes.map (item => ({ index : item.entry.index, slots : Object.keys (item.updates) })), source : 'local surface derivation', resolution : 128 }; editor.Status ('Surface textures generated · Undo available'); return result;
    } catch (error) { if (applied && editor.document === doc) { await apply (before, uvBefore); } throw error; }
    finally { editor.busy = false; editor.RefreshButtons?.(); panel.Update (); }
}
