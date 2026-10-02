import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SceneDocument, SceneHistory } from './scenedocument.js';
import { PackSession, CreateSessionArchive, OpenSessionArchive } from './sessionarchive.js';
import { ModelLibrary, WorkspaceDialog } from './modellibrary.js';
import { Selection, SelectionType } from './navigator.js';
import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../engine/threejs/threeconverter.js';
import { Direction } from '../engine/geometry/geometry.js';
import { Unit } from '../engine/model/unit.js';
import { Property, PropertyType } from '../engine/model/property.js';
import { DisplayLength } from './preferences.js';
import { LoadAnimationScene } from './sessionanimation.js';
import { ShowExportDialog } from './exportdialog.js';

function Element (tag, className, text, parent)
{
    const element = document.createElement (tag); if (className) { element.className = className; } if (text !== undefined) { element.textContent = text; } if (parent) { parent.appendChild (element); } return element;
}
function TransformState (object) { return { position : [...object.position], rotation : [...object.rotation], scale : [...object.scale] }; }

const Icons = {
    select : '<path d="m6 3 13 10-7 1-3 7Z"/>', move : '<path d="M12 2v20M2 12h20m-13-7 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
    rotate : '<path d="M20 8a9 9 0 1 0 1 8M20 3v6h-6"/>', scale : '<path d="M4 13v7h7M13 4h7v7M4 20l16-16"/>', duplicate : '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',
    visible : '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', remove : '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    focus : '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/><circle cx="12" cy="12" r="3"/>', undo : '<path d="M3 9h12a6 6 0 0 1 0 12M3 9l5-5M3 9l5 5"/>', redo : '<path d="M21 9H9a6 6 0 0 0 0 12m12-12-5-5m5 5-5 5"/>',
    add : '<path d="M12 3v18M3 12h18"/>', save : '<path d="M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7"/>', export : '<path d="M12 16V2m-4 4 4-4 4 4M4 12v9h16v-9"/>', library : '<path d="M3 4h5v17H3Zm7 0h5v17h-5Zm7 1 4-1 3 16-4 1Z"/>', update : '<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>'
};

export class SessionEditor
{
    constructor (website)
    {
        this.website = website; this.document = new SceneDocument (); this.history = new SceneHistory (); this.selected = null; this.mode = 'select'; this.busy = false; this.players = [];
        this.library = new ModelLibrary (this); this.buttons = new Map ();
        const viewer = website.viewer;
        this.controls = new TransformControls (viewer.camera, viewer.renderer.domElement); this.controls.setSize (0.8); this.helper = this.controls.getHelper (); viewer.scene.add (this.helper);
        const render = viewer.onRender;
        viewer.SetRenderHandler ((camera) => { if (render) { render (camera); } if (this.controls.camera !== camera) { this.controls.camera = camera; } });
        this.controls.addEventListener ('change', () => viewer.Render ());
        this.controls.addEventListener ('dragging-changed', (event) => {
            viewer.navigation.enabled = !event.value; viewer.navigation.clickDetector.Cancel ();
            if (event.value && this.selected) { this.dragStart = TransformState (this.selected); }
            if (!event.value && this.selected && this.dragStart) { this.RecordTransform (this.selected, this.dragStart); this.dragStart = null; this.UpdateDetails (); viewer.UpdateGroundGrid (); }
        });
        this.controls.addEventListener ('objectChange', () => {
            if (!this.selected?.threeObject) { return; }
            const object = this.selected; object.position = object.threeObject.position.toArray (); object.rotation = [object.threeObject.rotation.x, object.threeObject.rotation.y, object.threeObject.rotation.z].map (THREE.MathUtils.radToDeg); object.scale = object.threeObject.scale.toArray ();
            object.scale = object.scale.map ((value) => Math.abs (value) < 1e-6 ? 1e-6 : value); this.document.ApplyTransform (object); this.SyncInputs ();
        });
        this.CreateUI ();
        window.addEventListener ('keydown', (event) => this.KeyDown (event));
    }

    CreateUI ()
    {
        this.strip = Element ('div', 'scene_tools', undefined, this.website.parameters.viewerDiv); this.strip.setAttribute ('role', 'toolbar'); this.strip.setAttribute ('aria-label', 'Object tools');
        const tools = [['select', 'Select (V)', () => this.SetMode ('select')], ['move', 'Move (W)', () => this.SetMode ('translate')], ['rotate', 'Rotate (E)', () => this.SetMode ('rotate')], ['scale', 'Scale (R)', () => this.SetMode ('scale')], ['duplicate', 'Duplicate object (Ctrl+D)', () => this.Duplicate ()], ['visible', 'Hide or show object (H)', () => this.ToggleVisibility ()], ['remove', 'Delete object', () => this.Delete ()], ['focus', 'Focus object (F)', () => this.Focus ()], ['update', 'Update selected model', () => this.UpdateModel ()], ['undo', 'Undo object edit (Ctrl+Z)', () => this.Undo ()], ['redo', 'Redo object edit (Ctrl+Shift+Z)', () => this.Redo ()], ['add', 'Add model', () => this.AddModel ()], ['save', 'Save or open session (Ctrl+S)', () => this.library.SaveDialog (true)], ['export', 'Export', () => this.Export ()], ['library', 'Model library', () => this.library.Open ()]];
        for (const [key, label, action] of tools) {
            const button = Element ('button', 'scene_tool', undefined, this.strip); button.title = label; button.setAttribute ('aria-label', label); button.innerHTML = '<svg viewBox="0 0 26 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + Icons[key] + '</svg>';
            button.addEventListener ('click', () => this.Run (action)); this.buttons.set (key, button);
        }
        this.transformPanel = Element ('div', 'scene_transform_panel', undefined, this.website.parameters.viewerDiv); this.transformPanel.hidden = true;
        Element ('strong', null, 'Object transform', this.transformPanel); this.inputs = [];
        for (const [key, title] of [['position', 'Position'], ['rotation', 'Rotation (°)'], ['scale', 'Scale']]) {
            const group = Element ('div', 'transform_group', undefined, this.transformPanel); Element ('span', null, title, group);
            for (let axis = 0; axis < 3; axis++) {
                const label = Element ('label', null, 'XYZ'[axis], group); const input = Element ('input', null, undefined, label); input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', title + ' ' + 'XYZ'[axis]); this.inputs.push ({ input, key, axis });
                input.addEventListener ('input', () => {
                    if (!this.selected || !Number.isFinite (input.valueAsNumber) || (key === 'scale' && Math.abs (input.valueAsNumber) < 1e-6)) { return; }
                    const before = TransformState (this.selected); this.selected[key][axis] = input.valueAsNumber; this.ApplyTransform (this.selected); this.RecordTransform (this.selected, before); this.UpdateDetails ();
                });
            }
        }
        const space = Element ('select', null, undefined, this.transformPanel); space.setAttribute ('aria-label', 'Transform space'); space.add (new Option ('World', 'world')); space.add (new Option ('Local', 'local')); space.addEventListener ('change', () => this.controls.setSpace (space.value));
        const hint = Element ('p', 'section_hint', 'Position uses source coordinates; scale is a multiplier.', this.transformPanel);
        this.status = Element ('div', 'scene_status', 'Add a model to begin', this.website.parameters.viewerDiv); this.status.setAttribute ('role', 'status');
        const section = Element ('details', 'workspace_section'); section.open = true; section.id = 'session_objects'; Element ('summary', null, 'Session objects', section);
        const content = Element ('div', 'section_content', undefined, section); const actions = Element ('div', 'mode_buttons', undefined, content);
        const add = Element ('button', null, 'Add model', actions); add.addEventListener ('click', () => this.AddModel ()); const library = Element ('button', null, 'Library', actions); library.addEventListener ('click', () => this.library.Open ());
        this.objectList = Element ('div', 'session_object_list', undefined, content); this.animationPanel = Element ('div', 'animation_panel', undefined, content);
        document.getElementById ('upload_panel_content').insertBefore (section, document.getElementById ('materials_section'));
        this.sessionInput = Element ('input', null, undefined, document.body); this.sessionInput.type = 'file'; this.sessionInput.accept = '.auto3d'; this.sessionInput.hidden = true;
        this.sessionInput.addEventListener ('change', async () => { const file = this.sessionInput.files[0]; this.sessionInput.value = ''; if (file) { await this.Run (() => this.OpenArchiveFile (file)); } });
        this.website.parameters.fileInput.addEventListener ('cancel', () => { this.replaceTarget = null; });
        this.RefreshUI ();
    }

    async Run (action) { if (this.busy) { return; } try { await action (); } catch (error) { this.Status (error.message); } }
    Status (text) { this.status.textContent = text; }
    AddModel () { this.replaceTarget = null; this.website.OpenFileBrowserDialog (); }
    UpdateModel (object = this.selected) { if (object) { this.replaceTarget = object; this.website.OpenFileBrowserDialog (); } }
    OpenSessionFile () { this.sessionInput.click (); }
    async OpenArchiveFile (file) { return this.OpenArchive (await file.arrayBuffer (), false); }

    async Import (result, disposableObject)
    {
        const files = this.website.modelLoaderUI.GetImporter ().GetFileList ().GetFiles ().filter ((file) => file.content).map ((file) => ({ name : file.name, buffer : file.content }));
        const extension = result.mainFile.split ('.').pop ().toLowerCase ();
        if (extension === 'glb' || extension === 'gltf') { result.model.SetUnit (Unit.Meter); result.model.materials.forEach ((material, index) => { material.gltfMaterialIndex = index; }); }
        const target = this.replaceTarget; this.replaceTarget = null;
        const object = this.document.AddImported (result.model, result.mainFile, result.upVector);
        if (extension === 'glb' || extension === 'gltf') { object.animationAsset = { main : result.mainFile, files }; }
        if (target && this.document.objects.includes (target)) {
            Object.assign (object, TransformState (target), { id : target.id, name : target.name, visible : target.visible }); this.document.ApplyTransform (object);
            const index = this.document.objects.indexOf (target); this.document.Remove (target);
            this.history.Push ({ undo : async () => { this.document.Remove (object); this.document.Restore (target, index); this.selected = target; await this.Render (); }, redo : async () => { this.document.Remove (target); this.document.Restore (object, index); this.selected = object; await this.Render (); } });
        } else {
            const index = this.document.objects.indexOf (object); this.history.Push ({ undo : async () => { this.document.Remove (object); this.selected = null; await this.Render (); }, redo : async () => { this.document.Restore (object, index); this.selected = object; await this.Render (); } });
        }
        // The importer preview is replaced by a scene conversion; free its GPU allocations.
        disposableObject.traverse ((item) => { if (item.geometry) { item.geometry.dispose (); } if (item.material) { (Array.isArray (item.material) ? item.material : [item.material]).forEach ((material) => material.dispose ()); } });
        this.selected = object; await this.Render (true); this.Status ((target ? 'Updated ' : 'Added ') + object.name + ' · ' + this.document.objects.length + ' object(s)');
    }

    async Render (fit = false)
    {
        this.busy = true; this.controls.detach (); this.players.forEach ((player) => player.Dispose ()); this.players = [];
        try {
            if (!this.document.objects.length) { this.website.ClearModel (); this.website.SetUIState (1); this.RefreshUI (); return; }
            const output = new ModelToThreeConversionOutput ();
            const root = await new Promise ((resolve) => ConvertModelToThreeObject (this.document.model, new ModelToThreeConversionParams (), output, { onTextureLoaded : () => this.website.viewer.Render (), onModelLoaded : resolve }));
            for (let index = 0; index < this.document.objects.length; index++) {
                const object = this.document.objects[index]; object.threeObject = root.children[index]; object.threeObject.name = object.name;
                if (object.animationAsset) {
                    try { const player = await LoadAnimationScene (object, this.document.model, () => this.website.viewer.Render ()); if (player) { this.players.push (player); } else { object.animationAsset = null; } }
                    catch (error) { object.animationError = 'Animation unavailable: ' + error.message; }
                }
            }
            this.website.navigator.Clear ();
            this.website.SetUIState (2);
            this.website.OnModelLoaded ({ model : this.document.model, mainFile : this.document.name, usedFiles : this.document.objects.map ((object) => object.source), missingFiles : [] }, root, fit);
            this.document.objects.forEach ((object) => {
                let index = 0; this.document.model.EnumerateMeshInstances ((instance) => { if (this.document.Owner (instance) === object) { if (object.hiddenParts?.includes (index)) { this.website.navigator.ToggleMeshVisibility (instance.id); } index++; } });
            });
            if (this.objectUrls) { this.objectUrls.forEach (URL.revokeObjectURL); } this.objectUrls = output.objectUrls;
            this.website.sidebar.detailsPanel.modelFormat = 'SESSION';
            this.document.objects.forEach ((object) => { object.threeObject.visible = object.visible; }); this.website.UpdateMeshesVisibility ();
            this.RefreshUI (); this.Select (this.selected); this.website.viewer.Render ();
        } finally { this.busy = false; this.RefreshButtons (); }
    }

    ApplyTransform (object)
    {
        this.document.ApplyTransform (object);
        if (object.threeObject) { object.threeObject.position.fromArray (object.position); object.threeObject.rotation.set (...object.rotation.map (THREE.MathUtils.degToRad)); object.threeObject.scale.fromArray (object.scale); object.threeObject.updateMatrixWorld (true); }
        this.website.viewer.UpdateGroundGrid (); this.website.viewer.Render (); this.SyncInputs ();
    }
    RecordTransform (object, before)
    {
        const after = TransformState (object); if (JSON.stringify (before) === JSON.stringify (after)) { return; }
        const apply = (state) => { Object.assign (object, { position : [...state.position], rotation : [...state.rotation], scale : [...state.scale] }); this.ApplyTransform (object); this.UpdateDetails (); };
        this.history.Push ({ undo : () => apply (before), redo : () => apply (after) }); this.RefreshButtons ();
    }

    SetMode (mode) { this.mode = mode; this.Select (this.selected); }
    Select (object, fromNavigator = false)
    {
        this.selected = object && this.document.objects.includes (object) ? object : null;
        this.controls.detach ();
        if (this.selected?.threeObject && this.selected.visible && this.mode !== 'select') { this.controls.setMode (this.mode); this.controls.attach (this.selected.threeObject); }
        this.transformPanel.hidden = !this.selected || this.mode === 'select';
        if (!fromNavigator && this.selected) {
            let first = null; this.document.model.EnumerateMeshInstances ((instance) => { if (!first && this.document.Owner (instance) === this.selected) { first = instance.id; } });
            const current = this.website.navigator.GetSelectedMeshId (); if (first && (!current || !current.IsEqual (first))) { this.website.navigator.SetSelection (new Selection (SelectionType.Mesh, first)); }
        }
        if (!this.selected && !fromNavigator && this.website.navigator.GetSelectedMeshId ()) { this.website.navigator.SetSelection (null); }
        this.SyncInputs (); this.RefreshUI (); this.UpdateDetails (); this.website.viewer.Render ();
    }
    SelectionChanged ()
    {
        const id = this.website.navigator.GetSelectedMeshId (); const instance = id && this.website.model ? this.website.model.GetMeshInstance (id) : null;
        this.Select (this.document.Owner (instance), true);
    }
    IsVisible (instance) { return this.document.Owner (instance)?.visible !== false; }
    SyncInputs () { for (const { input, key, axis } of this.inputs) { input.value = this.selected ? Number (this.selected[key][axis].toFixed (5)) : ''; } }
    RefreshButtons ()
    {
        for (const [key, button] of this.buttons) {
            button.disabled = this.busy || (['move', 'rotate', 'scale', 'duplicate', 'visible', 'remove', 'focus', 'update'].includes (key) && !this.selected) || (key === 'export' && !this.document.objects.length) || (key === 'undo' && !this.history.undo.length) || (key === 'redo' && !this.history.redo.length);
            if (['select', 'move', 'rotate', 'scale'].includes (key)) { button.setAttribute ('aria-pressed', String ((key === 'move' ? 'translate' : key) === this.mode)); }
        }
    }
    RefreshUI ()
    {
        this.RefreshButtons (); this.objectList.replaceChildren ();
        if (!this.document.objects.length) { Element ('p', 'section_hint', 'Add multiple models and select an object to edit its placement.', this.objectList); }
        for (const object of this.document.objects) {
            const row = Element ('div', 'session_object_row', undefined, this.objectList); row.classList.toggle ('selected', object === this.selected);
            const select = Element ('button', 'object_name', object.name, row); select.title = object.source; select.setAttribute ('aria-label', 'Select ' + object.name); select.addEventListener ('click', () => this.Select (object));
            const visible = Element ('button', null, object.visible ? '◉' : '○', row); visible.title = object.visible ? 'Hide object' : 'Show object'; visible.setAttribute ('aria-label', visible.title + ' ' + object.name); visible.addEventListener ('click', () => { this.Select (object); this.ToggleVisibility (); });
            const update = Element ('button', null, '↻', row); update.title = 'Replace model, keep placement'; update.setAttribute ('aria-label', 'Update ' + object.name); update.addEventListener ('click', () => this.UpdateModel (object));
        }
        this.AnimationUI ();
    }
    UpdateDetails ()
    {
        const object = this.selected;
        if (!object?.threeObject || !this.website.model) { return; }
        const box = new THREE.Box3 ().setFromObject (object.threeObject, true); if (box.isEmpty ()) { return; } const size = box.getSize (new THREE.Vector3 ());
        const panel = this.website.sidebar.detailsPanel; const table = panel.contentDiv.querySelector ('.ov_property_table'); if (!table) { return; }
        table.querySelectorAll ('.scene_dimension').forEach ((row) => row.remove ());
        table.querySelectorAll ('.ov_property_table_row').forEach ((row) => { if (['Width (X):', 'Height (Y):', 'Depth (Z):', 'Unit:'].includes (row.querySelector ('.ov_property_table_name')?.textContent)) { row.remove (); } });
        for (const [title, value] of [['Object', object.name], ['Width (X)', DisplayLength (size.x, object.unit, panel.unitSystem)], ['Height (Y)', DisplayLength (size.y, object.unit, panel.unitSystem)], ['Depth (Z)', DisplayLength (size.z, object.unit, panel.unitSystem)]]) { panel.AddProperty (table, new Property (PropertyType.Text, title, value)).classList.add ('scene_dimension'); }
    }
    AnimationUI ()
    {
        this.animationPanel.replaceChildren (); const player = this.selected?.player;
        if (!player) { if (this.selected) { Element ('p', 'section_hint', this.selected.animationError || 'No embedded animation in this model.', this.animationPanel); } return; }
        Element ('strong', null, 'Animation', this.animationPanel);
        const clips = Element ('select', null, undefined, this.animationPanel); clips.setAttribute ('aria-label', 'Animation clip'); player.clips.forEach ((clip, index) => clips.add (new Option (clip.name || 'Clip ' + (index + 1), index))); clips.value = String (player.state.clip);
        clips.addEventListener ('change', () => { player.Choose (Number (clips.value)); this.AnimationUI (); this.UpdateDetails (); });
        const actions = Element ('div', 'mode_buttons', undefined, this.animationPanel); const play = Element ('button', null, player.state.playing ? 'Pause' : 'Play', actions); play.setAttribute ('aria-label', 'Play or pause animation'); play.addEventListener ('click', () => { player.Toggle (); play.textContent = player.state.playing ? 'Pause' : 'Play'; if (!player.state.playing) { this.UpdateDetails (); } });
        const reset = Element ('button', null, 'Reset', actions); reset.addEventListener ('click', () => { player.Seek (0); scrub.value = '0'; this.UpdateDetails (); });
        const speed = Element ('select', null, undefined, this.animationPanel); speed.setAttribute ('aria-label', 'Animation speed'); [0.25, 0.5, 1, 1.5, 2].forEach ((value) => speed.add (new Option (value + '×', value))); speed.value = String (player.state.speed); speed.addEventListener ('change', () => { player.state.speed = Number (speed.value); });
        const scrub = Element ('input', null, undefined, this.animationPanel); scrub.type = 'range'; scrub.min = '0'; scrub.max = String (player.clips[player.state.clip].duration); scrub.step = '0.01'; scrub.value = String (player.state.time); scrub.setAttribute ('aria-label', 'Animation timeline'); scrub.addEventListener ('input', () => { player.Seek (Number (scrub.value)); this.UpdateDetails (); }); player.onTime = (time) => { if (document.activeElement !== scrub) { scrub.value = String (time); } };
    }

    async Duplicate () { if (!this.selected) { return; } const object = this.document.Duplicate (this.selected); const index = this.document.objects.indexOf (object); this.history.Push ({ undo : async () => { this.document.Remove (object); this.selected = null; await this.Render (); }, redo : async () => { this.document.Restore (object, index); this.selected = object; await this.Render (); } }); this.selected = object; await this.Render (); this.Status ('Duplicated ' + object.name); }
    async Delete () { const object = this.selected; if (!object) { return; } const index = this.document.objects.indexOf (object); this.document.Remove (object); this.history.Push ({ undo : async () => { this.document.Restore (object, index); this.selected = object; await this.Render (); }, redo : async () => { this.document.Remove (object); this.selected = null; await this.Render (); } }); this.selected = null; await this.Render (); this.Status ('Deleted ' + object.name + ' · Undo is available'); }
    ToggleVisibility () { const object = this.selected; if (!object) { return; } const before = object.visible; const apply = (visible) => { object.visible = visible; object.threeObject.visible = visible; this.website.UpdateMeshesVisibility (); this.Select (object); }; apply (!before); this.history.Push ({ undo : () => apply (before), redo : () => apply (!before) }); this.RefreshButtons (); }
    Focus () { if (!this.selected) { return; } const box = new THREE.Box3 ().setFromObject (this.selected.threeObject, true); if (!box.isEmpty ()) { this.website.viewer.FitSphereToWindow (box.getBoundingSphere (new THREE.Sphere ()), true); } }
    async Undo () { await this.history.Undo (); this.RefreshUI (); }
    async Redo () { await this.history.Redo (); this.RefreshUI (); }

    Archive (objects, kind, name)
    {
        const data = PackSession (this.document, { camera : this.website.viewer.GetCamera (), backgroundPreset : this.website.settings.backgroundPreset, horizonGradient : this.website.settings.horizonGradient, showGroundGrid : this.website.settings.showGroundGrid, lighting : this.website.lightingPanel.Capture () }, objects, kind); data.name = name; return CreateSessionArchive (data);
    }
    async OpenArchive (buffer, append)
    {
        const saved = OpenSessionArchive (buffer); // Validate everything before replacing the current document.
        if (append) {
            const added = [];
            for (const source of saved.document.objects) {
                const model = saved.document.CompactModel ([source], true); model.root = model.root.GetChildNode (0);
                const object = this.document.AddImported (model, source.name, Direction.Y, false); Object.assign (object, TransformState (source), { source : source.source, visible : source.visible, hiddenParts : [...source.hiddenParts], unit : source.unit, animationAsset : source.animationAsset, playback : source.playback }); this.document.ApplyTransform (object); added.push (object);
            }
            const firstIndex = this.document.objects.length - added.length; this.history.Push ({ undo : async () => { added.forEach ((object) => this.document.Remove (object)); this.selected = null; await this.Render (); }, redo : async () => { added.forEach ((object, index) => this.document.Restore (object, firstIndex + index)); this.selected = added[0]; await this.Render (); } }); this.selected = added[0];
        } else { this.document = saved.document; this.history = new SceneHistory (); this.selected = this.document.objects[0] || null; if (this.website.hashHandler.HasHash ()) { this.website.hashHandler.SkipNextEventHandler (); this.website.hashHandler.ClearHash (); } }
        await this.Render (true);
        if (!append) {
            if (['standard', 'dark', 'light', 'sunset', 'outdoor', 'custom'].includes (saved.view.backgroundPreset)) { this.website.settings.backgroundPreset = saved.view.backgroundPreset; }
            for (const key of ['horizonGradient', 'showGroundGrid']) { if (typeof saved.view[key] === 'boolean') { this.website.settings[key] = saved.view[key]; } }
            this.website.UpdateViewport ();
            if (saved.view.lighting) { await this.website.lightingPanel.Restore (saved.view.lighting); }
        }
        if (!append && saved.view.camera) {
            const camera = this.website.viewer.GetCamera (); const data = saved.view.camera;
            if (['eye', 'center', 'up'].every ((key) => data[key] && ['x', 'y', 'z'].every ((axis) => Number.isFinite (data[key][axis])))) { ['eye', 'center', 'up'].forEach ((key) => Object.assign (camera[key], data[key])); this.website.viewer.SetCamera (camera); }
        }
        this.Status ((append ? 'Added from ' : 'Opened ') + saved.document.name);
    }
    Thumbnail (objects)
    {
        const viewer = this.website.viewer; const helperVisible = this.helper.visible; const camera = viewer.GetCamera ().Clone (); const states = this.document.objects.map ((object) => [object.threeObject, object.threeObject.visible]);
        try {
            this.helper.visible = false; viewer.SetMeshesHighlight (this.website.highlightColor, () => false); states.forEach (([root]) => { root.visible = objects.some ((object) => object.threeObject === root); });
            const box = new THREE.Box3 (); objects.forEach ((object) => box.union (new THREE.Box3 ().setFromObject (object.threeObject))); if (!box.isEmpty ()) { viewer.FitSphereToWindow (box.getBoundingSphere (new THREE.Sphere ()), false); }
            return viewer.GetImageAsDataUrl (320, 200, false);
        } finally { states.forEach (([root, visible]) => { root.visible = visible; }); viewer.SetCamera (camera); this.helper.visible = helperVisible; this.website.UpdateMeshesSelection (); viewer.Render (); }
    }
    Download (bytes, filename, mime)
    {
        const url = URL.createObjectURL (new Blob ([bytes], { type : mime })); const link = Element ('a'); link.href = url; link.download = filename.replace (/[<>:"/\\|?*]/g, '_'); document.body.appendChild (link); link.click (); link.remove (); setTimeout (() => URL.revokeObjectURL (url), 30000);
    }

    CaptureVisibility ()
    {
        if (this.busy) { return; }
        for (const object of this.document.objects) {
            object.hiddenParts = []; let index = 0;
            this.document.model.EnumerateMeshInstances ((instance) => { if (this.document.Owner (instance) === object) { if (!this.website.navigator.IsMeshVisible (instance.id)) { object.hiddenParts.push (index); } index++; } });
        }
    }
    Export ()
    {
        const dialog = WorkspaceDialog ('Export session'); const form = Element ('div', 'workspace_save_form', undefined, dialog);
        Element ('p', 'section_hint', 'GLB/glTF includes embedded animation. Hidden objects are excluded.', form);
        for (const binary of [true, false]) {
            const button = Element ('button', 'workspace_primary', binary ? 'Download GLB' : 'Download glTF', form);
            button.addEventListener ('click', async () => {
                button.disabled = true;
                try {
                    this.website.viewer.SetMeshesHighlight (this.website.highlightColor, () => false);
                    const root = this.website.viewer.mainModel.mainModel.GetRootObject (); const animations = this.players.filter ((player) => player.object.visible).flatMap ((player) => player.ExportClips ());
                    const metadata = []; root.traverse ((item) => { metadata.push ([item, item.userData]); item.userData = {}; });
                    const colors = new Map (); root.traverse ((item) => { if (item.material) { for (const material of Array.isArray (item.material) ? item.material : [item.material]) { if (!colors.has (material) && material.color) { colors.set (material, [material.color.clone (), material.emissive?.clone ()]); material.color.convertSRGBToLinear (); material.emissive?.convertSRGBToLinear (); } } } });
                    let result;
                    const exporter = new GLTFExporter (); exporter.register ((writer) => ({ name : 'SW_Auto3D_surface', writeMaterialAsync : async (material, definition) => {
                        const surface = { bumpScale : material.bumpScale, displacementScale : material.displacementScale, displacementBias : material.displacementBias };
                        for (const [key, map] of [['bumpTexture', material.bumpMap], ['displacementTexture', material.displacementMap]]) {
                            if (map) { const texture = { index : await writer.processTextureAsync (map) }; writer.applyTextureTransform (texture, map); surface[key] = texture; }
                        }
                        definition.extras = { ...definition.extras, swAuto3D : surface };
                    } }));
                    try { result = await exporter.parseAsync (root, { binary, animations, trs : true, onlyVisible : true }); }
                    finally { metadata.forEach (([item, data]) => { item.userData = data; }); colors.forEach (([color, emissive], material) => { material.color.copy (color); if (emissive) { material.emissive.copy (emissive); } }); this.website.UpdateMeshesSelection (); }
                    this.Download (binary ? result : JSON.stringify (result), this.document.name + (binary ? '.glb' : '.gltf'), binary ? 'model/gltf-binary' : 'model/gltf+json'); dialog.close (); this.Status ('Export downloaded.');
                } catch (error) { this.Status ('Export failed: ' + error.message); button.disabled = false; }
            });
        }
        const other = Element ('button', null, 'Other mesh formats', form); other.addEventListener ('click', () => { dialog.close (); ShowExportDialog (this.document.model, this.website.viewer, { isMeshVisible : (id) => this.website.navigator.IsMeshVisible (id) && this.IsVisible (this.document.model.GetMeshInstance (id)) }); });
    }
    KeyDown (event)
    {
        if (event.target.closest ('input, textarea, select, dialog, [contenteditable="true"]') || this.busy) { return; }
        const modified = event.ctrlKey || event.metaKey; const key = event.key.toLowerCase (); let action = null;
        if (modified && key === 's') { action = () => this.library.SaveDialog (true); } else if (modified && key === 'd') { action = () => this.Duplicate (); } else if (modified && key === 'z') { action = () => event.shiftKey ? this.Redo () : this.Undo (); }
        else if (!modified && !event.altKey) { action = ({ v : () => this.SetMode ('select'), w : () => this.SetMode ('translate'), e : () => this.SetMode ('rotate'), r : () => this.SetMode ('scale'), f : () => this.Focus (), h : () => this.ToggleVisibility (), delete : () => this.Delete () })[key]; }
        if (action) { event.preventDefault (); this.Run (action); }
    }
}

