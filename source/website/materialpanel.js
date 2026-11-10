import * as THREE from 'three';
import { WorkspaceDialog } from './modellibrary.js';
import { SetEmissionStrength, CaptureUVs, RestoreUVs, SurfaceTextureSlots, TextureForSlot, OriginalTexture, ApplyMaterialRelief, EffectiveReliefMode, MaterialEntry, RequireMaterialEdit, SampleSurfaceImage, AutoGenerateTextures } from './materialtextures.js';
import { CloneSurface } from './scenedocument.js';
import { TextureMap } from '../engine/model/material.js';
import { HexStringToRGBColor } from '../engine/model/color.js';
import { GenerateMissingBoxUVs } from './materialuv.js';
import { SetMaterialReflectionStrength } from '../engine/viewer/materialreflection.js';
import { ApplySurfaceRelief, SampleImpressionMask, ApplySpotVarnish, SampleMappedSurface } from './materialtextures.js';
import { SurfaceReliefDefaults, SpotVarnishDefaults } from '../../modules/packaging/src/reliefsettings.js';

const TextureSlots = SurfaceTextureSlots;

export function GetAssignedTextureSlots (entry)
{
    return TextureSlots.filter ((slot) => TextureForSlot (entry, slot[0])?.image).map ((slot) => ({
        key : slot[0], title : slot[1], texture : TextureForSlot (entry, slot[0]),
        name : OriginalTexture (entry, slot[0])?.name || TextureForSlot (entry, slot[0]).name || slot[1]
    }));
}

export function DrawTextureThumbnail (canvas, image)
{
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) { return; }
    const context = canvas.getContext ('2d');
    const scale = Math.min (canvas.width / width, canvas.height / height);
    let source = image;
    if (image.data) {
        source = document.createElement ('canvas');
        source.width = width; source.height = height;
        const pixels = new ImageData (width, height);
        pixels.data.set (image.data);
        source.getContext ('2d').putImageData (pixels, 0, 0);
    }
    context.drawImage (source, (canvas.width - width * scale) / 2, (canvas.height - height * scale) / 2, width * scale, height * scale);
}

export function PreserveTextureMapping (previous, texture, original)
{
    if (previous) {
        for (const key of ['offset', 'repeat', 'center']) {
            texture[key].copy (previous[key]);
        }
        for (const key of ['rotation', 'wrapS', 'wrapT', 'flipY', 'channel', 'matrixAutoUpdate']) {
            texture[key] = previous[key];
        }
        texture.matrix.copy (previous.matrix);
    }
    original.offset.x = texture.offset.x; original.offset.y = texture.offset.y;
    original.scale.x = texture.repeat.x; original.scale.y = texture.repeat.y;
    original.rotation = texture.rotation;
}

export function GetMaterialEntries (viewer, model, selectedId)
{
    const entries = new Map ();
    viewer.mainModel.EnumerateMeshes ((mesh) => {
        if (selectedId !== null && !mesh.userData.originalMeshInstance.id.IsEqual (selectedId)) { return; }
        const materials = mesh.userData.threeMaterials || mesh.material;
        materials.forEach ((material, slot) => {
            if (!entries.has (material)) {
                const index = mesh.userData.originalMaterials[slot];
                entries.set (material, { material, original : model.GetMaterial (index), index, meshes : [] });
            }
            entries.get (material).meshes.push ({ mesh, slot });
        });
    });
    return Array.from (entries.values ());
}

export function EnumerateUVTriangles (mesh, slot, callback)
{
    const geometry = mesh.geometry;
    const uv = geometry.getAttribute ('uv');
    if (!uv) { return 0; }
    const index = geometry.index;
    const groups = geometry.groups.length ? geometry.groups.filter ((group) => group.materialIndex === slot) : [{ start : 0, count : index ? index.count : uv.count }];
    let count = 0;
    for (const group of groups) {
        const end = Math.min (group.start + group.count, index ? index.count : uv.count);
        for (let i = group.start; i + 2 < end; i += 3) {
            callback ([0, 1, 2].map ((offset) => {
                const vertex = index ? index.getX (i + offset) : i + offset;
                return [uv.getX (vertex), uv.getY (vertex)];
            }));
            count++;
        }
    }
    return count;
}

export class MaterialPanel
{
    constructor (website)
    {
        this.website = website;
        this.entries = [];
        this.active = 0;
        this.open = false;
        this.page = 'surface';
        this.mapSlot = 'map';
        this.textureRequest = 0;
        this.editorTextures = new Set ();
        this.emphasisState = new Map ();
        this.flashTimers = new Map ();
        this.drawer = document.getElementById ('material_drawer');
        this.section = document.getElementById ('materials_section');
        this.section.innerHTML = '<summary>Materials</summary><div class="section_content"><p id="material_context" class="section_hint"></p><div id="material_list"></div><button class="section_button" id="material_advance" disabled>Advance material editor</button></div>';
        document.getElementById ('material_advance').addEventListener ('click', () => this.Open ());
        document.getElementById ('material_drawer_close').addEventListener ('click', () => this.Close ());
        document.addEventListener ('keydown', (event) => {
            if (event.key === 'Escape' && this.open && !document.querySelector ('dialog[open]')) { this.Close (); }
        });
        this.Update ();
    }

    Clear ()
    {
        ++this.textureRequest;
        for (const timer of this.flashTimers.values ()) { clearTimeout (timer); }
        this.flashTimers.clear (); this.emphasisState.clear ();
        this.textureDialog?.close ();
        for (const texture of this.editorTextures) { texture.dispose (); }
        this.editorTextures.clear ();
        this.open = false;
        this.drawer.classList.remove ('open');
        this.drawer.inert = true;
        this.entries = [];
        document.getElementById ('material_drawer_content').replaceChildren ();
        this.ShowSummary ();
    }

    Update ()
    {
        const model = this.website.model;
        const selected = this.website.navigator.GetSelectedMeshId ();
        if (this.textureDialog?.open && this.previewEntry && (!model || !GetMaterialEntries (this.website.viewer, model, null).some (entry => entry.material === this.previewEntry))) { this.textureDialog.close (); }
        this.entries = model ? GetMaterialEntries (this.website.viewer, model, selected) : [];
        this.active = Math.min (this.active, Math.max (0, this.entries.length - 1));
        this.ShowSummary ();
        if (this.open) {
            this.website.viewer.SetMeshesHighlight (this.website.highlightColor, () => false);
            this.FillDrawer ();
        }
    }

    CaptureMaterialState (entry)
    {
        const material = entry.material;
        const original = entry.original;
        return {
            material : {
                color : material.color?.getHexString?.() || null,
                emissive : material.emissive?.getHexString?.() || null,
                emissiveIntensity : material.emissiveIntensity,
                opacity : material.opacity,
                transparent : material.transparent,
                roughness : material.roughness,
                metalness : material.metalness,
                specularIntensity : material.specularIntensity, transmission : material.transmission, ior : material.ior, thickness : material.thickness,
                specular : material.specular?.getHexString?.() || null,
                shininess : material.shininess,
                bumpScale : material.bumpScale,
                normalScale : material.normalScale?.x,
                aoMapIntensity : material.aoMapIntensity,
                displacementScale : material.displacementScale,
                side : material.side
            },
            mapping : Object.fromEntries (TextureSlots.filter (slot => OriginalTexture (entry, slot[0])).map (slot => { const t = OriginalTexture (entry, slot[0]); return [slot[0], { offset : { ...t.offset }, scale : { ...t.scale }, rotation : t.rotation }]; })),
            original : {
                color : original.color ? { r : original.color.r, g : original.color.g, b : original.color.b } : null,
                emissiveIntensity : original.emissiveIntensity,
                opacity : original.opacity,
                transparent : original.transparent,
                roughness : original.roughness,
                metalness : original.metalness,
                specularIntensity : original.specularIntensity, transmission : original.transmission, ior : original.ior, thickness : original.thickness,
                specular : original.specular ? { r : original.specular.r, g : original.specular.g, b : original.specular.b } : null,
                shininess : original.shininess,
                bumpScale : original.bumpScale,
                normalScale : original.normalScale,
                reliefMode : original.reliefMode,
                aoIntensity : original.aoIntensity,
                displacementScale : original.displacementScale,
                doubleSided : original.doubleSided,
                multiplyDiffuseMap : original.multiplyDiffuseMap
            }
        };
    }

    RestoreMaterialState (entry, state)
    {
        entry = this.Entry (entry.index);
        const material = entry.material;
        const m = state.material;
        if (m.color !== null && material.color) { material.color.set ('#' + m.color); }
        if (m.emissive !== null && material.emissive) { material.emissive.set ('#' + m.emissive); }
        for (const key of ['emissiveIntensity', 'opacity', 'roughness', 'metalness', 'specularIntensity', 'transmission', 'ior', 'thickness', 'shininess', 'bumpScale', 'aoMapIntensity', 'displacementScale', 'side']) {
            if (m[key] !== undefined) { material[key] = m[key]; }
        }
        if (m.specular !== null && material.specular) { material.specular.set ('#' + m.specular); }
        if (m.normalScale !== undefined && material.normalScale) { material.normalScale.setScalar (m.normalScale); }
        material.transparent = m.transparent;
        const original = state.original;
        if (original.color && entry.original.color) { Object.assign (entry.original.color, original.color); }
        for (const key of ['emissiveIntensity', 'opacity', 'transparent', 'roughness', 'metalness', 'specularIntensity', 'transmission', 'ior', 'thickness', 'shininess', 'bumpScale', 'normalScale', 'reliefMode', 'aoIntensity', 'displacementScale', 'doubleSided', 'multiplyDiffuseMap']) {
            if (original[key] !== undefined) { entry.original[key] = original[key]; }
        }
        if (original.specular && entry.original.specular) { Object.assign (entry.original.specular, original.specular); }
        ApplyMaterialRelief (entry);
        SetMaterialReflectionStrength (material, material.isMeshPhysicalMaterial ? material.specularIntensity : Math.max (material.specular.r, material.specular.g, material.specular.b));
        for (const [key, mapping] of Object.entries (state.mapping || {})) {
            const texture = TextureForSlot (entry, key); const originalMap = OriginalTexture (entry, key);
            if (!texture || !originalMap) { continue; }
            Object.assign (originalMap.offset, mapping.offset); Object.assign (originalMap.scale, mapping.scale); originalMap.rotation = mapping.rotation;
            texture.offset.set (mapping.offset.x, mapping.offset.y); texture.repeat.set (mapping.scale.x, mapping.scale.y); texture.rotation = mapping.rotation; texture.updateMatrix ();
        }
        material.needsUpdate = true;
        this.ShowSummary (); if (this.open) { this.FillDrawer (); } this.website.viewer.Render ();
        this.website.sessionEditor?.MarkDirty ();
    }

    Emphasize (entry, strength = 0.35)
    {
        const material = entry?.material;
        if (!material?.emissive) { return; }
        if (!this.emphasisState.has (material)) {
            this.emphasisState.set (material, { emissive : material.emissive.clone (), intensity : material.emissiveIntensity });
        }
        material.emissive.set (0xffffff);
        material.emissiveIntensity = strength;
        material.needsUpdate = true;
        this.website.viewer.Render ();
    }

    ClearEmphasis (entry)
    {
        const material = entry?.material; const state = this.emphasisState.get (material);
        if (!material || !state) { return; }
        material.emissive.copy (state.emissive);
        material.emissiveIntensity = state.intensity;
        material.needsUpdate = true;
        this.emphasisState.delete (material);
        this.website.viewer.Render ();
    }

    Flash (entry)
    {
        const material = entry?.material;
        if (!material) { return; }
        const previous = this.flashTimers.get (material);
        if (previous) { clearTimeout (previous); }
        this.Emphasize (entry, 1.0);
        this.flashTimers.set (material, setTimeout (() => {
            this.flashTimers.delete (material);
            this.ClearEmphasis (entry);
        }, 180));
    }

    FlashMaterialIndex (materialIndex)
    {
        const entry = this.entries.find ((item) => item.index === materialIndex) || GetMaterialEntries (this.website.viewer, this.website.model, null).find ((item) => item.index === materialIndex);
        if (entry) { this.Flash (entry); }
    }

    RenameMaterial (entry)
    {
        const previous = entry.original.name || 'Material ' + (entry.index + 1);
        const value = window.prompt ('Rename material', previous);
        if (value === null) { return; }
        const next = value.trim ().slice (0, 100);
        if (!next || next === previous) { return; }
        const apply = (name) => {
            entry.original.name = name;
            entry.material.name = name;
            this.ShowSummary ();
            if (this.open) { this.FillDrawer (); }
            this.website.sessionEditor?.MarkDirty ();
        };
        apply (next);
        this.website.sessionEditor?.PushHistory (() => apply (previous), () => apply (next));
    }

    ShowSummary ()
    {
        document.getElementById ('material_context').textContent = this.entries.length ? (this.website.navigator.GetSelectedMeshId () ? 'Selected part' : 'Whole model') + ' · ' + this.entries.length + ' material(s)' : 'Load a model, then select a part to inspect its materials.';
        const list = document.getElementById ('material_list');
        list.replaceChildren ();
        this.entries.forEach ((entry, index) => {
            const button = document.createElement ('button');
            button.className = 'material_card';
            const image = entry.material.map && entry.material.map.image;
            const swatch = document.createElement (image ? 'canvas' : 'span');
            swatch.className = 'material_swatch';
            swatch.style.backgroundColor = '#' + entry.material.color.getHexString ();
            if (image) { swatch.width = 22; swatch.height = 22; DrawTextureThumbnail (swatch, image); }
            const text = document.createElement ('span'); text.className = 'material_card_text';
            const name = document.createElement ('span'); name.className = 'material_name editable_name'; name.textContent = entry.original.name || 'Material ' + (entry.index + 1); name.title = 'Click to rename material';
            const maps = TextureSlots.filter ((slot) => TextureForSlot (entry, slot[0]));
            const detail = document.createElement ('span'); detail.className = 'material_map_summary'; detail.textContent = ' · ' + (maps.length ? maps.map ((slot) => slot[1]).join (', ') : 'Solid color · no texture');
            text.append (name, detail);
            button.append (swatch, text);
            button.addEventListener ('mouseenter', () => this.Emphasize (entry, 0.32));
            button.addEventListener ('mouseleave', () => { if (!this.flashTimers.has (entry.material)) { this.ClearEmphasis (entry); } });
            name.addEventListener ('click', (event) => { event.stopPropagation (); this.ClearEmphasis (entry); this.RenameMaterial (entry); });
            button.addEventListener ('click', () => { this.active = index; this.Flash (entry); this.Open (); });
            list.appendChild (button);
        });
        document.getElementById ('material_advance').disabled = !this.entries.length;
    }

    Open ()
    {
        if (!this.entries.length) { return; }
        this.website.sessionEditor?.ShowAdvanceAnimation (false);
        this.open = true;
        this.drawer.inert = false;
        this.drawer.classList.add ('open');
        this.website.viewer.SetMeshesHighlight (this.website.highlightColor, () => false);
        this.FillDrawer ();
        if (window.innerWidth < 800 && !this.website.parameters.leftContainerDiv.classList.contains ('collapsed')) {
            document.getElementById ('upload_panel_toggle').click ();
        }
        this.website.layouter.Resize ();
        requestAnimationFrame (() => document.getElementById ('material_drawer_close').focus ());
    }

    Close ()
    {
        this.open = false;
        this.drawer.classList.remove ('open');
        this.drawer.inert = true;
        this.website.layouter.Resize ();
        this.website.UpdateMeshesSelection ();
        document.getElementById ('material_advance').focus ();
    }

    FillDrawer ()
    {
        const content = document.getElementById ('material_drawer_content');
        content.replaceChildren ();
        if (!this.entries.length) {
            content.textContent = 'No surface material on this selection.';
            return;
        }
        const entry = this.entries[this.active];
        const material = entry.material;
        const contextLabel = document.getElementById ('material_drawer_context');
        contextLabel.replaceChildren ();
        const select = document.createElement ('select');
        select.setAttribute ('aria-label', 'Material');
        this.entries.forEach ((item, index) => select.add (new Option (item.original.name || 'Material ' + (item.index + 1), index)));
        select.value = this.active;
        select.addEventListener ('change', () => { this.active = Number (select.value); this.Flash (this.entries[this.active]); this.FillDrawer (); });
        contextLabel.appendChild (select);
        content.setAttribute ('aria-label', 'Surface and textures');
        this.ShowSurfaceTools (content, entry);
        const properties = this.Column (content, 'Surface');
        properties.classList.add ('surface_controls');
        this.Control (properties, 'Base color', 'color', '#' + material.color.getHexString (), {}, (value) => {
            material.color.set (value);
            entry.original.color = HexStringToRGBColor (value.substring (1));
            entry.original.multiplyDiffuseMap = true;
            this.ShowSummary ();
        });
        this.Control (properties, 'Opacity', 'range', material.opacity, { min : 0, max : 1, step : 0.01 }, (value) => {
            material.opacity = Number (value);
            material.transparent = material.opacity < 1;
            entry.original.opacity = material.opacity;
            entry.original.transparent = material.transparent;
        });
        const physical = material.isMeshStandardMaterial;
        this.Control (properties, 'Glossy', 'range', physical ? 1 - material.roughness : material.shininess / 100, { min : 0, max : 1, step : 0.01 }, (value) => {
            if (physical) {
                material.roughness = 1 - Number (value);
                entry.original.roughness = material.roughness;
                this.SyncValue ('Roughness', material.roughness);
            } else {
                material.shininess = Number (value) * 100;
                entry.original.shininess = Number (value);
            }
        });
        if (physical) {
            this.Control (properties, 'Roughness', 'range', material.roughness, { min : 0, max : 1, step : 0.01 }, (value) => {
                material.roughness = Number (value); entry.original.roughness = material.roughness;
                this.SyncValue ('Glossy', 1 - material.roughness);
            });
            this.Control (properties, 'Metalness', 'range', material.metalness, { min : 0, max : 1, step : 0.01 }, (value) => {
                material.metalness = Number (value); entry.original.metalness = material.metalness;
            });
        }
        if (physical) {
            for (const [key, title, min, max, step] of [['transmission', 'Transmission', 0, 1, .01], ['ior', 'Index of refraction', 1, 3, .01], ['thickness', 'Optical thickness (scene units)', 0, 1e6, .01]]) {
                this.Control (properties, title, key === 'transmission' ? 'range' : 'number', material[key], { min, max, step }, value => {
                    const n = Number (value); if (!Number.isFinite (n) || n < min || n > max) { return; }
                    material[key] = n; entry.original[key] = n; material.needsUpdate = true;
                });
            }
        }
        this.Control (properties, 'Reflective', 'range', physical ? material.specularIntensity : Math.max (material.specular.r, material.specular.g, material.specular.b), { min : 0, max : 1, step : 0.01 }, (value) => {
            const strength = Number (value);
            SetMaterialReflectionStrength (material, strength);
            if (physical) { material.specularIntensity = strength; entry.original.specularIntensity = strength; }
            else {
                material.specular.setRGB (strength, strength, strength);
                entry.original.specular = HexStringToRGBColor (material.specular.getHexString ());
            }
        });
        const activeRelief = EffectiveReliefMode (entry.original.reliefMode, !!TextureForSlot (entry, 'normalMap'), !!TextureForSlot (entry, 'bumpMap'));
        for (const [key, originalKey, title, map, max] of [
            ['bumpScale', 'bumpScale', 'Bump', 'bumpMap', 2],
            ['normalScale', 'normalScale', 'Normal strength', 'normalMap', 2],
            ['aoMapIntensity', 'aoIntensity', 'AO intensity', 'aoMap', 1]
        ]) {
            const value = key === 'normalScale' ? material.normalScale.x : material[key];
            this.Control (properties, title, 'range', value, { min : 0, max, step : 0.01, disabled : !TextureForSlot (entry, map) || (map === 'bumpMap' && activeRelief !== 'bump') || (map === 'normalMap' && activeRelief !== 'normal') }, (value) => {
                if (key === 'normalScale') { material.normalScale.setScalar (Number (value)); }
                else { material[key] = Number (value); }
                entry.original[originalKey] = Number (value);
            });
        }
        if (material.emissiveMap) { this.Control (properties, 'Emission', 'range', material.emissiveIntensity, { min : 0, max : 5, step : 0.01 }, value => SetEmissionStrength (entry, Number (value))); }
        this.Control (properties, 'Double sided', 'checkbox', material.side === THREE.DoubleSide, {}, (value) => {
            material.side = value ? THREE.DoubleSide : THREE.FrontSide; entry.original.doubleSided = value;
        });
        this.ShowSurfaceMapCards (content, entry, properties);
        if (this.website.primaryProductsPanel) {
            const artwork = document.createElement ('div'); artwork.className = 'primary_artwork_mount'; content.querySelector ('.surface_map_cards').prepend (artwork);
            this.website.primaryProductsPanel.MountArtwork (artwork).then (mounted => { if (!mounted) { artwork.remove (); } }).catch (error => { if (artwork.isConnected) { artwork.textContent = error.message; } });
        }
        return;
    }

    ShowUV (content, entry)
    {
        const uvColumn = this.Column (content, 'UV layout');
        uvColumn.classList.add ('uv_column');
        const canvas = document.createElement ('canvas');
        canvas.width = 300;
        canvas.height = 300;
        canvas.className = 'uv_preview';
        canvas.setAttribute ('aria-label', 'Geometry UV triangle layout');
        uvColumn.appendChild (canvas);
        const context = canvas.getContext ('2d');
        context.fillStyle = '#171b20';
        context.fillRect (0, 0, 300, 300);
        const bounds = { minU : 0, minV : 0, maxU : 1, maxV : 1 };
        const previewTriangles = [];
        let triangles = 0;
        for (const { mesh, slot } of entry.meshes) {
            triangles += EnumerateUVTriangles (mesh, slot, (points) => {
                for (const [u, v] of points) {
                    bounds.minU = Math.min (bounds.minU, u); bounds.maxU = Math.max (bounds.maxU, u);
                    bounds.minV = Math.min (bounds.minV, v); bounds.maxV = Math.max (bounds.maxV, v);
                }
                if (previewTriangles.length < 10000) { previewTriangles.push (points); }
            });
        }
        const span = Math.max (bounds.maxU - bounds.minU, bounds.maxV - bounds.minV);
        const centerU = (bounds.minU + bounds.maxU) / 2;
        const centerV = (bounds.minV + bounds.maxV) / 2;
        const toX = (u) => 150 + (u - centerU) / span * 276;
        const toY = (v) => 150 - (v - centerV) / span * 276;
        context.strokeStyle = '#343b44';
        const step = Math.max (0.1, Math.ceil (span) / 10);
        for (let n = Math.floor ((centerU - span / 2) / step) * step; n <= centerU + span / 2; n += step) {
            context.beginPath ();
            context.moveTo (toX (n), 0); context.lineTo (toX (n), 300);
            context.stroke ();
        }
        for (let n = Math.floor ((centerV - span / 2) / step) * step; n <= centerV + span / 2; n += step) {
            context.beginPath ();
            context.moveTo (0, toY (n)); context.lineTo (300, toY (n));
            context.stroke ();
        }
        context.strokeStyle = '#68717a';
        context.strokeRect (toX (0), toY (1), 276 / span, 276 / span);
        context.strokeStyle = '#91c8f0';
        for (const points of previewTriangles) {
            context.beginPath ();
            points.forEach ((point, index) => {
                if (index === 0) { context.moveTo (toX (point[0]), toY (point[1])); }
                else { context.lineTo (toX (point[0]), toY (point[1])); }
            });
            context.closePath ();
            context.stroke ();
        }
        const uvDetails = document.createElement ('div');
        uvColumn.appendChild (uvDetails);
        this.Text (uvDetails, triangles ? 'UV0 · ' + triangles.toLocaleString () + ' triangles · U ' + bounds.minU.toFixed (2) + '–' + bounds.maxU.toFixed (2) + ' · V ' + bounds.minV.toFixed (2) + '–' + bounds.maxV.toFixed (2) + '. Grey outline: 0–1 tile.' + (triangles > 10000 ? ' Preview: first 10,000 triangles.' : '') : 'No UV coordinates in this geometry. Texture mapping requires UVs.');
        const generate = document.createElement ('button');
        generate.className = 'section_button';
        generate.textContent = 'Generate box UVs';
        generate.disabled = !entry.meshes.some ((item) => item.mesh.userData.originalMeshInstance.TextureUVCount () === 0);
        generate.disabled ||= this.website.sessionEditor.readOnly || this.website.sessionEditor.busy;
        generate.addEventListener ('click', () => this.website.sessionEditor.Run (() => this.GenerateUVs (entry.index)));
        uvDetails.appendChild (generate);
        this.Text (uvDetails, 'Fills missing UVs only. Box projection is a starting point; seams can remain.');
    }

    AllEntries () { return GetMaterialEntries (this.website.viewer, this.website.sessionEditor.document.model, null); }
    Entry (index) { return MaterialEntry (this, index); }
    SampleSurfaceImage (entry) { return SampleSurfaceImage (this, entry); }
    GenerateTextures (args) { return AutoGenerateTextures (this, args); }
    ApplySurfaceRelief (args) { return ApplySurfaceRelief (this, args); }
    SampleImpressionMask (map) { return SampleImpressionMask (map); }
    SampleMappedSurface (map, reference) { return SampleMappedSurface (map, reference); }
    ApplySpotVarnish (args) { return ApplySpotVarnish (this, args); }

    ShowSurfaceTools (parent, entry)
    {
        const tools = document.createElement ('div'); tools.className = 'surface_tools'; parent.appendChild (tools);
        const generate = document.createElement ('button'); generate.className = 'section_button'; generate.textContent = 'Auto texture generator';
        generate.title = 'Derive missing 128 × 128 surface maps locally; preserve existing images.';
        const regenerateLabel = document.createElement ('label'); const regenerate = document.createElement ('input'); regenerate.type = 'checkbox'; regenerate.setAttribute ('aria-label', 'Regenerate auxiliary maps'); regenerateLabel.append (regenerate, document.createTextNode ('Regenerate maps'));
        generate.addEventListener ('click', () => this.website.sessionEditor.Run (() => this.GenerateTextures ({ index : entry.index, overwrite : regenerate.checked })));
        const relief = document.createElement ('select'); relief.setAttribute ('aria-label', 'Surface relief');
        for (const [mode, title] of [['normal', 'Normal relief'], ['bump', 'Bump relief'], ['off', 'Relief off']]) { relief.add (new Option (title, mode)); }
        relief.value = entry.original.reliefMode || 'normal';
        relief.title = 'Normal and bump maps are alternate surface-relief techniques; select Bump relief to edit bump strength. When no normal map exists, bump is used automatically.';
        relief.addEventListener ('change', () => this.website.sessionEditor.Run (() => this.SetRelief (entry.index, relief.value)));
        let count = 0; for (const { mesh, slot } of entry.meshes) { count += EnumerateUVTriangles (mesh, slot, () => {}); }
        const uv = document.createElement ('button'); uv.className = 'surface_uv_info'; uv.textContent = count ? 'UV0 · ' + count.toLocaleString () + ' triangles' : 'UV0 · none'; uv.title = 'View UV layout';
        uv.addEventListener ('click', () => this.OpenUVPreview (entry.index)); tools.append (generate, regenerateLabel, relief, uv);
        const editor = this.website.sessionEditor; regenerate.disabled = generate.disabled = relief.disabled = editor.readOnly || editor.busy || !this.website.auth?.user;
    }

    ShowVarnishDesigner (parent, entry)
    {
        const details = document.createElement ('details'); details.className = 'surface_relief_designer surface_varnish_designer';
        const summary = document.createElement ('summary'); summary.textContent = 'Gloss / reflective · Spot varnish mask'; details.appendChild (summary);
        const hint = document.createElement ('p'); hint.className = 'section_hint'; hint.textContent = 'Mask gloss and reflectivity without changing ink, relief or CAD. Transparent areas keep the underlying finish. Settings follow the roughness texture UV tile.'; details.appendChild (hint);
        const fields = document.createElement ('div'); fields.className = 'surface_relief_fields'; details.appendChild (fields);
        const settings = { ...SpotVarnishDefaults, ...(entry.original.varnishSettings || {}) }; const inputs = {};
        for (const [key, title, minimum] of [['gloss', 'Varnish gloss', 0], ['reflectivity', 'Varnish reflectivity', 0], ['maskScale', 'Varnish mask size', 0.1], ['maskU', 'Varnish horizontal position', 0], ['maskV', 'Varnish vertical position', 0]]) {
            const label = document.createElement ('label'); label.textContent = title;
            const input = document.createElement ('input'); input.type = 'number'; input.min = minimum; input.max = 1; input.step = 0.05; input.value = settings[key]; input.setAttribute ('aria-label', title); label.appendChild (input); fields.appendChild (label); inputs[key] = input;
        }
        const polarity = document.createElement ('select'); polarity.setAttribute ('aria-label', 'Varnish mask areas'); polarity.add (new Option ('Light areas', 'light')); polarity.add (new Option ('Dark areas', 'dark')); polarity.value = settings.polarity; fields.appendChild (polarity);
        const fileLabel = document.createElement ('label'); fileLabel.textContent = entry.original.varnishMaskMap ? 'Replace saved varnish mask' : 'Varnish mask (PNG / JPEG / WebP)';
        const file = document.createElement ('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.setAttribute ('aria-label', 'Varnish mask'); fileLabel.appendChild (file); fields.appendChild (fileLabel);
        const label = document.createElement ('label'); const enabled = document.createElement ('input'); enabled.type = 'checkbox'; enabled.checked = settings.enabled; enabled.setAttribute ('aria-label', 'Enable spot varnish'); label.append (enabled, document.createTextNode ('Enable spot varnish')); details.appendChild (label);
        const apply = document.createElement ('button'); apply.type = 'button'; apply.className = 'section_button'; apply.textContent = 'Apply spot varnish'; details.appendChild (apply);
        const editor = this.website.sessionEditor;
        for (const input of [...Object.values (inputs), polarity, file, enabled, apply]) { input.disabled = editor.readOnly || editor.busy || !this.website.auth?.user || this.website.accountReady === false; }
        apply.addEventListener ('click', () => editor.Run (async () => {
            RequireMaterialEdit (this, entry); const owner = this.website.auth.user.id; const doc = editor.document;
            const previewSlot = this.textureDialog?.dataset.slot;
            const args = { index : entry.index, enabled : enabled.checked, polarity : polarity.value };
            for (const [key, input] of Object.entries (inputs)) { args[key] = input.value.trim () ? Number (input.value) : NaN; }
            if (file.files[0]) {
                const selected = file.files[0]; if (!['image/png', 'image/jpeg', 'image/webp'].includes (selected.type) || !selected.size || selected.size > 8 * 1024 * 1024) { throw new Error ('Choose a PNG, JPEG or WebP mask up to 8 MB.'); }
                args.maskDataUri = await new Promise ((resolve, reject) => { const reader = new FileReader (); reader.onload = () => resolve (reader.result); reader.onerror = () => reject (new Error ('Could not read varnish mask.')); reader.readAsDataURL (selected); });
            }
            RequireMaterialEdit (this, entry); if (this.website.auth.user.id !== owner || editor.document !== doc) { throw new Error ('The workspace or account changed while reading the mask.'); }
            const result = await this.ApplySpotVarnish (args); if (previewSlot) { this.OpenTexturePreview (entry.index, previewSlot); } return result;
        }));
        parent.appendChild (details);
    }

    ShowReliefDesigner (parent, entry)
    {
        const details = document.createElement ('details'); details.className = 'surface_relief_designer';
        const summary = document.createElement ('summary'); summary.textContent = 'Corrugated surface · Emboss / deboss'; details.appendChild (summary);
        const hint = document.createElement ('p'); hint.className = 'section_hint';
        hint.textContent = 'Appearance only. Grain and flute lines combine with a die-impression mask. Spacing and artwork follow this material’s UV tile; use Bump texture placement to adjust tiling. CAD dimensions and silhouette stay exact.';
        details.appendChild (hint);
        const fields = document.createElement ('div'); fields.className = 'surface_relief_fields'; details.appendChild (fields);
        const settings = { ...SurfaceReliefDefaults, ...(entry.original.surfaceRelief || {}), ...(entry.original.surfaceRelief ? { strength : entry.original.bumpScale } : {}) };
        const inputs = {};
        const numeric = (key, title, min, max, step) => {
            const label = document.createElement ('label'); label.textContent = title;
            const input = document.createElement ('input'); input.type = 'number'; input.min = min; input.max = max; input.step = step; input.value = settings[key]; input.setAttribute ('aria-label', title);
            label.appendChild (input); fields.appendChild (label); inputs[key] = input;
        };
        numeric ('grain', 'Paper grain', 0, 1, 0.05); numeric ('flute', 'Flute visibility', 0, 1, 0.05);
        numeric ('cycles', 'Flute lines per UV tile', 1, 64, 1); numeric ('strength', 'Surface relief strength', 0, 2, 0.05);
        const select = (key, title, choices) => {
            const label = document.createElement ('label'); label.textContent = title;
            const input = document.createElement ('select'); input.setAttribute ('aria-label', title);
            for (const [value, text] of choices) { input.add (new Option (text, value)); } input.value = settings[key];
            label.appendChild (input); fields.appendChild (label); inputs[key] = input;
        };
        select ('direction', 'Flute direction', [['vertical', 'Vertical'], ['horizontal', 'Horizontal']]);
        select ('impression', 'Die impression', [['off', 'Off'], ['emboss', 'Emboss · raised'], ['deboss', 'Deboss · recessed']]);
        select ('polarity', 'Impression mask areas', [['light', 'Light areas'], ['dark', 'Dark areas']]);
        numeric ('impressionStrength', 'Impression strength', 0, 1, 0.05);
        numeric ('maskScale', 'Mask size in tile', 0.1, 1, 0.05); numeric ('maskU', 'Mask horizontal position', 0, 1, 0.05); numeric ('maskV', 'Mask vertical position', 0, 1, 0.05);
        const label = document.createElement ('label'); label.textContent = entry.original.impressionMap ? 'Replace saved impression mask' : 'Impression mask (PNG / JPEG / WebP)';
        const file = document.createElement ('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.setAttribute ('aria-label', 'Impression mask'); label.appendChild (file); fields.appendChild (label);
        const note = document.createElement ('p'); note.className = 'section_hint'; note.textContent = 'Use high-contrast artwork. Transparent areas remain flat; rectangular images fit inside the tile without stretching. All panels sharing this material receive the effect. Applying activates Bump relief and retains your color artwork and normal map.'; details.appendChild (note);
        const clearLabel = document.createElement ('label'); const clear = document.createElement ('input'); clear.type = 'checkbox'; clear.setAttribute ('aria-label', 'Remove saved impression mask'); clearLabel.append (clear, document.createTextNode ('Remove saved impression mask (select Off)')); details.appendChild (clearLabel);
        const apply = document.createElement ('button'); apply.type = 'button'; apply.className = 'section_button'; apply.textContent = 'Apply surface relief'; details.appendChild (apply);
        const editor = this.website.sessionEditor;
        for (const input of [...Object.values (inputs), file, clear, apply]) { input.disabled = editor.readOnly || editor.busy || !this.website.auth?.user || this.website.accountReady === false; }
        apply.addEventListener ('click', () => editor.Run (async () => {
            RequireMaterialEdit (this, entry);
            const owner = this.website.auth.user.id; const doc = editor.document;
            const previewSlot = this.textureDialog?.dataset.slot;
            const args = { index : entry.index, clearMask : clear.checked };
            for (const [key, input] of Object.entries (inputs)) { args[key] = input.type === 'number' ? (input.value.trim () ? Number (input.value) : NaN) : input.value; }
            if (file.files[0]) {
                const selected = file.files[0];
                if (!['image/png', 'image/jpeg', 'image/webp'].includes (selected.type) || !selected.size || selected.size > 8 * 1024 * 1024) { throw new Error ('Choose a PNG, JPEG or WebP mask up to 8 MB.'); }
                args.maskDataUri = await new Promise ((resolve, reject) => { const reader = new FileReader (); reader.onload = () => resolve (reader.result); reader.onerror = () => reject (new Error ('Could not read impression mask.')); reader.readAsDataURL (selected); });
            }
            RequireMaterialEdit (this, entry);
            if (this.website.auth.user.id !== owner || editor.document !== doc) { throw new Error ('The workspace or account changed while reading the mask.'); }
            const result = await this.ApplySurfaceRelief (args); if (previewSlot) { this.OpenTexturePreview (entry.index, previewSlot); } return result;
        }));
        parent.appendChild (details);
    }

    ShowSurfaceMapCards (parent, entry, properties)
    {
        const cards = document.createElement ('div'); cards.className = 'surface_map_cards'; parent.appendChild (cards);
        const assignments = { map : ['Base color', 'Opacity'], roughnessMap : ['Glossy', 'Roughness'], specularMap : ['Reflective', 'Transmission', 'Index of refraction', 'Optical thickness (scene units)'], metalnessMap : ['Metalness'], bumpMap : ['Bump'], normalMap : ['Normal strength'], aoMap : ['AO intensity'], displacementMap : ['Displacement'], emissiveMap : ['Emission'] };
        for (const [key, title] of TextureSlots) {
            if (key === 'displacementMap') { continue; }
            if (key === 'emissiveMap' && !TextureForSlot (entry, key)) { continue; }
            const card = document.createElement ('div'); card.className = 'surface_map_card'; card.dataset.map = key;
            const preview = document.createElement ('button'); preview.type = 'button'; preview.className = 'surface_map_preview'; preview.setAttribute ('aria-label', 'Preview ' + title + ' texture');
            const image = TextureForSlot (entry, key)?.image; const canvas = document.createElement ('canvas'); canvas.width = canvas.height = 64; canvas.className = 'texture_map_thumbnail';
            if (image) { DrawTextureThumbnail (canvas, image); } else { canvas.getContext ('2d').fillText ('Add map', 5, 35); }
            const heading = document.createElement ('span'); heading.textContent = title; preview.append (canvas, heading);
            preview.title = OriginalTexture (entry, key)?.name || 'No image assigned'; preview.addEventListener ('click', () => this.OpenTexturePreview (entry.index, key)); card.appendChild (preview);
            for (const label of properties.querySelectorAll ('.editor_control')) { if ((assignments[key] || []).includes (label.querySelector ('input').getAttribute ('aria-label'))) { card.appendChild (label); } }
            if (key === 'bumpMap' || key === 'normalMap') {
                const mode = key === 'bumpMap' ? 'bump' : 'normal';
                const active = EffectiveReliefMode (entry.original.reliefMode, !!TextureForSlot (entry, 'normalMap'), !!TextureForSlot (entry, 'bumpMap'));
                if (image && active !== mode) {
                    const activate = document.createElement ('button'); activate.type = 'button'; activate.className = 'section_button';
                    activate.textContent = 'Use ' + (mode === 'bump' ? 'Bump' : 'Normal') + ' relief';
                    activate.title = 'Activate this relief map to adjust its strength.';
                    const editor = this.website.sessionEditor;
                    activate.disabled = editor.readOnly || editor.busy || !this.website.auth?.user;
                    activate.addEventListener ('click', () => editor.Run (() => this.SetRelief (entry.index, mode)));
                    card.appendChild (activate);
                }
            }
            cards.appendChild (card);
        }
        const sided = properties.querySelector ('.editor_control'); if (sided) { parent.querySelector ('.surface_tools').appendChild (sided); } properties.remove ();
    }

    async GenerateUVs (index)
    {
        const entry = this.Entry (index); const editor = RequireMaterialEdit (this, entry); const before = CaptureUVs ([entry]);
        GenerateMissingBoxUVs (this.website.viewer, entry); const after = CaptureUVs ([entry]);
        const apply = async (uvs) => { RestoreUVs (uvs); await editor.Render (); editor.MarkDirty (); };
        if (before.some ((item, i) => item.uvs.length !== after[i].uvs.length)) { await apply (after); editor.PushHistory (() => apply (before), () => apply (after)); }
        return { index, generated : before.some ((item, i) => item.uvs.length !== after[i].uvs.length) };
    }

    async SetRelief (index, mode)
    {
        if (!['normal', 'bump', 'off'].includes (mode)) { throw new Error ('Choose normal, bump or off.'); }
        const entry = this.Entry (index); const editor = RequireMaterialEdit (this, entry); const before = entry.original.reliefMode;
        const apply = async (value) => { entry.original.reliefMode = value; await editor.Render (); editor.MarkDirty (); };
        if (before !== mode) { await apply (mode); editor.PushHistory (() => apply (before), () => apply (mode)); }
        return { index, mode };
    }

    OpenUVPreview (index)
    {
        const entry = this.Entry (index); this.previewEntry = entry.material; this.textureDialog?.close (); this.textureDialog = WorkspaceDialog ('UV layout'); this.ShowUV (this.textureDialog, entry); return { opened : true, index };
    }

    OpenTexturePreview (index, key)
    {
        const slot = TextureSlots.find (slot => slot[0] === key); if (!slot) { throw new Error ('Unknown texture slot.'); }
        const entry = this.Entry (index); this.previewEntry = entry.material; this.textureDialog?.close ();
        const dialog = WorkspaceDialog (slot[1] + ' texture'); this.textureDialog = dialog; dialog.classList.add ('surface_texture_dialog');
        dialog.dataset.slot = key;
        const texture = TextureForSlot (entry, key); const original = OriginalTexture (entry, key);
        const canvas = document.createElement ('canvas'); canvas.width = canvas.height = 512; canvas.className = 'surface_texture_large'; canvas.setAttribute ('aria-label', slot[1] + ' texture preview');
        if (texture?.image) { DrawTextureThumbnail (canvas, texture.image); } dialog.appendChild (canvas);
        this.Text (dialog, original ? original.name + ' · ' + (texture?.image?.naturalWidth || texture?.image?.width || 0) + ' × ' + (texture?.image?.naturalHeight || texture?.image?.height || 0) + ' px' : 'No image assigned. Choose Replace texture to add one.');
        const actions = document.createElement ('div'); actions.className = 'surface_texture_actions'; dialog.appendChild (actions);
        const save = document.createElement ('button'); save.textContent = 'Save texture'; save.disabled = !original?.buffer; save.addEventListener ('click', () => this.SaveTexture (index, key));
        const input = document.createElement ('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.hidden = true; input.setAttribute ('aria-label', 'Replace texture file');
        const replace = document.createElement ('button'); replace.textContent = 'Replace texture'; replace.addEventListener ('click', () => input.click ());
        const remove = document.createElement ('button'); remove.textContent = 'Remove texture'; remove.disabled = !original;
        const editor = this.website.sessionEditor; replace.disabled = editor.readOnly || editor.busy; remove.disabled ||= replace.disabled;
        remove.addEventListener ('click', () => editor.Run (async () => { await this.RemoveTexture (index, key); this.OpenTexturePreview (index, key); }));
        input.addEventListener ('change', () => editor.Run (async () => { if (!input.files[0]) { return; } await this.LoadTexture (this.Entry (index), slot, input.files[0]); this.OpenTexturePreview (index, key); })); actions.append (save, replace, remove, input);
        if (texture && original) {
            const mapping = document.createElement ('details'); mapping.className = 'surface_uv_mapping'; mapping.open = true;
            const title = document.createElement ('summary'); title.textContent = 'UV' + texture.channel + ' · coordinates, rotation and tiling'; mapping.appendChild (title); dialog.appendChild (mapping);
            const settings = this.InspectTexture (index, key);
            for (const [field, title, step] of [['tileU', 'Tile U', .05], ['tileV', 'Tile V', .05], ['offsetU', 'Offset U', .05], ['offsetV', 'Offset V', .05], ['rotationDegrees', 'Texture rotation (°)', 1]]) {
                const label = document.createElement ('label'); label.className = 'surface_uv_control'; const caption = document.createElement ('span'); caption.textContent = title; label.appendChild (caption);
                const input = document.createElement ('input'); input.type = 'number'; input.step = step; input.value = settings[field]; input.setAttribute ('aria-label', title); input.disabled = editor.readOnly || editor.busy || !this.website.auth?.user; label.appendChild (input); mapping.appendChild (label);
                input.addEventListener ('change', () => editor.Run (() => this.SetTextureMapping (index, key, { [field] : input.value.trim () ? Number (input.value) : NaN })));
            }
        }
        if (['map', 'bumpMap', 'normalMap'].includes (key)) { this.ShowReliefDesigner (dialog, entry); }
        if (['roughnessMap', 'specularMap'].includes (key)) { this.ShowVarnishDesigner (dialog, entry); }
        return { opened : true, index, slot : key, tools : { mapping : !!original, embossDeboss : ['map', 'bumpMap', 'normalMap'].includes (key), spotVarnish : ['roughnessMap', 'specularMap'].includes (key) } };
    }

    InspectTexture (index, key)
    {
        if (!TextureSlots.some (slot => slot[0] === key)) { throw new Error ('Unknown texture slot.'); }
        const entry = this.Entry (index); const map = OriginalTexture (entry, key);
        return { index, slot : key, assigned : !!map, name : map?.name || null, tileU : map?.scale.x ?? 1, tileV : map?.scale.y ?? 1, offsetU : map?.offset.x ?? 0, offsetV : map?.offset.y ?? 0, rotationDegrees : (map?.rotation || 0) * 180 / Math.PI,
            surfaceRelief : entry.original.surfaceRelief ? { ...entry.original.surfaceRelief } : null, varnishSettings : entry.original.varnishSettings ? { ...entry.original.varnishSettings } : null, boardFluteLinked : entry.original.boardFluteLinked };
    }

    SetTextureMapping (index, key, changes)
    {
        const entry = this.Entry (index); const editor = RequireMaterialEdit (this, entry); const before = this.InspectTexture (index, key);
        if (!before.assigned) { throw new Error ('Assign a texture before editing its UV mapping.'); }
        const keys = ['tileU', 'tileV', 'offsetU', 'offsetV', 'rotationDegrees'];
        if (!changes || !Object.keys (changes).length || Object.keys (changes).some (key => !keys.includes (key)) || Object.values (changes).some (value => !Number.isFinite (value) || Math.abs (value) > 1000000) || ['tileU', 'tileV'].some (field => changes[field] === 0)) { throw new Error ('Use finite UV values within ±1,000,000 and nonzero tiling.'); }
        const after = { ...before, ...changes }; if (['bumpMap', 'normalMap'].includes (key)) { after.boardFluteLinked = false; }
        const apply = value => {
            const current = this.Entry (index); const map = OriginalTexture (current, key); const texture = TextureForSlot (current, key);
            map.scale.x = value.tileU; map.scale.y = value.tileV; map.offset.x = value.offsetU; map.offset.y = value.offsetV; map.rotation = value.rotationDegrees * Math.PI / 180;
            current.original.boardFluteLinked = value.boardFluteLinked;
            if (texture) { texture.repeat.set (value.tileU, value.tileV); texture.offset.set (value.offsetU, value.offsetV); texture.rotation = map.rotation; texture.updateMatrix (); }
            this.website.viewer.Render (); editor.MarkDirty?.();
        };
        if (JSON.stringify (before) !== JSON.stringify (after)) { apply (after); editor.PushHistory (() => apply (before), () => apply (after)); }
        return this.InspectTexture (index, key);
    }

    SaveTexture (index, key)
    {
        const map = OriginalTexture (this.Entry (index), key); if (!TextureSlots.some (slot => slot[0] === key) || !map?.buffer) { throw new Error ('No embedded texture to save.'); }
        this.website.sessionEditor.Download (map.buffer, map.name || key + '.png', map.mimeType || 'image/png'); return { downloaded : true, index, slot : key, name : map.name };
    }

    async CommitTexture (entry, key, next)
    {
        const slot = TextureSlots.find (slot => slot[0] === key); if (!slot) { throw new Error ('Unknown texture slot.'); }
        const editor = RequireMaterialEdit (this, entry); const before = CloneSurface (entry.original);
        entry.original[slot[2]] = next; if (key === 'map' && next) { entry.original.multiplyDiffuseMap = true; }
        if (key === 'bumpMap' || key === 'normalMap') { entry.original.boardFluteLinked = false; }
        const after = CloneSurface (entry.original);
        const apply = async (surface) => { Object.assign (entry.original, CloneSurface (surface)); await editor.Render (); editor.MarkDirty (); };
        try { await apply (after); } catch (error) { await apply (before); throw error; }
        editor.PushHistory (() => apply (before), () => apply (after)); return { index : entry.index, slot : key, name : next?.name || null };
    }

    RemoveTexture (index, key) { return this.CommitTexture (this.Entry (index), key, null); }

    async LoadTexture (entry, slot, file)
    {
        RequireMaterialEdit (this, entry);
        if (!TextureSlots.some (item => item[0] === slot[0]) || !['image/png', 'image/jpeg', 'image/webp'].includes (file.type) || file.size > 64 * 1024 * 1024 || !file.size) { throw new Error ('Choose a PNG, JPEG or WebP under 64 MB.'); }
        const request = ++this.textureRequest; const model = this.website.model; const owner = this.website.auth.user.id;
        const url = URL.createObjectURL (file); let texture;
        try {
            const buffer = await file.arrayBuffer (); texture = await new THREE.TextureLoader ().loadAsync (url);
            if (request !== this.textureRequest || model !== this.website.model || this.website.auth.user?.id !== owner) { throw new Error ('The model or account changed while loading.'); }
            const image = texture.image; if ((image.naturalWidth || image.width) > 8192 || (image.naturalHeight || image.height) > 8192) { throw new Error ('Texture dimensions must be at most 8192 pixels.'); }
            const original = new TextureMap (); original.name = file.name; original.mimeType = file.type; original.buffer = buffer;
            PreserveTextureMapping (TextureForSlot (entry, slot[0]), texture, original);
            return await this.CommitTexture (entry, slot[0], original);
        } finally { texture?.dispose (); URL.revokeObjectURL (url); }
    }

    FormatValue (value)
    {
        const number = Number (value);
        return number !== 0 && Math.abs (number) < 0.01 ? number.toPrecision (2) : number.toFixed (2);
    }

    SyncValue (title, value)
    {
        const input = this.drawer.querySelector ('input[aria-label="' + title + '"]');
        if (input) { input.value = value; input.nextElementSibling.textContent = this.FormatValue (value); }
    }

    WrapName (value)
    {
        return value === 1000 ? 'Repeat' : value === 1002 ? 'Mirror' : 'Clamp';
    }

    Column (parent, title)
    {
        const column = document.createElement ('div');
        column.className = 'editor_column';
        const heading = document.createElement ('h3');
        heading.textContent = title;
        column.appendChild (heading);
        parent.appendChild (column);
        return column;
    }

    Text (parent, text)
    {
        const paragraph = document.createElement ('p');
        paragraph.className = 'section_hint';
        paragraph.textContent = text;
        parent.appendChild (paragraph);
        return paragraph;
    }

    Control (parent, title, type, value, attributes, onChange, selectedEntry = null)
    {
        const label = document.createElement ('label');
        label.className = 'editor_control';
        if (attributes.disabled) { label.title = 'Add the corresponding map or select its relief mode.'; }
        const caption = document.createElement ('span');
        caption.textContent = title;
        const input = document.createElement ('input');
        input.type = type;
        input.setAttribute ('aria-label', title);
        Object.assign (input, attributes);
        if (type === 'checkbox') { input.checked = value; } else { input.value = value; }
        const output = document.createElement ('output');
        output.textContent = type === 'range' ? this.FormatValue (value) : '';
        label.append (caption, input, output);
        const entry = selectedEntry || this.entries[this.active];
        input.disabled ||= this.website.sessionEditor.readOnly || this.website.sessionEditor.busy || !this.website.auth?.user;
        let beforeState = null;
        const captureBefore = () => { if (beforeState === null) { beforeState = this.CaptureMaterialState (entry); } };
        input.addEventListener ('pointerdown', captureBefore);
        input.addEventListener ('focus', captureBefore);
        input.addEventListener ('input', () => {
            if (type === 'number' && (!input.value || !Number.isFinite (Number (input.value)))) { return; }
            try { RequireMaterialEdit (this, entry); } catch (error) { this.website.sessionEditor.Status (error.message); return; }
            onChange (type === 'checkbox' ? input.checked : input.value);
            this.website.sessionEditor?.MarkDirty ();
            output.textContent = type === 'range' ? this.FormatValue (input.value) : '';
            entry.material.needsUpdate = true;
            this.website.lightingPanel?.RefreshMaterialProperties ();
            this.website.viewer.Render ();
        });
        input.addEventListener ('change', () => {
            if (beforeState === null) { return; }
            const before = beforeState; const after = this.CaptureMaterialState (entry); beforeState = null;
            if (JSON.stringify (before) === JSON.stringify (after)) { return; }
            this.website.sessionEditor?.PushHistory (
                () => this.RestoreMaterialState (entry, before),
                () => this.RestoreMaterialState (entry, after)
            );
        });
        parent.appendChild (label);
    }
}
