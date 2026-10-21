import { TextureMap } from '../engine/model/material.js';
import { CloneSurface } from './scenedocument.js';
import { GenerateMissingBoxUVs } from './materialuv.js';
import { LoadPackagingModule } from './packagingadapter.js';
import { ValidateSurfaceRelief, ValidateSpotVarnish } from '../../modules/packaging/src/reliefsettings.js';
import { Base64DataURIToArrayBuffer } from '../engine/io/bufferutils.js';

export async function SampleImpressionMask (map, fitImage = true)
{
    if (!map?.buffer) { return null; }
    const image = await createImageBitmap (new Blob ([map.buffer], { type : map.mimeType }));
    try {
        if (image.width > 8192 || image.height > 8192) { throw new Error ('Impression images must be at most 8192 pixels.'); }
        const size = 512; const canvas = document.createElement ('canvas'); canvas.width = canvas.height = size;
        const context = canvas.getContext ('2d', { willReadFrequently : true }); const fit = Math.min (size / image.width, size / image.height);
        if (fitImage) { context.drawImage (image, (size - image.width * fit) / 2, (size - image.height * fit) / 2, image.width * fit, image.height * fit); }
        else { context.drawImage (image, 0, 0, size, size); }
        return { width : size, height : size, pixels : context.getImageData (0, 0, size, size).data };
    } finally { image.close (); }
}

function DecodeMaskMap (dataUri, name)
{
    if (typeof dataUri !== 'string' || dataUri.length > 12 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test (dataUri)) { throw new Error ('Use a base64 PNG, JPEG or WebP mask up to 8 MB.'); }
    const decoded = Base64DataURIToArrayBuffer (dataUri);
    if (decoded.buffer.byteLength > 8 * 1024 * 1024) { throw new Error ('Mask exceeds 8 MB.'); }
    return Object.assign (new TextureMap (), { name : name + '.' + decoded.mimeType.split ('/')[1], buffer : decoded.buffer, mimeType : decoded.mimeType });
}

export async function ApplySpotVarnish (panel, args)
{
    const { index, maskDataUri, ...options } = args; const entry = MaterialEntry (panel, index); const editor = RequireMaterialEdit (panel, entry);
    const settings = ValidateSpotVarnish ({ ...(entry.original.varnishSettings || {}), ...options });
    const maskMap = maskDataUri === undefined ? entry.original.varnishMaskMap : DecodeMaskMap (maskDataUri, 'spot-varnish-mask');
    if (settings.enabled && !maskMap) { throw new Error ('Choose a spot varnish mask.'); }
    const before = CloneSurface (entry.original); const doc = editor.document; const account = panel.website.auth.user.id;
    const uvBefore = CaptureUVs ([entry]);
    const roughness = entry.original.varnishSettings ? entry.original.varnishBaseRoughnessMap : entry.original.roughnessMap || entry.original.metalnessMap;
    const specular = entry.original.varnishSettings ? entry.original.varnishBaseSpecularMap : entry.original.specularMap;
    let applied = false; const apply = async (surface, uvs) => { Object.assign (entry.original, CloneSurface (surface)); RestoreUVs (uvs); await editor.Render (); editor.MarkDirty?.(); };
    editor.busy = true; editor.RefreshButtons?.(); editor.Status ('Building spot varnish mask…');
    try {
        const module = await LoadPackagingModule ();
        let maps = { roughnessMap : roughness, specularMap : specular };
        if (settings.enabled) {
            const mask = await panel.SampleImpressionMask (maskMap);
            const [baseRoughness, baseSpecular] = await Promise.all ([panel.SampleMappedSurface (roughness, roughness), panel.SampleMappedSurface (specular, roughness)]);
            const generated = module.GenerateSpotVarnish (settings, mask, baseRoughness, baseSpecular);
            maps = {};
            for (const key of ['roughnessMap', 'specularMap']) {
                const map = Object.assign (new TextureMap (), generated[key]);
                if (roughness) { map.offset = roughness.offset.Clone (); map.scale = roughness.scale.Clone (); map.rotation = roughness.rotation; }
                maps[key] = map;
            }
        }
        if (editor.document !== doc || panel.website.auth.user?.id !== account || panel.website.accountReady === false || editor.readOnly || !doc.model.materials.includes (entry.original)) { throw new Error ('The workspace or account changed during varnish generation.'); }
        applied = true; Object.assign (entry.original, maps, { varnishSettings : settings, varnishMaskMap : maskMap, varnishBaseRoughnessMap : roughness, varnishBaseSpecularMap : specular });
        if (settings.enabled) { GenerateMissingBoxUVs (panel.website.viewer, entry); }
        const after = CloneSurface (entry.original); const uvAfter = CaptureUVs ([entry]); await editor.Render ();
        if (editor.document !== doc || panel.website.auth.user?.id !== account || editor.readOnly) { throw new Error ('The workspace or account changed during varnish rendering.'); }
        editor.PushHistory (() => apply (before, uvBefore), () => apply (after, uvAfter)); editor.MarkDirty?.(); editor.Status ('Spot varnish applied · Undo available');
        return { index, settings : { ...settings }, mask : !!maskMap, geometryChanged : false };
    } catch (error) { if (applied && editor.document === doc) { await apply (before, uvBefore); } throw error; }
    finally { editor.busy = false; editor.RefreshButtons?.(); panel.Update (); }
}

export async function SampleMappedSurface (map, reference)
{
    const image = await SampleImpressionMask (map, false); if (!image || map === reference) { return image; }
    const pixels = new Uint8ClampedArray (image.pixels.length); const size = image.width;
    const ref = reference || new TextureMap (); if (!ref.scale.x || !ref.scale.y) { throw new Error ('Use nonzero roughness texture scale before applying varnish.'); }
    const cr = Math.cos (ref.rotation); const sr = Math.sin (ref.rotation); const cm = Math.cos (map.rotation); const sm = Math.sin (map.rotation);
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        const a = (x / size - ref.offset.x) / ref.scale.x; const b = (1 - y / size - ref.offset.y) / ref.scale.y;
        const u = cr * a - sr * b; const v = sr * a + cr * b;
        const mu = map.scale.x * (cm * u + sm * v) + map.offset.x; const mv = map.scale.y * (-sm * u + cm * v) + map.offset.y;
        const sx = Math.floor (((mu % 1 + 1) % 1) * size); const sy = Math.floor ((((1 - mv) % 1 + 1) % 1) * size);
        pixels.set (image.pixels.subarray ((sy * size + sx) * 4, (sy * size + sx + 1) * 4), (y * size + x) * 4);
    } }
    return { ...image, pixels };
}

export async function ApplySurfaceRelief (panel, args)
{
    const { index, maskDataUri, clearMask = false, ...options } = args;
    const entry = MaterialEntry (panel, index); const editor = RequireMaterialEdit (panel, entry);
    if (typeof clearMask !== 'boolean' || clearMask && maskDataUri !== undefined) { throw new Error ('Choose mask replacement or removal.'); }
    const settings = ValidateSurfaceRelief ({ ...(entry.original.surfaceRelief || {}), ...options, ...(clearMask && options.impression === undefined ? { impression : 'off' } : {}) });
    let maskMap = clearMask ? null : entry.original.impressionMap;
    if (maskDataUri !== undefined) {
        maskMap = DecodeMaskMap (maskDataUri, 'impression-mask');
    }
    if (settings.impression !== 'off' && !maskMap) { throw new Error ('Choose an impression mask before enabling emboss or deboss.'); }
    const doc = editor.document; const account = panel.website.auth.user.id;
    const before = CloneSurface (entry.original); const uvBefore = CaptureUVs ([entry]); let applied = false;
    const apply = async (surface, uvs) => { Object.assign (entry.original, CloneSurface (surface)); RestoreUVs (uvs); await editor.Render (); editor.MarkDirty?.(); };
    editor.busy = true; editor.RefreshButtons?.(); editor.Status ('Building corrugated surface and die impression…');
    try {
        const module = await LoadPackagingModule ();
        const mask = maskMap ? await panel.SampleImpressionMask (maskMap) : null;
        const generated = module.GenerateSurfaceRelief (settings, mask);
        if (editor.document !== doc || panel.website.auth.user?.id !== account || panel.website.accountReady === false || editor.readOnly || !doc.model.materials.includes (entry.original)) { throw new Error ('The workspace or account changed during relief generation.'); }
        const map = Object.assign (new TextureMap (), generated.map); const previous = entry.original.bumpMap;
        if (previous) { map.offset = previous.offset.Clone (); map.scale = previous.scale.Clone (); map.rotation = previous.rotation; }
        applied = true;
        Object.assign (entry.original, { bumpMap : map, impressionMap : maskMap, surfaceRelief : settings, reliefMode : 'bump', bumpScale : settings.strength, boardFluteLinked : false });
        GenerateMissingBoxUVs (panel.website.viewer, entry);
        const after = CloneSurface (entry.original); const uvAfter = CaptureUVs ([entry]); await editor.Render ();
        if (editor.document !== doc || panel.website.auth.user?.id !== account || panel.website.accountReady === false || editor.readOnly || !doc.model.materials.includes (entry.original)) { throw new Error ('The workspace or account changed during relief rendering.'); }
        editor.PushHistory (() => apply (before, uvBefore), () => apply (after, uvAfter)); editor.MarkDirty?.();
        editor.Status ('Surface relief applied · Undo available');
        return { index, settings : { ...settings }, mask : !!maskMap, resolution : 512, geometryChanged : false };
    } catch (error) { if (applied && editor.document === doc) { await apply (before, uvBefore); } throw error; }
    finally { editor.busy = false; editor.RefreshButtons?.(); panel.Update (); }
}

export const SurfaceTextureSlots = [['map', 'Base color', 'diffuseMap'], ['roughnessMap', 'Gloss / roughness', 'roughnessMap'], ['specularMap', 'Reflective', 'specularMap'], ['metalnessMap', 'Metalness', 'metalnessMap'], ['bumpMap', 'Bump', 'bumpMap'], ['normalMap', 'Normal', 'normalMap'], ['aoMap', 'Ambient occlusion', 'aoMap'], ['displacementMap', 'Height', 'displacementMap'], ['emissiveMap', 'Emission', 'emissiveMap']];
export function TextureForSlot (entry, key) { return (key === 'specularMap' && entry.material.isMeshPhysicalMaterial ? entry.material.specularColorMap : entry.material[key]) || (key === 'normalMap' ? entry.material.auto3dNormalMap : key === 'bumpMap' ? entry.material.auto3dBumpMap : null); }
export function OriginalTexture (entry, key) { return entry.original[key === 'map' ? 'diffuseMap' : key] || (key === 'roughnessMap' ? entry.original.metalnessMap : null); }
export function EffectiveReliefMode (mode, hasNormal, hasBump)
{
    if (mode === 'off') { return 'off'; }
    if (mode === 'bump') { return hasBump ? 'bump' : hasNormal ? 'normal' : 'off'; }
    return hasNormal ? 'normal' : hasBump ? 'bump' : 'off';
}

export function ApplyMaterialRelief (entry)
{
    const m = entry.material; m.auto3dNormalMap ||= m.normalMap; m.auto3dBumpMap ||= m.bumpMap;
    const mode = EffectiveReliefMode (entry.original.reliefMode, !!m.auto3dNormalMap, !!m.auto3dBumpMap);
    m.normalMap = mode === 'normal' ? m.auto3dNormalMap : null;
    m.bumpMap = mode === 'bump' ? m.auto3dBumpMap : null; m.needsUpdate = true;
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
