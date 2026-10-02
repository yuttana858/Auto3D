import * as THREE from 'three';
import { TextureMap } from '../engine/model/material.js';
import { HexStringToRGBColor } from '../engine/model/color.js';
import { GenerateMissingBoxUVs } from './materialuv.js';

const TextureSlots = [
    ['map', 'Base color', 'diffuseMap'], ['normalMap', 'Normal', 'normalMap'],
    ['bumpMap', 'Bump', 'bumpMap'], ['roughnessMap', 'Roughness', 'metalnessMap'],
    ['metalnessMap', 'Metalness', 'metalnessMap'], ['emissiveMap', 'Emission', 'emissiveMap'],
    ['specularMap', 'Specular', 'specularMap'], ['aoMap', 'Ambient occlusion', 'aoMap'],
    ['displacementMap', 'Displacement', 'displacementMap']
];

export function GetAssignedTextureSlots (entry)
{
    return TextureSlots.filter ((slot) => entry.material[slot[0]] && entry.material[slot[0]].image).map ((slot) => ({
        key : slot[0], title : slot[1], texture : entry.material[slot[0]],
        name : entry.original[slot[2]]?.name || entry.material[slot[0]].name || slot[1]
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
        this.drawer = document.getElementById ('material_drawer');
        const tabs = document.createElement ('div');
        tabs.className = 'editor_tabs';
        tabs.setAttribute ('role', 'tablist');
        tabs.setAttribute ('aria-label', 'Material editor views');
        for (const [id, title] of [['surface', 'Surface'], ['textures', 'Textures'], ['uv', 'UV']]) {
            const button = document.createElement ('button');
            button.textContent = title;
            button.id = 'editor_tab_' + id;
            button.setAttribute ('role', 'tab');
            button.setAttribute ('aria-controls', 'material_drawer_content');
            button.addEventListener ('click', () => { this.page = id; this.FillDrawer (); });
            button.addEventListener ('keydown', (event) => {
                if (!['ArrowLeft', 'ArrowRight'].includes (event.key)) { return; }
                const buttons = Array.from (tabs.children);
                const next = buttons[(buttons.indexOf (button) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
                next.click (); next.focus (); event.preventDefault ();
            });
            tabs.appendChild (button);
        }
        this.drawer.querySelector ('.drawer_header').insertBefore (tabs, document.getElementById ('material_drawer_close'));
        this.section = document.getElementById ('materials_section');
        this.section.innerHTML = '<summary>Materials</summary><div class="section_content"><p id="material_context" class="section_hint"></p><div id="material_list"></div><button class="section_button" id="material_advance" disabled>Advance material editor</button></div>';
        document.getElementById ('material_advance').addEventListener ('click', () => this.Open ());
        document.getElementById ('material_drawer_close').addEventListener ('click', () => this.Close ());
        document.addEventListener ('keydown', (event) => {
            if (event.key === 'Escape' && this.open) { this.Close (); }
        });
        this.Update ();
    }

    Clear ()
    {
        ++this.textureRequest;
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
        this.entries = model ? GetMaterialEntries (this.website.viewer, model, selected) : [];
        this.active = Math.min (this.active, Math.max (0, this.entries.length - 1));
        this.ShowSummary ();
        if (this.open) {
            this.website.viewer.SetMeshesHighlight (this.website.highlightColor, () => false);
            this.FillDrawer ();
        }
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
            const text = document.createElement ('span');
            const maps = TextureSlots.filter ((slot) => entry.material[slot[0]]);
            text.textContent = (entry.original.name || 'Material ' + (entry.index + 1)) + ' · ' + (maps.length ? maps.map ((slot) => slot[1]).join (', ') : 'Solid color · no texture');
            button.append (swatch, text);
            button.addEventListener ('click', () => { this.active = index; this.Open (); });
            list.appendChild (button);
        });
        document.getElementById ('material_advance').disabled = !this.entries.length;
    }

    Open ()
    {
        if (!this.entries.length) { return; }
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
        select.addEventListener ('change', () => { this.active = Number (select.value); this.FillDrawer (); });
        contextLabel.appendChild (select);
        for (const button of this.drawer.querySelectorAll ('[role="tab"]')) {
            const selected = button.id === 'editor_tab_' + this.page;
            button.setAttribute ('aria-selected', String (selected));
            button.tabIndex = selected ? 0 : -1;
        }
        content.setAttribute ('role', 'tabpanel');
        content.setAttribute ('aria-labelledby', 'editor_tab_' + this.page);
        if (this.page === 'textures') { this.ShowTextures (content, entry); return; }
        if (this.page === 'surface') {
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
            this.Control (properties, 'Reflective', 'range', physical ? material.specularIntensity : Math.max (material.specular.r, material.specular.g, material.specular.b), { min : 0, max : 1, step : 0.01 }, (value) => {
                if (physical) { material.specularIntensity = Number (value); entry.original.specularIntensity = Number (value); }
                else {
                    material.specular.setRGB (Number (value), Number (value), Number (value));
                    entry.original.specular = HexStringToRGBColor (material.specular.getHexString ());
                }
            });
            for (const [key, originalKey, title, map, max] of [
                ['bumpScale', 'bumpScale', 'Bump', 'bumpMap', 2],
                ['normalScale', 'normalScale', 'Normal strength', 'normalMap', 2],
                ['aoMapIntensity', 'aoIntensity', 'AO intensity', 'aoMap', 1]
            ]) {
                const value = key === 'normalScale' ? material.normalScale.x : material[key];
                this.Control (properties, title, 'range', value, { min : 0, max, step : 0.01, disabled : !material[map] || (map === 'bumpMap' && !!material.normalMap) }, (value) => {
                    if (key === 'normalScale') { material.normalScale.setScalar (Number (value)); }
                    else { material[key] = Number (value); }
                    entry.original[originalKey] = Number (value);
                });
            }
            let extent = 1;
            for (const { mesh } of entry.meshes) {
                mesh.geometry.computeBoundingBox ();
                const size = mesh.geometry.boundingBox.getSize (new THREE.Vector3 ());
                extent = Math.max (size.x, size.y, size.z, 1e-6);
            }
            const maxDisplacement = Math.max (extent * 0.05, Math.abs (material.displacementScale));
            this.Control (properties, 'Displacement', 'range', material.displacementScale, { min : -maxDisplacement, max : maxDisplacement, step : maxDisplacement / 100, disabled : !material.displacementMap }, (value) => {
                material.displacementScale = Number (value); entry.original.displacementScale = Number (value);
            });
            this.Control (properties, 'Double sided', 'checkbox', material.side === THREE.DoubleSide, {}, (value) => {
                material.side = value ? THREE.DoubleSide : THREE.FrontSide; entry.original.doubleSided = value;
            });
            const note = this.Text (properties, 'Shared material · Load Bump, AO or Displacement maps in Textures to enable their controls.');
            note.classList.add ('editor_note');
            this.ShowTextureThumbnails (content, entry);
            return;
        }
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
        generate.addEventListener ('click', () => { GenerateMissingBoxUVs (this.website.viewer, entry); this.website.viewer.Render (); this.FillDrawer (); });
        uvDetails.appendChild (generate);
        this.Text (uvDetails, 'Fills missing UVs only. Box projection is a starting point; seams can remain.');
    }

    ShowTextureThumbnails (parent, entry)
    {
        const gallery = this.Column (parent, 'Assigned texture maps');
        gallery.classList.add ('texture_gallery');
        const maps = GetAssignedTextureSlots (entry);
        if (!maps.length) { this.Text (gallery, 'This material has no texture images assigned.'); return; }
        for (const map of maps) {
            const card = document.createElement ('button');
            card.type = 'button'; card.className = 'texture_map_card';
            card.setAttribute ('aria-label', 'Edit ' + map.title + ' texture: ' + map.name);
            card.title = map.title + ' · ' + map.name;
            card.dataset.map = map.key;
            card.setAttribute ('aria-pressed', String (this.page === 'textures' && this.mapSlot === map.key));
            const thumbnail = document.createElement ('canvas');
            thumbnail.width = 64; thumbnail.height = 64;
            thumbnail.className = 'texture_map_thumbnail';
            thumbnail.setAttribute ('aria-hidden', 'true');
            DrawTextureThumbnail (thumbnail, map.texture.image);
            const label = document.createElement ('span');
            const title = document.createElement ('strong'); title.textContent = map.title;
            const filename = document.createElement ('span'); filename.textContent = map.name;
            label.append (title, filename); card.append (thumbnail, label);
            card.addEventListener ('click', () => { this.mapSlot = map.key; this.page = 'textures'; this.FillDrawer (); });
            gallery.appendChild (card);
        }
    }

    ShowTextures (content, entry)
    {
        const material = entry.material;
        const controls = this.Column (content, 'Texture maps');
        controls.classList.add ('texture_actions');
        const maps = TextureSlots.filter ((slot) => material[slot[0]] || (material.isMeshStandardMaterial ? slot[0] !== 'specularMap' && slot[0] !== 'roughnessMap' : !['roughnessMap', 'metalnessMap'].includes (slot[0])));
        const picker = document.createElement ('select');
        picker.setAttribute ('aria-label', 'Texture map');
        maps.forEach ((slot) => picker.add (new Option ((slot[0] === 'metalnessMap' ? 'Metalness / roughness' : slot[1]) + (material[slot[0]] ? ' · assigned' : ' · empty'), slot[0])));
        picker.value = maps.some ((slot) => slot[0] === this.mapSlot) ? this.mapSlot : 'map';
        this.mapSlot = picker.value;
        picker.addEventListener ('change', () => { this.mapSlot = picker.value; this.FillDrawer (); });
        controls.appendChild (picker);
        const slot = maps.find ((slot) => slot[0] === this.mapSlot);
        const fileInput = document.createElement ('input');
        fileInput.type = 'file'; fileInput.accept = 'image/png,image/jpeg,image/webp';
        fileInput.hidden = true;
        fileInput.setAttribute ('aria-label', 'Load texture image');
        const load = document.createElement ('button');
        load.className = 'section_button'; load.textContent = material[slot[0]] ? 'Replace image' : 'Load image';
        load.addEventListener ('click', () => fileInput.click ());
        const remove = document.createElement ('button');
        remove.className = 'section_button'; remove.textContent = 'Remove map'; remove.disabled = !material[slot[0]];
        remove.addEventListener ('click', () => {
            ++this.textureRequest;
            material[slot[0]] = null; entry.original[slot[2]] = null;
            if (slot[0] === 'specularMap' && material.isMeshPhysicalMaterial) { material.specularColorMap = null; }
            if (slot[0] === 'metalnessMap') { material.roughnessMap = null; }
            material.needsUpdate = true; this.website.viewer.Render (); this.ShowSummary (); this.FillDrawer ();
        });
        const status = this.Text (controls, 'PNG, JPEG or WebP · stays in your browser');
        status.setAttribute ('role', 'status');
        fileInput.addEventListener ('change', async () => {
            if (!fileInput.files.length) { return; }
            load.disabled = true; status.textContent = 'Loading image…';
            await this.LoadTexture (entry, slot, fileInput.files[0], status);
            load.disabled = false;
        });
        controls.append (load, remove, fileInput);
        const details = this.Column (content, 'Mapping');
        details.classList.add ('texture_details');
        const texture = material[slot[0]];
        const original = entry.original[slot[2]];
        if (!texture) {
            this.Text (details, 'Load a texture image for this map. Metalness / roughness images use green for roughness and blue for metalness.');
        } else {
            const preview = document.createElement ('canvas');
            preview.className = 'texture_preview'; preview.setAttribute ('aria-label', slot[1] + ' texture preview');
            if (texture.image) {
                preview.width = 176; preview.height = 176;
                DrawTextureThumbnail (preview, texture.image);
            }
            details.appendChild (preview);
            const fields = document.createElement ('div'); fields.className = 'texture_fields'; details.appendChild (fields);
            this.Text (fields, (original ? original.name : slot[1]) + ' · ' + (texture.image?.naturalWidth || texture.image?.width || 0) + ' × ' + (texture.image?.naturalHeight || texture.image?.height || 0) + ' px · UV' + texture.channel);
            for (const [key, axis, title] of [['repeat', 'x', 'Tile U'], ['repeat', 'y', 'Tile V'], ['offset', 'x', 'Offset U'], ['offset', 'y', 'Offset V']]) {
                this.Control (fields, title, 'number', texture[key][axis], { step : 0.05 }, (value) => {
                    texture[key][axis] = Number (value);
                    if (original) { original[key === 'repeat' ? 'scale' : key][axis] = Number (value); }
                    texture.updateMatrix ();
                });
            }
            this.Control (fields, 'Texture rotation (°)', 'number', texture.rotation * 180 / Math.PI, { step : 1 }, (value) => {
                texture.rotation = Number (value) * Math.PI / 180;
                if (original) { original.rotation = texture.rotation; }
                texture.updateMatrix ();
            });
        }
        if (entry.meshes.some ((item) => !item.mesh.geometry.getAttribute ('uv'))) {
            this.Text (details, 'This geometry has no UVs. Open UV → Generate box UVs to use your image.');
        }
        this.ShowTextureThumbnails (content, entry);
    }

    async LoadTexture (entry, slot, file, status)
    {
        const request = ++this.textureRequest;
        const model = this.website.model;
        const url = URL.createObjectURL (file);
        try {
            const buffer = await file.arrayBuffer ();
            const texture = await new THREE.TextureLoader ().loadAsync (url);
            if (request !== this.textureRequest || model !== this.website.model) { texture.dispose (); return; }
            texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
            this.editorTextures.add (texture);
            const original = new TextureMap ();
            original.name = file.name; original.mimeType = file.type || 'image/png'; original.buffer = buffer;
            PreserveTextureMapping (entry.material[slot[0]], texture, original);
            entry.original[slot[2]] = original; entry.material[slot[0]] = texture;
            if (slot[0] === 'specularMap' && entry.material.isMeshPhysicalMaterial) { entry.material.specularColorMap = texture; }
            if (slot[0] === 'metalnessMap') { entry.material.roughnessMap = texture; }
            if (slot[0] === 'map') { entry.original.multiplyDiffuseMap = true; }
            if (slot[0] === 'displacementMap' && entry.material.displacementScale === 0) {
                entry.meshes[0].mesh.geometry.computeBoundingBox ();
                const size = entry.meshes[0].mesh.geometry.boundingBox.getSize (new THREE.Vector3 ());
                entry.original.displacementScale = Math.max (size.x, size.y, size.z) * 0.005;
                entry.material.displacementScale = entry.original.displacementScale;
            }
            entry.material.needsUpdate = true;
            this.website.viewer.Render (); this.ShowSummary ();
            if (this.open && this.entries[this.active] && this.entries[this.active].material === entry.material) { this.FillDrawer (); }
        } catch (error) {
            if (request === this.textureRequest) { status.textContent = 'Image could not be loaded. Choose a PNG, JPEG or WebP.'; }
        } finally { URL.revokeObjectURL (url); }
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

    Control (parent, title, type, value, attributes, onChange)
    {
        const label = document.createElement ('label');
        label.className = 'editor_control';
        if (attributes.disabled) { label.title = 'Load the corresponding texture map in Textures. Normal maps take priority over bump maps.'; }
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
        input.addEventListener ('input', () => {
            if (type === 'number' && (!input.value || !Number.isFinite (Number (input.value)))) { return; }
            onChange (type === 'checkbox' ? input.checked : input.value);
            output.textContent = type === 'range' ? this.FormatValue (input.value) : '';
            this.entries[this.active].material.needsUpdate = true;
            this.website.viewer.Render ();
        });
        parent.appendChild (label);
    }
}
