import { HDRILighting } from '../engine/viewer/hdrilighting.js';
import { GetBackgroundPreset, GetBackgroundGradientCSS } from '../engine/viewer/background.js';
import { Theme } from './settings.js';

const DefaultEnvironments = [
    { id : 'studio_small_09', name : 'Softbox studio', category : 'Studio · neutral' },
    { id : 'colorful_studio', name : 'Colorful studio', category : 'Studio · warm & cool' },
    { id : 'blue_photo_studio', name : 'Blue photo studio', category : 'Studio · cool blue' },
    { id : 'kiara_interior', name : 'Kiara interior', category : 'Indoor · warm daylight' },
    { id : 'autumn_forest_02', name : 'Autumn forest', category : 'Nature · overcast' },
    { id : 'shanghai_bund', name : 'Shanghai Bund', category : 'City · night' },
    { id : 'decor_shop', name : 'Decor shop', category : 'Retail · daylight' },
    { id : 'gear_store', name : 'Gear store', category : 'Retail · warm lighting' }
].map ((item) => ({
    ...item,
    previewUrl : 'assets/hdri/' + item.id + '.hdr',
    renderUrl : null,
    thumbnailUrl : 'assets/hdri/' + item.id + '.png',
    sourceUrl : 'https://polyhaven.com/a/' + item.id,
    license : 'CC0-1.0'
}));

export class LightingPanel
{
    constructor (website)
    {
        this.website = website;
        this.lighting = new HDRILighting (website.viewer);
        this.mode = 'default';
        this.selected = null;
        this.request = 0;
        this.restoring = false;
        this.environments = DefaultEnvironments.map ((item) => ({ ...item }));
        this.root = document.getElementById ('lighting_section');
        this.root.innerHTML = `<summary>Lighting</summary><div class="section_content">
            <div class="mode_buttons"><button id="lighting_default" aria-pressed="true">Default environment</button><button id="lighting_hdri" aria-pressed="false">HDRI</button></div>
            <div id="default_background_options"><p class="section_hint">World-locked dome background</p><div class="background_gallery"></div><p class="section_hint">Standard follows the app theme.</p></div>
            <div id="hdri_options" hidden><p class="section_hint">Choose a surrounding light environment.</p><div class="hdri_gallery"></div>
            <div class="lighting_viewport_controls"><label><input type="checkbox" id="hdri_background"> Show HDRI background</label></div>
            <label class="slider_label" for="hdri_brightness">Brightness <output id="hdri_brightness_value">1.00×</output></label><input id="hdri_brightness" type="range" min="0" max="3" step="0.05" value="1">
            <label class="slider_label" for="hdri_rotation">Rotation <output id="hdri_rotation_value">0°</output></label><input id="hdri_rotation" type="range" min="-180" max="180" step="1" value="0">
            <label class="slider_label" for="hdri_elevation">Elevation <output id="hdri_elevation_value">0°</output></label><input id="hdri_elevation" type="range" min="-90" max="90" step="1" value="0">
            <button class="section_button" id="hdri_reset">Reset adjustments</button><p class="section_hint">Rotate or tilt to reposition the light.</p>
            <a id="hdri_credit" href="https://polyhaven.com/hdris" target="_blank" rel="noopener">Poly Haven · CC0</a></div>
            <div class="lighting_viewport_controls"><label><input type="checkbox" id="horizon_gradient"> Dome horizon</label><label><input type="checkbox" id="ground_grid"> Ground grid</label></div>
            <div class="scene_effects">
                <strong>Reflections & shadows</strong>
                <label class="slider_label" for="environment_reflection_intensity">Environment reflection <output id="environment_reflection_intensity_value">1.00×</output></label>
                <input id="environment_reflection_intensity" type="range" min="0" max="2" step="0.05" value="1">
                <div class="lighting_viewport_controls"><label><input type="checkbox" id="model_reflections"> Reflect models</label><label><input type="checkbox" id="floor_reflection"> Floor reflection</label></div>
                <label class="slider_label" for="model_reflection_intensity">Model reflection <output id="model_reflection_intensity_value">0.55×</output></label>
                <input id="model_reflection_intensity" type="range" min="0" max="1.5" step="0.05" value="0.55">
                <label class="slider_label" for="floor_reflection_intensity">Floor reflection <output id="floor_reflection_intensity_value">0.35×</output></label>
                <input id="floor_reflection_intensity" type="range" min="0" max="1" step="0.05" value="0.35">
                <div class="lighting_viewport_controls"><label><input type="checkbox" id="global_shadows"> Shadows</label></div>
                <label class="slider_label" for="shadow_intensity">Floor shadow <output id="shadow_intensity_value">0.28×</output></label>
                <input id="shadow_intensity" type="range" min="0" max="1" step="0.02" value="0.28">
                <p class="section_hint">Reflect models uses a realtime cube capture. Floor reflection uses a planar render pass. Shadows use each model's Cast/Receive settings.</p>
            </div>
            <p id="lighting_status" role="status">Default environment active.</p></div>`;
        const backgrounds = this.root.querySelector ('.background_gallery');
        for (const [id, name] of [['standard', 'Standard'], ['dark', 'Dark'], ['light', 'Light'], ['sunset', 'Sunset'], ['outdoor', 'Outdoor']]) {
            const button = document.createElement ('button');
            button.className = 'background_card';
            button.setAttribute ('data-preset', id);
            button.setAttribute ('aria-label', name + ' background');
            button.innerHTML = '<span class="background_swatch" aria-hidden="true"></span><span>' + name + '</span>';
            button.addEventListener ('click', () => website.ApplyBackgroundPreset (id));
            backgrounds.appendChild (button);
        }
        this.gallery = this.root.querySelector ('.hdri_gallery');
        this.RenderEnvironmentGallery ();
        this.LoadEnvironmentCatalog ();
        document.getElementById ('lighting_default').addEventListener ('click', () => {
            const before = this.Capture ();
            ++this.request;
            this.SetMode ('default');
            this.website.sceneEffects.SuspendDynamicReflection ();
            this.lighting.SetDefault ();
            this.website.sceneEffects.Refresh ();
            this.website.UpdateViewport ();
            this.SyncBackgroundVisibility ();
            this.Status ('Default dome environment active.');
            this.RecordHistory (before);
        });
        document.getElementById ('lighting_hdri').addEventListener ('click', async () => {
            this.SetMode ('hdri');
            this.website.UpdateViewport ();
            const index = Math.max (0, this.selected === null ? 0 : this.environments.findIndex ((item) => item.id === this.selected));
            const environment = this.environments[index];
            await this.Select (environment, this.gallery.children[index], true);
        });
        const adjust = () => {
            const brightness = Number (document.getElementById ('hdri_brightness').value);
            const rotation = Number (document.getElementById ('hdri_rotation').value);
            const elevation = Number (document.getElementById ('hdri_elevation').value);
            document.getElementById ('hdri_brightness_value').textContent = brightness.toFixed (2) + '×';
            document.getElementById ('hdri_rotation_value').textContent = rotation + '°';
            document.getElementById ('hdri_elevation_value').textContent = elevation + '°';
            this.website.sceneEffects.SuspendDynamicReflection ();
            this.lighting.Adjust (brightness, rotation, elevation);
            this.website.sceneEffects.Refresh ();
        };
        document.getElementById ('hdri_background').addEventListener ('change', (event) => {
            const before = this.Capture ();
            this.lighting.SetBackgroundVisible (event.target.checked);
            this.SyncBackgroundVisibility ();
            this.RecordHistory (before);
        });
        for (const id of ['hdri_brightness', 'hdri_rotation', 'hdri_elevation']) {
            const control = document.getElementById (id);
            let before = null;
            const capture = () => { if (!this.restoring && before === null) { before = this.Capture (); } };
            control.addEventListener ('pointerdown', capture);
            control.addEventListener ('focus', capture);
            control.addEventListener ('input', adjust);
            control.addEventListener ('change', () => { if (before) { this.RecordHistory (before); before = null; } });
        }
        document.getElementById ('hdri_reset').addEventListener ('click', () => {
            const before = this.Capture ();
            document.getElementById ('hdri_brightness').value = 1;
            document.getElementById ('hdri_rotation').value = 0;
            document.getElementById ('hdri_elevation').value = 0;
            adjust ();
            this.RecordHistory (before);
        });

        const effectControl = (id, key, output = null) => {
            const control = document.getElementById (id);
            let before = null;
            const capture = () => { if (!this.restoring && before === null) { before = this.Capture (); } };
            const apply = () => {
                const value = control.type === 'checkbox' ? control.checked : Number (control.value);
                this.website.sceneEffects.Set (key, value);
                if (output) { document.getElementById (output).textContent = Number (control.value).toFixed (2) + '×'; }
                this.website.sessionEditor?.MarkDirty ();
            };
            if (control.type === 'checkbox') {
                control.addEventListener ('change', () => {
                    const previous = this.Capture ();
                    apply ();
                    this.RecordHistory (previous);
                });
            } else {
                control.addEventListener ('pointerdown', capture);
                control.addEventListener ('focus', capture);
                control.addEventListener ('input', apply);
                control.addEventListener ('change', () => { if (before) { this.RecordHistory (before); before = null; } });
            }
        };
        effectControl ('environment_reflection_intensity', 'environmentIntensity', 'environment_reflection_intensity_value');
        effectControl ('model_reflections', 'modelReflections');
        effectControl ('model_reflection_intensity', 'modelReflectionIntensity', 'model_reflection_intensity_value');
        effectControl ('floor_reflection', 'floorReflection');
        effectControl ('floor_reflection_intensity', 'floorReflectionIntensity', 'floor_reflection_intensity_value');
        effectControl ('global_shadows', 'shadows');
        effectControl ('shadow_intensity', 'shadowIntensity', 'shadow_intensity_value');
        this.SyncEffects ();
        this.SyncControls ();
    }

    RenderEnvironmentGallery ()
    {
        this.gallery.replaceChildren ();
        for (const environment of this.environments) {
            const button = document.createElement ('button');
            button.className = 'hdri_card';
            button.setAttribute ('aria-pressed', String (environment.id === this.selected));
            button.innerHTML = `<img src="${environment.thumbnailUrl}" alt="" loading="lazy"><strong>${environment.name}</strong><span>${environment.category}</span>`;
            button.addEventListener ('click', () => this.Select (environment, button, true));
            this.gallery.appendChild (button);
        }
    }

    async LoadEnvironmentCatalog ()
    {
        try {
            const response = await fetch ('/api/environments', { cache : 'force-cache' });
            if (!response.ok) { return; }
            const remote = await response.json ();
            const byId = new Map (remote.map ((item) => [item.id, item]));
            this.environments = DefaultEnvironments.map ((fallback) => {
                const remoteItem = byId.get (fallback.id);
                if (!remoteItem) { return { ...fallback }; }
                return {
                    ...fallback,
                    name : remoteItem.name || fallback.name,
                    sourceUrl : remoteItem.sourceUrl || fallback.sourceUrl,
                    license : remoteItem.license || fallback.license,
                    cdnPreviewUrl : remoteItem.previewUrl || null,
                    renderUrl : remoteItem.renderUrl || null
                };
            });
            this.RenderEnvironmentGallery ();
        } catch { /* Bundled HDRIs remain the offline fallback. */ }
    }

    SyncEffects ()
    {
        const s = this.website.sceneEffects.settings;
        const values = {
            environment_reflection_intensity : s.environmentIntensity,
            model_reflections : s.modelReflections,
            model_reflection_intensity : s.modelReflectionIntensity,
            floor_reflection : s.floorReflection,
            floor_reflection_intensity : s.floorReflectionIntensity,
            global_shadows : s.shadows,
            shadow_intensity : s.shadowIntensity
        };
        for (const [id, value] of Object.entries (values)) {
            const control = document.getElementById (id);
            if (control.type === 'checkbox') { control.checked = value; } else { control.value = value; }
        }
        for (const id of ['environment_reflection_intensity', 'model_reflection_intensity', 'floor_reflection_intensity', 'shadow_intensity']) {
            document.getElementById (id + '_value').textContent = Number (document.getElementById (id).value).toFixed (2) + '×';
        }
    }

    SyncControls ()
    {
        const settings = this.website.settings;
        for (const card of this.root.querySelectorAll ('.background_card')) {
            const id = card.getAttribute ('data-preset');
            card.setAttribute ('aria-pressed', String (id === settings.backgroundPreset));
            card.querySelector ('.background_swatch').style.background = GetBackgroundGradientCSS (GetBackgroundPreset (id, settings.themeId === Theme.Dark).colors);
        }
        document.getElementById ('horizon_gradient').checked = settings.horizonGradient;
        document.getElementById ('ground_grid').checked = settings.showGroundGrid;
    }

    SyncBackgroundVisibility ()
    {
        this.website.parameters.viewerDiv.classList.toggle ('hdri_background_visible', this.lighting.enabled && this.lighting.showBackground && this.lighting.texture !== null);
    }

    SetMode (mode)
    {
        this.mode = mode;
        document.getElementById ('hdri_options').hidden = mode !== 'hdri';
        document.getElementById ('default_background_options').hidden = mode !== 'default';
        document.getElementById ('lighting_default').setAttribute ('aria-pressed', String (mode === 'default'));
        document.getElementById ('lighting_hdri').setAttribute ('aria-pressed', String (mode === 'hdri'));
        if (this.website.viewer.renderer !== null) { this.website.UpdateViewport (); }
    }

    Status (text)
    {
        document.getElementById ('lighting_status').textContent = text;
    }

    RecordHistory (before)
    {
        if (this.restoring || !before || !this.website.sessionEditor) { return; }
        const after = this.Capture ();
        if (JSON.stringify (before) === JSON.stringify (after)) { return; }
        this.website.sessionEditor.MarkDirty ();
        this.website.sessionEditor.PushHistory (
            () => this.Restore (before),
            () => this.Restore (after)
        );
    }

    Capture ()
    {
        return { mode : this.mode, environment : this.selected, background : this.lighting.showBackground, brightness : Number (document.getElementById ('hdri_brightness').value), rotation : Number (document.getElementById ('hdri_rotation').value), elevation : Number (document.getElementById ('hdri_elevation').value), effects : this.website.sceneEffects.Capture () };
    }

    async Restore (data)
    {
        const previousRestoring = this.restoring;
        this.restoring = true;
        try {
        const index = this.environments.findIndex ((item) => item.id === data.environment);
        for (const [key, min, max] of [['brightness', 0, 3], ['rotation', -180, 180], ['elevation', -90, 90]]) {
            if (Number.isFinite (data[key])) { const control = document.getElementById ('hdri_' + key); control.value = Math.max (min, Math.min (max, data[key])); control.dispatchEvent (new Event ('input')); }
        }
        document.getElementById ('hdri_background').checked = data.background === true; this.lighting.SetBackgroundVisible (data.background === true);
        if (data.effects) { this.website.sceneEffects.Restore (data.effects); this.SyncEffects (); }
        if (data.mode === 'hdri' && index >= 0) { this.SetMode ('hdri'); await this.Select (this.environments[index], this.gallery.children[index]); }
        else { ++this.request; this.SetMode ('default'); this.lighting.SetDefault (); this.website.UpdateViewport (); this.Status ('Default dome environment active.'); }
        this.SyncBackgroundVisibility ();
        } finally {
            this.restoring = previousRestoring;
        }
    }

    async Select (environment, button, recordHistory = false)
    {
        const before = recordHistory ? this.Capture () : null;
        const request = ++this.request;
        this.Status ('Loading ' + environment.name + ' preview…');
        try {
            this.website.sceneEffects.SuspendDynamicReflection ();
            // Always load the packaged preview first. It ships with the app and
            // cannot disappear because of an API/CDN outage. The remote catalog
            // is used only for the future high-resolution render upgrade.
            if (!await this.lighting.Load (environment.previewUrl, environment.renderUrl, null) || request !== this.request) { return; }
            this.selected = environment.id;
            this.SyncBackgroundVisibility ();
            for (const card of this.root.querySelectorAll ('.hdri_card')) {
                card.setAttribute ('aria-pressed', String (card === button));
            }
            document.getElementById ('hdri_credit').href = environment.sourceUrl || ('https://polyhaven.com/a/' + environment.id);
            this.website.sceneEffects.Refresh ();
            this.Status (environment.name + ' preview active · packaged 1K source' + (environment.renderUrl ? ' · high-resolution render tier loading.' : ' · high-resolution tier coming soon.'));
            if (recordHistory) { this.RecordHistory (before); }
        } catch (error) {
            if (request === this.request) {
                console.error ('Auto3D HDRI load failed', environment.id, error);
                this.Status ('Could not load ' + environment.name + ': ' + error.message);
            }
        }
    }
}
