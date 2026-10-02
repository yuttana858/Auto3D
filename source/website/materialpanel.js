const TextureSlots = [
    ['map', 'Base color', 'diffuseMap'], ['normalMap', 'Normal', 'normalMap'],
    ['bumpMap', 'Bump', 'bumpMap'], ['roughnessMap', 'Roughness', 'metalnessMap'],
    ['metalnessMap', 'Metalness', 'metalnessMap'], ['emissiveMap', 'Emission', 'emissiveMap'],
    ['specularMap', 'Specular', 'specularMap']
];

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
        this.drawer = document.getElementById ('material_drawer');
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
            const swatch = document.createElement (image && image.src ? 'img' : 'span');
            swatch.className = 'material_swatch';
            swatch.style.backgroundColor = '#' + entry.material.color.getHexString ();
            if (image && image.src) { swatch.src = image.src; swatch.alt = ''; }
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
        document.getElementById ('material_drawer_context').textContent = entry.original.name || 'Material ' + (entry.index + 1);
        const properties = this.Column (content, 'Surface');
        const select = document.createElement ('select');
        select.setAttribute ('aria-label', 'Material');
        this.entries.forEach ((item, index) => {
            const option = new Option (item.original.name || 'Material ' + (item.index + 1), index);
            select.add (option);
        });
        select.value = this.active;
        select.addEventListener ('change', () => { this.active = Number (select.value); this.FillDrawer (); });
        properties.appendChild (select);
        this.Text (properties, material.isMeshStandardMaterial ? 'Physical material' : 'Phong material');
        this.Control (properties, 'Base color', 'color', '#' + material.color.getHexString (), {}, (value) => {
            material.color.set (value);
            const color = entry.original.color;
            color.r = Math.round (material.color.r * 255);
            color.g = Math.round (material.color.g * 255);
            color.b = Math.round (material.color.b * 255);
            entry.original.multiplyDiffuseMap = true;
            this.ShowSummary ();
        });
        this.Control (properties, 'Opacity', 'range', material.opacity, { min : 0, max : 1, step : 0.01 }, (value) => {
            material.opacity = Number (value);
            material.transparent = material.opacity < 1;
            entry.original.opacity = material.opacity;
            entry.original.transparent = material.transparent;
        });
        for (const [key, title, max, factor] of material.isMeshStandardMaterial ? [['roughness', 'Roughness', 1, 1], ['metalness', 'Metalness', 1, 1]] : [['shininess', 'Shininess', 100, 100]]) {
            this.Control (properties, title, 'range', material[key], { min : 0, max, step : max / 100 }, (value) => {
                material[key] = Number (value);
                entry.original[key] = Number (value) / factor;
            });
        }
        this.Text (properties, 'Changes apply to every part sharing this material.');
        const textures = this.Column (content, 'Textures & mapping');
        const maps = TextureSlots.filter ((slot) => material[slot[0]]);
        if (!maps.length) {
            this.Text (textures, 'No texture maps assigned. This surface uses a solid color.');
        } else {
            const picker = document.createElement ('select');
            picker.setAttribute ('aria-label', 'Texture map');
            maps.forEach ((slot, index) => picker.add (new Option (slot[1], index)));
            const details = document.createElement ('div');
            textures.append (picker, details);
            const show = () => {
                details.replaceChildren ();
                const slot = maps[Number (picker.value)];
                const texture = material[slot[0]];
                const original = entry.original[slot[2]];
                const image = texture.image;
                if (image && image.src) {
                    const preview = document.createElement ('img');
                    preview.className = 'texture_preview';
                    preview.src = image.src;
                    preview.alt = slot[1] + ' texture';
                    details.appendChild (preview);
                }
                this.Text (details, original && original.name ? original.name : slot[1] + ' map');
                this.Text (details, image ? (image.naturalWidth || image.width) + ' × ' + (image.naturalHeight || image.height) + ' px · UV channel ' + texture.channel : 'Texture image unavailable');
                this.Text (details, 'Wrap U / V: ' + this.WrapName (texture.wrapS) + ' / ' + this.WrapName (texture.wrapT));
                for (const [key, axis, title] of [['repeat', 'x', 'Tile U'], ['repeat', 'y', 'Tile V'], ['offset', 'x', 'Offset U'], ['offset', 'y', 'Offset V']]) {
                    this.Control (details, title, 'number', texture[key][axis], { step : 0.05 }, (value) => {
                        texture[key][axis] = Number (value);
                        if (original) { original[key === 'repeat' ? 'scale' : key][axis] = Number (value); }
                        texture.updateMatrix ();
                    });
                }
                this.Control (details, 'Texture rotation (°)', 'number', texture.rotation * 180 / Math.PI, { step : 1 }, (value) => {
                    texture.rotation = Number (value) * Math.PI / 180;
                    if (original) { original.rotation = texture.rotation; }
                    texture.updateMatrix ();
                });
            };
            picker.addEventListener ('change', show);
            show ();
        }
        const uvColumn = this.Column (content, 'UV layout');
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
        this.Text (uvColumn, triangles ? 'UV0 · ' + triangles.toLocaleString () + ' triangles · U ' + bounds.minU.toFixed (2) + ' to ' + bounds.maxU.toFixed (2) + ' · V ' + bounds.minV.toFixed (2) + ' to ' + bounds.maxV.toFixed (2) + '. Grey outline marks the 0–1 tile. Layout shows geometry UVs; texture adjustments change how the image is placed.' + (triangles > 10000 ? ' Preview limited to 10,000 triangles.' : '') : 'No UV coordinates in this geometry. Texture mapping requires UVs.');
        if (this.open) { this.website.layouter.Resize (); }
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
    }

    Control (parent, title, type, value, attributes, onChange)
    {
        const label = document.createElement ('label');
        label.className = 'editor_control';
        const caption = document.createElement ('span');
        caption.textContent = title;
        const input = document.createElement ('input');
        input.type = type;
        input.setAttribute ('aria-label', title);
        input.value = value;
        Object.assign (input, attributes);
        const output = document.createElement ('output');
        output.textContent = type === 'range' ? Number (value).toFixed (2) : '';
        label.append (caption, input, output);
        input.addEventListener ('input', () => {
            if (type === 'number' && (!input.value || !Number.isFinite (Number (input.value)))) { return; }
            onChange (input.value);
            output.textContent = type === 'range' ? Number (input.value).toFixed (2) : '';
            this.entries[this.active].material.needsUpdate = true;
            this.website.viewer.Render ();
        });
        parent.appendChild (label);
    }
}
