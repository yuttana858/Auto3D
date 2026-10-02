import { HDRILighting } from '../engine/viewer/hdrilighting.js';
import { GetBackgroundPreset, GetBackgroundGradientCSS } from '../engine/viewer/background.js';
import { Theme } from './settings.js';

const Environments = [
    ['studio_small_09', 'Softbox studio', 'Studio · neutral'],
    ['colorful_studio', 'Colorful studio', 'Studio · warm & cool'],
    ['blue_photo_studio', 'Blue photo studio', 'Studio · cool blue'],
    ['kiara_interior', 'Kiara interior', 'Indoor · warm daylight'],
    ['autumn_forest_02', 'Autumn forest', 'Nature · overcast'],
    ['shanghai_bund', 'Shanghai Bund', 'City · night'],
    ['decor_shop', 'Decor shop', 'Retail · daylight'],
    ['gear_store', 'Gear store', 'Retail · warm lighting']
];

export class LightingPanel
{
    constructor (website)
    {
        this.website = website;
        this.lighting = new HDRILighting (website.viewer);
        this.mode = 'default';
        this.selected = null;
        this.request = 0;
        this.root = document.getElementById ('lighting_section');
        this.root.innerHTML = `<summary>Lighting</summary><div class="section_content">
            <div class="mode_buttons"><button id="lighting_default" aria-pressed="true">Default environment</button><button id="lighting_hdri" aria-pressed="false">HDRI</button></div>
            <div id="default_background_options"><p class="section_hint">Background</p><div class="background_gallery"></div><p class="section_hint">Standard follows the app theme.</p></div>
            <div id="hdri_options" hidden><p class="section_hint">Choose a surrounding light environment.</p><div class="hdri_gallery"></div>
            <div class="lighting_viewport_controls"><label><input type="checkbox" id="hdri_background"> Show HDRI background</label></div>
            <label class="slider_label" for="hdri_brightness">Brightness <output id="hdri_brightness_value">1.00×</output></label><input id="hdri_brightness" type="range" min="0" max="3" step="0.05" value="1">
            <label class="slider_label" for="hdri_rotation">Rotation <output id="hdri_rotation_value">0°</output></label><input id="hdri_rotation" type="range" min="-180" max="180" step="1" value="0">
            <label class="slider_label" for="hdri_elevation">Elevation <output id="hdri_elevation_value">0°</output></label><input id="hdri_elevation" type="range" min="-90" max="90" step="1" value="0">
            <button class="section_button" id="hdri_reset">Reset adjustments</button><p class="section_hint">Rotate or tilt to reposition the light.</p>
            <a id="hdri_credit" href="https://polyhaven.com/hdris" target="_blank" rel="noopener">Poly Haven · CC0</a></div>
            <div class="lighting_viewport_controls"><label><input type="checkbox" id="horizon_gradient"> Horizon gradient</label><label><input type="checkbox" id="ground_grid"> Ground grid</label></div>
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
        const gallery = this.root.querySelector ('.hdri_gallery');
        for (const [id, name, category] of Environments) {
            const button = document.createElement ('button');
            button.className = 'hdri_card';
            button.setAttribute ('aria-pressed', 'false');
            button.innerHTML = `<img src="assets/hdri/${id}.png" alt="" loading="lazy"><strong>${name}</strong><span>${category}</span>`;
            button.addEventListener ('click', () => this.Select (id, name, button));
            gallery.appendChild (button);
        }
        document.getElementById ('lighting_default').addEventListener ('click', () => {
            ++this.request;
            this.SetMode ('default');
            this.lighting.SetDefault ();
            this.SyncBackgroundVisibility ();
            this.Status ('Default environment active.');
        });
        document.getElementById ('lighting_hdri').addEventListener ('click', () => {
            this.SetMode ('hdri');
            const index = this.selected === null ? 0 : Environments.findIndex ((item) => item[0] === this.selected);
            const [id, name] = Environments[index];
            this.Select (id, name, gallery.children[index]);
        });
        const adjust = () => {
            const brightness = Number (document.getElementById ('hdri_brightness').value);
            const rotation = Number (document.getElementById ('hdri_rotation').value);
            const elevation = Number (document.getElementById ('hdri_elevation').value);
            document.getElementById ('hdri_brightness_value').textContent = brightness.toFixed (2) + '×';
            document.getElementById ('hdri_rotation_value').textContent = rotation + '°';
            document.getElementById ('hdri_elevation_value').textContent = elevation + '°';
            this.lighting.Adjust (brightness, rotation, elevation);
        };
        document.getElementById ('hdri_background').addEventListener ('change', (event) => {
            this.lighting.SetBackgroundVisible (event.target.checked);
            this.SyncBackgroundVisibility ();
        });
        for (const id of ['hdri_brightness', 'hdri_rotation', 'hdri_elevation']) {
            document.getElementById (id).addEventListener ('input', adjust);
        }
        document.getElementById ('hdri_reset').addEventListener ('click', () => {
            document.getElementById ('hdri_brightness').value = 1;
            document.getElementById ('hdri_rotation').value = 0;
            document.getElementById ('hdri_elevation').value = 0;
            adjust ();
        });
        this.SyncControls ();
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
    }

    Status (text)
    {
        document.getElementById ('lighting_status').textContent = text;
    }

    async Select (id, name, button)
    {
        const request = ++this.request;
        this.Status ('Loading ' + name + '…');
        try {
            if (!await this.lighting.Load ('assets/hdri/' + id + '.hdr') || request !== this.request) { return; }
            this.selected = id;
            this.SyncBackgroundVisibility ();
            for (const card of this.root.querySelectorAll ('.hdri_card')) {
                card.setAttribute ('aria-pressed', String (card === button));
            }
            document.getElementById ('hdri_credit').href = 'https://polyhaven.com/a/' + id;
            this.Status (name + ' active.');
        } catch (error) {
            if (request === this.request) {
                this.Status ('Could not load ' + name + '. Select it to retry; current lighting is retained.');
            }
        }
    }
}
