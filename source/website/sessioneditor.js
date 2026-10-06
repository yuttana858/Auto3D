import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SceneDocument, SceneHistory } from './scenedocument.js';
import { PackSession, CreateSessionArchive, OpenSessionArchive } from './sessionarchive.js';
import { ModelLibrary, WorkspaceDialog, RecoveryArchiveBuffer } from './modellibrary.js';
import { Selection, SelectionType } from './navigator.js';
import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../engine/threejs/threeconverter.js';
import { Direction } from '../engine/geometry/geometry.js';
import { Unit } from '../engine/model/unit.js';
import { Property, PropertyType } from '../engine/model/property.js';
import { DisplayLength, DisplayUnitLabel, UnitFactor, DisplaySizeFromScale, ScaleFromDisplaySize } from './preferences.js';
import { LoadAnimationScene } from './sessionanimation.js';
import { SessionTimeline, CaptureCameraState, ApplyCameraState } from './sessiontimeline.js';
import { ShowExportDialog } from './exportdialog.js';

function Element (tag, className, text, parent)
{
    const element = document.createElement (tag); if (className) { element.className = className; } if (text !== undefined) { element.textContent = text; } if (parent) { parent.appendChild (element); } return element;
}
function TransformState (object) { return { position : [...object.position], rotation : [...object.rotation], scale : [...object.scale] }; }

export function ArrayOffset (size, widthIndex, lengthIndex, heightIndex)
{
    return [widthIndex * size.x, heightIndex * size.y, lengthIndex * size.z];
}

export function DropToFloorDelta (box, upVector)
{
    const axis = upVector.direction === Direction.X ? 0 : upVector.direction === Direction.Z ? 2 : 1;
    const boundary = upVector.isFlipped ? box.max.getComponent (axis) : box.min.getComponent (axis);
    const delta = [0, 0, 0];
    delta[axis] = -boundary;
    return delta;
}

const Icons = {
    select : '<path d="m6 3 13 10-7 1-3 7Z"/>', move : '<path d="M12 2v20M2 12h20m-13-7 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
    rotate : '<path d="M20 8a9 9 0 1 0 1 8M20 3v6h-6"/>', scale : '<path d="M4 13v7h7M13 4h7v7M4 20l16-16"/>', duplicate : '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',
    visible : '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', remove : '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    focus : '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/><circle cx="12" cy="12" r="3"/>', undo : '<path d="M3 9h12a6 6 0 0 1 0 12M3 9l5-5M3 9l5 5"/>', redo : '<path d="M21 9H9a6 6 0 0 0 0 12m12-12-5-5m5 5-5 5"/>',
    fit : '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',
    array : '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    floor : '<path d="M3 20h18M12 3v12m-4-4 4 4 4-4"/>',
    add : '<path d="M12 3v18M3 12h18"/>', save : '<path d="M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7"/>', export : '<path d="M12 16V2m-4 4 4-4 4 4M4 12v9h16v-9"/>', library : '<path d="M3 4h5v17H3Zm7 0h5v17h-5Zm7 1 4-1 3 16-4 1Z"/>', ai : '<path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Z"/><path d="M19 14l.9 2.6L22.5 18l-2.6.9L19 21.5l-.9-2.6-2.6-.9 2.6-1.4L19 14Z"/>', update : '<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>'
};

export class SessionEditor
{
    constructor (website)
    {
        this.website = website; this.document = new SceneDocument (); this.history = new SceneHistory (() => this.MarkDirty ()); this.selected = null; this.mode = 'select'; this.busy = false; this.players = []; this.modelPreview = null;
        this.timeline = new SessionTimeline (this);
        this.library = new ModelLibrary (this); this.buttons = new Map (); this.dirty = false; this.recoveryTimer = null; this.recoveryPromptOpen = false; this.recoveryPromptHandled = false;
        const viewer = website.viewer;
        this.selectionBounds = new THREE.Box3 ();
        this.selectionBox = new THREE.Box3Helper (this.selectionBounds, 0x5aaee6);
        this.selectionBox.visible = false;
        this.selectionBox.renderOrder = 10000;
        viewer.scene.add (this.selectionBox);
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
        const headerLibrary = Element ('button', 'header_library_button', undefined, document.getElementById ('header_buttons'));
        headerLibrary.title = 'Saved models and sessions'; headerLibrary.setAttribute ('aria-label', 'Library');
        headerLibrary.innerHTML = '<svg viewBox="0 0 26 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6">' + Icons.library + '</svg><span>Library</span>';
        headerLibrary.addEventListener ('click', () => this.library.Open ());
        const headerExport = Element ('button', 'header_library_button header_export_button', undefined, document.getElementById ('header_buttons'));
        headerExport.title = 'Export current session'; headerExport.setAttribute ('aria-label', 'Export');
        headerExport.innerHTML = '<svg viewBox="0 0 26 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6">' + Icons.export + '</svg><span>Export</span>';
        headerExport.addEventListener ('click', () => this.Export ());
        this.headerExport = headerExport;
        this.website.parameters.fileNameDiv.classList.add ('editable_name');
        this.website.parameters.fileNameDiv.title = 'Click to rename current session';
        this.website.parameters.fileNameDiv.addEventListener ('click', () => { if (this.document.objects.length) { this.RenameSession (); } });
        const query = new URLSearchParams (window.location.search);
        this.shareId = query.get ('share');
        this.shareToken = query.get ('view');
        this.readOnly = this.shareId !== null || this.shareToken !== null;
        if (this.readOnly) {
            document.body.classList.add ('shared_view');
            if (this.shareToken !== null) {
                document.body.classList.add ('mini_shared_view');
                const compact = window.matchMedia ('(max-width: 800px)').matches || navigator.maxTouchPoints > 0;
                document.body.classList.toggle ('share_mobile', compact);
            }
            this.RefreshButtons ();
        }
        window.addEventListener ('keydown', (event) => this.KeyDown (event));
        window.addEventListener ('beforeunload', (event) => {
            if (!this.dirty || this.readOnly) { return; }
            event.preventDefault (); event.returnValue = '';
        });
        if (!this.readOnly && !this.website.hashHandler.HasHash ()) { setTimeout (() => this.OfferRecovery (), 0); }
    }

    async LoadShared ()
    {
        if (!this.readOnly) { return; }
        this.Status ('Loading shared view…');
        try {
            if (this.shareToken !== null) {
                const info = await this.library.sharedStorage.ShareInfo (this.shareToken);
                const access = await this.OpenShareLink (info);
                await this.OpenArchive (access.archive, false);
                this.ConfigureMiniViewer (info, access.archive);
                this.Status ('Shared view · ' + info.name);
                return;
            }
            const item = await this.library.sharedStorage.Get (this.shareId);
            await this.OpenArchive (await this.library.sharedStorage.Archive (item), false);
            this.Status ('Shared view · ' + item.name);
        } catch (error) { this.Status (error.message); }
    }

    async OpenShareLink (info)
    {
        if (!info.codeRequired) {
            return { archive : await this.library.sharedStorage.ShareArchive (this.shareToken, ''), code : '' };
        }
        return new Promise ((resolve, reject) => {
            const dialog = WorkspaceDialog ('Access shared model');
            const form = Element ('form', 'workspace_save_form', undefined, dialog);
            const hint = Element ('p', 'section_hint', 'Enter the 4-digit access code supplied with this link.', form);
            const input = Element ('input', null, undefined, form); input.type = 'password'; input.inputMode = 'numeric'; input.maxLength = 4; input.pattern = '[0-9]{4}'; input.autocomplete = 'one-time-code'; input.setAttribute ('aria-label', 'Four digit access code');
            const status = Element ('p', 'section_hint', '', form); status.setAttribute ('role', 'status');
            const submit = Element ('button', 'workspace_primary', 'Open model', form); submit.type = 'submit';
            let settled = false;
            input.addEventListener ('input', () => { input.value = input.value.replace (/\D/g, '').slice (0, 4); });
            form.addEventListener ('submit', async (event) => {
                event.preventDefault ();
                if (!/^\d{4}$/.test (input.value)) { status.textContent = 'Enter exactly four digits.'; return; }
                submit.disabled = true; status.textContent = 'Checking code…';
                try {
                    const archive = await this.library.sharedStorage.ShareArchive (this.shareToken, input.value);
                    settled = true; dialog.close (); resolve ({ archive, code : input.value });
                } catch (error) { status.textContent = error.message; submit.disabled = false; input.select (); }
            });
            dialog.addEventListener ('close', () => { if (!settled) { reject (new Error ('Shared view access was canceled.')); } }, { once : true });
            setTimeout (() => input.focus (), 0);
        });
    }

    ConfigureMiniViewer (info, archive)
    {
        document.title = info.name + ' · Auto3D';
        this.website.parameters.fileNameDiv.textContent = info.name;
        if (info.allowDownload) {
            const download = Element ('button', 'header_share_download', undefined, document.getElementById ('header_buttons'));
            download.title = 'Download Auto3D session'; download.setAttribute ('aria-label', 'Download shared model');
            download.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></svg><span>Download</span>';
            download.addEventListener ('click', () => this.Download (archive, info.name + '.auto3d', 'application/octet-stream'));
        }
        const touch = Element ('div', 'share_touch_hint', 'Drag to orbit · Pinch to zoom · Two-finger drag to pan', this.website.parameters.viewerDiv);
        touch.setAttribute ('aria-hidden', 'true');
        const resize = () => {
            const compact = window.matchMedia ('(max-width: 800px)').matches || navigator.maxTouchPoints > 0;
            document.body.classList.toggle ('share_mobile', compact);
            this.website.layouter.Resize ();
        };
        window.addEventListener ('orientationchange', resize);
        window.visualViewport?.addEventListener ('resize', resize);
        resize ();
    }

    CreateUI ()
    {
        this.strip = Element ('div', 'scene_tools', undefined, this.website.parameters.viewerDiv); this.strip.setAttribute ('role', 'toolbar'); this.strip.setAttribute ('aria-label', 'Object tools');
        const tools = [['select', 'Select (V)', () => this.SetMode ('select')], ['move', 'Move (W)', () => this.SetMode ('translate')], ['rotate', 'Rotate (E)', () => this.SetMode ('rotate')], ['scale', 'Scale (R)', () => this.SetMode ('scale')], ['duplicate', 'Duplicate object (Ctrl+D)', () => this.Duplicate ()], ['array', 'Array selected object', () => this.ArrayDialog ()], ['floor', 'Drop selected object to floor', () => this.DropToFloor ()], ['visible', 'Hide or show object (H)', () => this.ToggleVisibility ()], ['remove', 'Delete object', () => this.Delete ()], ['focus', 'Focus object (F)', () => this.Focus ()], ['fit', 'Fit all objects to screen', () => this.FitScene ()], ['update', 'Update selected model', () => this.UpdateModel ()], ['undo', 'Undo object edit (Ctrl+Z)', () => this.Undo ()], ['redo', 'Redo object edit (Ctrl+Shift+Z)', () => this.Redo ()], ['add', 'Add model', () => this.AddModel ()], ['save', 'Save or open session (Ctrl+S)', () => this.library.SaveDialog (true)], ['export', 'Export', () => this.Export ()], ['library', 'Model library', () => this.library.Open ()], ['ai', 'AI Generative', () => this.website.aiWorkspace?.Open ()]];
        for (const [key, label, action] of tools) {
            const button = Element ('button', 'scene_tool', undefined, this.strip); button.title = label; button.setAttribute ('aria-label', label); button.innerHTML = '<svg viewBox="0 0 26 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + Icons[key] + '</svg>';
            button.addEventListener ('click', () => this.Run (action)); this.buttons.set (key, button);
        }
        this.transformPanel = Element ('div', 'scene_transform_panel', undefined, this.website.parameters.viewerDiv); this.transformPanel.hidden = true;
        Element ('strong', null, 'Object transform', this.transformPanel); this.inputs = [];
        for (const [key, title] of [['position', 'Position'], ['rotation', 'Rotation (°)'], ['scale', 'Size']]) {
            const group = Element ('div', 'transform_group', undefined, this.transformPanel); const heading = Element ('span', null, title, group);
            if (key === 'scale') { this.scaleHeading = heading; }
            for (let axis = 0; axis < 3; axis++) {
                const label = Element ('label', null, 'XYZ'[axis], group); const input = Element ('input', null, undefined, label); input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', title + ' ' + 'XYZ'[axis]); this.inputs.push ({ input, key, axis });
                input.addEventListener ('input', () => {
                    if (!this.selected || !Number.isFinite (input.valueAsNumber)) { return; }
                    const before = TransformState (this.selected);
                    if (key === 'scale') {
                        const factor = UnitFactor (this.selected.unit, this.website.preferences.units);
                        const base = this.GetObjectBaseSize (this.selected);
                        if (factor !== null && base[axis] > 1e-12) {
                            if (input.valueAsNumber <= 0) { return; }
                            const nextScale = ScaleFromDisplaySize (base[axis], input.valueAsNumber, this.selected.unit, this.website.preferences.units);
                            if (nextScale === null) { return; }
                            this.selected.scale[axis] = nextScale;
                        } else {
                            if (Math.abs (input.valueAsNumber) < 1e-6) { return; }
                            this.selected.scale[axis] = input.valueAsNumber;
                        }
                    } else {
                        this.selected[key][axis] = input.valueAsNumber;
                    }
                    this.ApplyTransform (this.selected); this.RecordTransform (this.selected, before); this.UpdateDetails ();
                });
            }
        }
        const space = Element ('select', null, undefined, this.transformPanel); space.setAttribute ('aria-label', 'Transform space'); space.add (new Option ('World', 'world')); space.add (new Option ('Local', 'local')); space.addEventListener ('change', () => this.controls.setSpace (space.value));
        this.transformHint = Element ('p', 'section_hint', 'Position uses source coordinates. Size follows the global unit preference.', this.transformPanel);
        this.status = Element ('div', 'scene_status', 'Add a model to begin', this.website.parameters.viewerDiv); this.status.setAttribute ('role', 'status');
        const section = Element ('details', 'workspace_section'); section.open = true; section.id = 'session_objects'; Element ('summary', null, 'Session objects', section);
        const content = Element ('div', 'section_content', undefined, section); const actions = Element ('div', 'mode_buttons', undefined, content);
        const add = Element ('button', null, 'Add model', actions); add.addEventListener ('click', () => this.AddModel ()); const library = Element ('button', null, 'Library', actions); library.addEventListener ('click', () => this.library.Open ());
        this.objectList = Element ('div', 'session_object_list', undefined, content);
        const animationSection = Element ('details', 'workspace_section'); animationSection.open = true; animationSection.id = 'session_animation'; Element ('summary', null, 'Animation', animationSection);
        const animationContent = Element ('div', 'section_content', undefined, animationSection); this.animationPanel = Element ('div', 'animation_panel', undefined, animationContent);
        const uploadContent = document.getElementById ('upload_panel_content'); const materials = document.getElementById ('materials_section');
        uploadContent.insertBefore (section, materials); uploadContent.insertBefore (animationSection, materials);
        this.sessionInput = Element ('input', null, undefined, document.body); this.sessionInput.type = 'file'; this.sessionInput.accept = '.auto3d'; this.sessionInput.hidden = true;
        this.sessionInput.addEventListener ('change', async () => { const file = this.sessionInput.files[0]; this.sessionInput.value = ''; if (file) { await this.Run (() => this.OpenArchiveFile (file)); } });
        this.website.parameters.fileInput.addEventListener ('cancel', () => { this.replaceTarget = null; });
        this.RefreshUI ();
    }

    async Run (action) { if (this.busy) { return; } try { await action (); } catch (error) { this.Status (error.message); } }
    Status (text) { this.status.textContent = text; }

    PushHistory (undo, redo)
    {
        this.history.Push ({ undo, redo });
        this.RefreshButtons ();
    }

    RenameObject (object)
    {
        if (this.readOnly || !object) { return; }
        const previous = object.name;
        const value = window.prompt ('Rename session model', previous);
        if (value === null) { return; }
        const next = value.trim ().slice (0, 100);
        if (!next || next === previous) { return; }
        const apply = (name) => {
            object.name = name;
            object.threeObject && (object.threeObject.name = name);
            this.document.ApplyTransform (object);
            this.RefreshUI (); this.UpdateDetails (); this.MarkDirty ();
        };
        apply (next);
        this.PushHistory (() => apply (previous), () => apply (next));
    }

    RenameSession ()
    {
        if (this.readOnly) { return; }
        const previous = this.document.name;
        const value = window.prompt ('Rename session', previous);
        if (value === null) { return; }
        const next = value.trim ().slice (0, 100);
        if (!next || next === previous) { return; }
        const apply = (name) => {
            this.document.name = name;
            this.website.parameters.fileNameDiv.textContent = name;
            this.MarkDirty ();
        };
        apply (next);
        this.PushHistory (() => apply (previous), () => apply (next));
    }

    MarkDirty ()
    {
        if (this.readOnly) { return; }
        this.dirty = true;
        if (this.recoveryTimer) { clearTimeout (this.recoveryTimer); }
        if (!this.document.objects.length) { this.library.deviceStorage.ClearRecovery ().catch (() => {}); return; }
        this.recoveryTimer = setTimeout (() => this.SaveRecovery (), 1500);
    }

    async SaveRecovery ()
    {
        this.recoveryTimer = null;
        if (!this.dirty || this.readOnly || !this.document.objects.length) { return; }
        try {
            const archive = this.Archive (this.document.objects, 'session', this.document.name);
            await this.library.deviceStorage.SaveRecovery (archive, this.document.name);
        } catch (error) { console.warn ('Auto3D recovery save failed.', error); }
    }

    async MarkClean ()
    {
        if (this.readOnly) { return; }
        this.dirty = false;
        if (this.recoveryTimer) { clearTimeout (this.recoveryTimer); this.recoveryTimer = null; }
        try { await this.library.deviceStorage.ClearRecovery (); } catch { /* Recovery cleanup is best effort. */ }
    }

    async OfferRecovery ()
    {
        if (this.recoveryPromptOpen || this.recoveryPromptHandled) { return; }
        let recovery = null;
        try { recovery = await this.library.deviceStorage.GetRecovery (); }
        catch (error) { console.warn ('Auto3D recovery lookup failed.', error); return; }
        if (!recovery?.archive || this.document.objects.length) { return; }

        let buffer = null;
        let validationError = null;
        try {
            buffer = await RecoveryArchiveBuffer (recovery.archive);
            OpenSessionArchive (buffer);
        } catch (error) {
            validationError = error;
        }

        this.recoveryPromptOpen = true;
        const dialog = WorkspaceDialog ('Recover unsaved session');
        const body = document.createElement ('div'); body.className = 'workspace_save_form';
        const timestamp = recovery.updatedAt ? new Date (recovery.updatedAt) : null;
        const message = document.createElement ('p');
        message.textContent = validationError
            ? 'The saved recovery checkpoint cannot be opened: ' + validationError.message
            : 'Auto3D found an unsaved recovery checkpoint' + (timestamp && !Number.isNaN (timestamp.getTime ()) ? ' from ' + timestamp.toLocaleString () : '') + '.';
        const restore = document.createElement ('button'); restore.type = 'button'; restore.className = 'workspace_primary'; restore.textContent = 'Restore recovery'; restore.disabled = Boolean (validationError);
        const discard = document.createElement ('button'); discard.type = 'button'; discard.textContent = validationError ? 'Discard invalid recovery' : 'Discard recovery';

        const dismiss = () => {
            this.recoveryPromptHandled = true;
            this.recoveryPromptOpen = false;
            if (dialog.open) { dialog.close (); }
        };

        restore.addEventListener ('click', async () => {
            if (!buffer) { return; }
            dismiss ();
            this.Status ('Restoring recovery…');
            try {
                await this.OpenArchive (buffer.slice (0), false, true);
                await this.library.deviceStorage.ClearRecovery ().catch (() => {});
                this.Status ('Recovered unsaved session · Save to keep it.');
            } catch (error) {
                this.Status ('Recovery could not be restored: ' + error.message);
            }
        }, { once : true });

        discard.addEventListener ('click', async () => {
            dismiss ();
            try {
                await this.library.deviceStorage.ClearRecovery ();
                this.Status ('Recovery checkpoint discarded.');
            } catch (error) {
                this.Status ('Recovery could not be discarded: ' + error.message);
            }
        }, { once : true });

        dialog.addEventListener ('close', () => { this.recoveryPromptOpen = false; }, { once : true });
        body.append (message, restore, discard); dialog.appendChild (body);
    }
    AddModel () { if (this.readOnly) { return; } this.replaceTarget = null; this.website.OpenFileBrowserDialog (); }
    UpdateModel (object = this.selected) { if (!this.readOnly && object) { this.replaceTarget = object; this.website.OpenFileBrowserDialog (); } }
    OpenSessionFile () { if (!this.readOnly) { this.sessionInput.click (); } }
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
            Object.assign (object, TransformState (target), { id : target.id, name : target.name, visible : target.visible, userData : { ...(target.userData || {}) }, castShadow : target.castShadow !== false, receiveShadow : target.receiveShadow !== false }); this.document.ApplyTransform (object);
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
            if (!this.document.objects.length) { this.selectionBox.visible = false; this.DisposeModelPreview (); this.website.ClearModel (); this.website.SetUIState (1); this.RefreshUI (); return; }
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
            this.website.sceneEffects?.ApplyObjectSettings (this.document.objects);
            this.RefreshUI (); this.Select (this.selected); this.website.sceneEffects?.Refresh (); this.website.viewer.Render ();
        } finally { this.busy = false; this.RefreshButtons (); }
    }

    ApplyTransform (object)
    {
        this.document.ApplyTransform (object);
        if (object.threeObject) { object.threeObject.position.fromArray (object.position); object.threeObject.rotation.set (...object.rotation.map (THREE.MathUtils.degToRad)); object.threeObject.scale.fromArray (object.scale); object.threeObject.updateMatrixWorld (true); }
        this.website.viewer.UpdateGroundGrid (); this.UpdateSelectionBox (); this.website.sceneEffects?.Refresh (); this.website.viewer.Render (); this.SyncInputs ();
    }
    RecordTransform (object, before)
    {
        const after = TransformState (object); if (JSON.stringify (before) === JSON.stringify (after)) { return; }
        const apply = (state) => { Object.assign (object, { position : [...state.position], rotation : [...state.rotation], scale : [...state.scale] }); this.ApplyTransform (object); this.UpdateDetails (); };
        this.history.Push ({ undo : () => apply (before), redo : () => apply (after) }); this.RefreshButtons ();
    }

    SetMode (mode) { if (this.readOnly && mode !== 'select') { return; } this.mode = mode; this.Select (this.selected); }
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
        this.UpdateSelectionBox (); this.SyncInputs (); this.RefreshUI (); this.UpdateDetails (); this.website.viewer.Render ();
    }
    SelectionChanged ()
    {
        const id = this.website.navigator.GetSelectedMeshId (); const instance = id && this.website.model ? this.website.model.GetMeshInstance (id) : null;
        this.Select (this.document.Owner (instance), true);
    }
    IsVisible (instance) { return this.document.Owner (instance)?.visible !== false; }
    GetObjectBaseSize (object)
    {
        if (!object?.threeObject) { return [0, 0, 0]; }
        const clone = object.threeObject.clone (true);
        clone.position.set (0, 0, 0); clone.rotation.set (0, 0, 0); clone.scale.set (1, 1, 1); clone.updateMatrixWorld (true);
        const size = new THREE.Box3 ().setFromObject (clone, true).getSize (new THREE.Vector3 ());
        return size.toArray ();
    }

    UpdateSelectionBox ()
    {
        if (!this.selected?.threeObject || !this.selected.visible) {
            this.selectionBox.visible = false;
            return;
        }
        this.selectionBounds.setFromObject (this.selected.threeObject, true);
        this.selectionBox.visible = !this.selectionBounds.isEmpty ();
        this.selectionBox.updateMatrixWorld (true);
    }

    SyncInputs ()
    {
        const units = this.website.preferences?.units || 'metric';
        const factor = this.selected ? UnitFactor (this.selected.unit, units) : null;
        const base = this.selected ? this.GetObjectBaseSize (this.selected) : [0, 0, 0];
        if (this.scaleHeading) {
            this.scaleHeading.textContent = factor === null ? 'Scale (×)' : 'Size (' + DisplayUnitLabel (units) + ')';
        }
        if (this.transformHint) {
            this.transformHint.textContent = factor === null ? 'Position uses source coordinates; scale is a multiplier because this model has no declared unit.' : 'Position uses source coordinates. Size follows the global ' + DisplayUnitLabel (units) + ' preference.';
        }
        for (const { input, key, axis } of this.inputs) {
            if (!this.selected) { input.value = ''; continue; }
            const value = key === 'scale' ? DisplaySizeFromScale (base[axis], this.selected.scale[axis], this.selected.unit, units) : this.selected[key][axis];
            input.value = Number (value.toFixed (5));
        }
    }

    UnitsChanged ()
    {
        this.SyncInputs ();
        this.UpdateDetails ();
    }
    RefreshButtons ()
    {
        for (const [key, button] of this.buttons) {
            button.disabled = this.busy || (this.readOnly && !['select', 'focus', 'fit'].includes (key)) || (['move', 'rotate', 'scale', 'duplicate', 'array', 'floor', 'visible', 'remove', 'focus', 'update'].includes (key) && !this.selected) || (key === 'export' && !this.document.objects.length) || (key === 'undo' && !this.history.undo.length) || (key === 'redo' && !this.history.redo.length);
            if (['select', 'move', 'rotate', 'scale'].includes (key)) { button.setAttribute ('aria-pressed', String ((key === 'move' ? 'translate' : key) === this.mode)); }
        }
        if (this.headerExport) { this.headerExport.disabled = this.busy || this.readOnly || !this.document.objects.length; }
    }
    RefreshUI ()
    {
        this.RefreshButtons (); this.objectList.replaceChildren ();
        if (!this.document.objects.length) { Element ('p', 'section_hint', 'Add multiple models and select an object to edit its placement.', this.objectList); }
        for (const object of this.document.objects) {
            const row = Element ('div', 'session_object_row', undefined, this.objectList); row.classList.toggle ('selected', object === this.selected);
            const select = Element ('button', 'object_name editable_name', object.name, row);
            select.title = object === this.selected ? 'Click again to rename · ' + object.source : 'Select ' + object.name + ' · ' + object.source;
            select.setAttribute ('aria-label', (object === this.selected ? 'Rename ' : 'Select ') + object.name);
            select.addEventListener ('mouseenter', () => object.threeObject?.traverse ((item) => { if (item.isMesh) { item.userData.auto3dNameHover = true; } }));
            select.addEventListener ('mouseleave', () => object.threeObject?.traverse ((item) => { if (item.isMesh) { delete item.userData.auto3dNameHover; } }));
            select.addEventListener ('click', () => { if (object === this.selected) { this.RenameObject (object); } else { this.Select (object); } });
            const visible = Element ('button', null, object.visible ? '◉' : '○', row); visible.title = object.visible ? 'Hide object' : 'Show object'; visible.setAttribute ('aria-label', visible.title + ' ' + object.name); visible.addEventListener ('click', () => { this.Select (object); this.ToggleVisibility (); });
            const update = Element ('button', null, '↻', row); update.title = 'Replace model, keep placement'; update.setAttribute ('aria-label', 'Update ' + object.name); update.addEventListener ('click', () => this.UpdateModel (object));
        }
        this.AnimationUI ();
    }
    UpdateDetails ()
    {
        const object = this.selected;
        if (!object?.threeObject || !this.website.model) { this.DisposeModelPreview (); return; }
        const panel = this.website.sidebar.detailsPanel;
        const table = panel.contentDiv.querySelector ('.ov_property_table');
        if (!table) { return; }
        this.UpdateModelPreview (panel, object);

        table.querySelectorAll ('.scene_dimension').forEach ((row) => row.remove ());
        table.querySelectorAll ('.ov_property_table_row').forEach ((row) => {
            if (['Width (X):', 'Height (Y):', 'Depth (Z):', 'Unit:', 'Object:'].includes (row.querySelector ('.ov_property_table_name')?.textContent)) { row.remove (); }
        });
        const base = this.GetObjectBaseSize (object);
        const units = this.website.preferences.units;
        const unitLabel = UnitFactor (object.unit, units) === null ? 'model units' : DisplayUnitLabel (units);
        const sizes = [
            DisplaySizeFromScale (base[0], object.scale[0], object.unit, units),
            DisplaySizeFromScale (base[2], object.scale[2], object.unit, units),
            DisplaySizeFromScale (base[1], object.scale[1], object.unit, units)
        ];
        for (const [title, value] of [
            ['Object', object.name],
            ['Width (W / X)', DisplayLength (base[0] * Math.abs (object.scale[0]), object.unit, units)],
            ['Length (L / Z)', DisplayLength (base[2] * Math.abs (object.scale[2]), object.unit, units)],
            ['Height (H / Y)', DisplayLength (base[1] * Math.abs (object.scale[1]), object.unit, units)]
        ]) {
            panel.AddProperty (table, new Property (PropertyType.Text, title, value)).classList.add ('scene_dimension');
        }

        panel.contentDiv.querySelectorAll ('.scene_object_details').forEach ((item) => item.remove ());
        const details = Element ('div', 'scene_object_details', undefined, panel.contentDiv);
        Element ('strong', null, 'Model size', details);
        Element ('p', 'section_hint', 'W = X · L = Z · H = Y · ' + unitLabel, details);
        const dimensionGrid = Element ('div', 'scene_dimension_editor', undefined, details);
        for (const [label, axis, value] of [['W', 0, sizes[0]], ['L', 2, sizes[1]], ['H', 1, sizes[2]]]) {
            const field = Element ('label', null, label, dimensionGrid);
            const input = Element ('input', null, undefined, field);
            input.type = 'number'; input.step = 'any'; input.min = '0.000001'; input.value = Number (value.toFixed (5));
            input.disabled = this.readOnly;
            input.setAttribute ('aria-label', label + ' dimension in ' + unitLabel);
            input.addEventListener ('change', () => {
                if (!Number.isFinite (input.valueAsNumber) || input.valueAsNumber <= 0) { this.UpdateDetails (); return; }
                this.SetObjectDisplayDimension (object, axis, input.valueAsNumber);
            });
        }

        Element ('strong', null, 'Shadows', details);
        const shadowOptions = Element ('div', 'scene_shadow_options', undefined, details);
        for (const [key, title] of [['castShadow', 'Cast shadows'], ['receiveShadow', 'Receive shadows']]) {
            const label = Element ('label', null, undefined, shadowOptions);
            const input = Element ('input', null, undefined, label); input.type = 'checkbox'; input.checked = object[key] !== false; input.disabled = this.readOnly;
            label.appendChild (document.createTextNode (' ' + title));
            input.addEventListener ('change', () => {
                const before = object[key] !== false; const after = input.checked;
                const apply = (value) => { object[key] = value; this.website.sceneEffects?.ApplyObjectSettings (this.document.objects); this.website.viewer.Render (); this.MarkDirty (); };
                apply (after);
                this.PushHistory (() => apply (before), () => apply (after));
            });
        }
        Element ('p', 'section_hint', 'Cast + Receive enables self-shadowing. Cast affects other receiving models; Receive accepts shadows from other casters.', details);

        Element ('strong', null, 'User data', details);
        const userDataList = Element ('div', 'scene_user_data', undefined, details);
        const renderUserData = () => {
            userDataList.replaceChildren ();
            const entries = Object.entries (object.userData || {});
            if (!entries.length) { Element ('p', 'section_hint', 'No user data entered.', userDataList); }
            entries.forEach (([key, value]) => {
                const row = Element ('div', 'scene_user_data_row', undefined, userDataList);
                const keyInput = Element ('input', null, undefined, row); keyInput.value = key; keyInput.maxLength = 100; keyInput.disabled = this.readOnly; keyInput.setAttribute ('aria-label', 'User data name');
                const valueInput = Element ('input', null, undefined, row); valueInput.value = value; valueInput.maxLength = 2000; valueInput.disabled = this.readOnly; valueInput.setAttribute ('aria-label', 'User data value');
                const remove = Element ('button', null, '×', row); remove.title = 'Remove user data field'; remove.disabled = this.readOnly;
                const save = () => {
                    const nextKey = keyInput.value.trim ().slice (0, 100);
                    const nextValue = valueInput.value.slice (0, 2000);
                    if (!nextKey || ['__proto__', 'prototype', 'constructor'].includes (nextKey)) { keyInput.value = key; return; }
                    if (nextKey !== key) { delete object.userData[key]; }
                    object.userData[nextKey] = nextValue;
                    this.MarkDirty ();
                    key = nextKey;
                };
                keyInput.addEventListener ('change', save); valueInput.addEventListener ('change', save);
                remove.addEventListener ('click', () => { delete object.userData[key]; this.MarkDirty (); renderUserData (); });
            });
        };
        renderUserData ();
        if (!this.readOnly) {
            const add = Element ('button', null, '+ Add user data field', details);
            add.addEventListener ('click', () => {
                object.userData ||= {};
                let index = 1; let key = 'Field ' + index;
                while (Object.hasOwn (object.userData, key)) { key = 'Field ' + (++index); }
                object.userData[key] = '';
                this.MarkDirty (); this.UpdateDetails ();
            });
        }
        panel.Resize ();
    }

    DisposeModelPreview ()
    {
        if (!this.modelPreview) { return; }
        this.modelPreview.renderer.dispose ();
        this.modelPreview.element.remove ();
        this.modelPreview = null;
    }

    UpdateModelPreview (panel, object)
    {
        if (this.modelPreview && this.modelPreview.object === object && this.modelPreview.root === object.threeObject && this.modelPreview.element.isConnected) { return; }
        this.DisposeModelPreview ();

        const element = Element ('div', 'scene_model_preview');
        const title = Element ('div', 'scene_model_preview_title', undefined, element); Element ('strong', null, 'Model preview', title); Element ('span', null, 'Drag X/Y · Shift+drag Z', title);
        const canvas = Element ('canvas', 'scene_model_preview_canvas', undefined, element); canvas.width = 300; canvas.height = 190; canvas.setAttribute ('aria-label', 'Interactive model preview'); canvas.setAttribute ('role', 'img');
        panel.contentDiv.insertBefore (element, panel.contentDiv.firstChild);

        const renderer = new THREE.WebGLRenderer ({ canvas, antialias : true, alpha : true, preserveDrawingBuffer : false });
        renderer.setPixelRatio (Math.min (window.devicePixelRatio || 1, 2)); renderer.setSize (300, 190, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene ();
        const camera = new THREE.PerspectiveCamera (32, 300 / 190, 0.01, 100); camera.position.set (1.8, 1.25, 2.6); camera.lookAt (0, 0, 0);
        scene.add (new THREE.HemisphereLight (0xffffff, 0x777777, 2.0));
        const key = new THREE.DirectionalLight (0xffffff, 2.4); key.position.set (3, 4, 5); scene.add (key);

        const pivot = new THREE.Group (); scene.add (pivot);
        const clone = object.threeObject.clone (true); clone.position.copy (object.threeObject.position); clone.rotation.copy (object.threeObject.rotation); clone.scale.copy (object.threeObject.scale); clone.updateMatrixWorld (true);
        pivot.add (clone);
        const box = new THREE.Box3 ().setFromObject (clone, true);
        if (!box.isEmpty ()) {
            const center = box.getCenter (new THREE.Vector3 ()); const size = box.getSize (new THREE.Vector3 ()); const extent = Math.max (size.x, size.y, size.z, 1e-6);
            clone.position.sub (center);
            pivot.scale.setScalar (1.45 / extent);
        }

        const render = () => renderer.render (scene, camera);
        let pointer = null;
        canvas.addEventListener ('pointerdown', (event) => { if (event.button !== 0) { return; } pointer = { id : event.pointerId, x : event.clientX, y : event.clientY }; canvas.setPointerCapture (event.pointerId); event.preventDefault (); });
        canvas.addEventListener ('pointermove', (event) => {
            if (!pointer || pointer.id !== event.pointerId) { return; }
            const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y; pointer.x = event.clientX; pointer.y = event.clientY;
            if (event.shiftKey) { pivot.rotation.z += dx * 0.012; pivot.rotation.x += dy * 0.004; }
            else { pivot.rotation.y += dx * 0.012; pivot.rotation.x += dy * 0.012; }
            render (); event.preventDefault ();
        });
        const release = (event) => { if (pointer?.id === event.pointerId) { pointer = null; } };
        canvas.addEventListener ('pointerup', release); canvas.addEventListener ('pointercancel', release); canvas.addEventListener ('contextmenu', (event) => event.preventDefault ());
        render ();
        this.modelPreview = { object, root : object.threeObject, element, renderer, scene, camera, pivot };
    }

    SetObjectDisplayDimension (object, axis, value)
    {
        const base = this.GetObjectBaseSize (object);
        const next = ScaleFromDisplaySize (base[axis], value, object.unit, this.website.preferences.units);
        if (next === null || !Number.isFinite (next) || Math.abs (next) < 1e-6) { return; }
        const before = TransformState (object);
        object.scale[axis] = next;
        this.ApplyTransform (object);
        this.RecordTransform (object, before);
        this.UpdateDetails ();
    }

    AnimationUI ()
    {
        this.animationPanel.replaceChildren ();
        const timeline = this.timeline;
        timeline.ExtendDurationForKeys ();

        const native = Element ('div', 'native_timeline', undefined, this.animationPanel);
        const nativeHeader = Element ('div', 'timeline_header', undefined, native);
        Element ('strong', null, 'Auto3D Timeline', nativeHeader);
        const cameraNow = CaptureCameraState (this.website.viewer);
        Element ('span', 'timeline_camera_readout', 'Cam ' + cameraNow.azimuth.toFixed (1) + '° az · ' + cameraNow.elevation.toFixed (1) + '° el', nativeHeader);

        const settings = Element ('div', 'timeline_settings', undefined, native);
        const durationLabel = Element ('label', null, 'Duration', settings); const duration = Element ('input', null, undefined, durationLabel); duration.type = 'number'; duration.min = '0.1'; duration.max = '3600'; duration.step = '0.1'; duration.value = String (timeline.duration); duration.setAttribute ('aria-label', 'Timeline duration in seconds');
        duration.addEventListener ('change', () => { timeline.SetDuration (Number (duration.value)); this.MarkDirty (); this.AnimationUI (); });
        const tweenLabel = Element ('label', null, 'Tween', settings); const tween = Element ('select', null, undefined, tweenLabel); tween.setAttribute ('aria-label', 'Keyframe interpolation'); [['smooth', 'Smooth'], ['linear', 'Linear'], ['step', 'Step']].forEach (([value, label]) => tween.add (new Option (label, value))); tween.value = timeline.interpolation;
        tween.addEventListener ('change', () => { timeline.interpolation = tween.value; this.MarkDirty (); });
        const loopLabel = Element ('label', 'timeline_loop_label', undefined, settings); const loop = Element ('input', null, undefined, loopLabel); loop.type = 'checkbox'; loop.checked = timeline.loop; loopLabel.appendChild (document.createTextNode (' Loop')); loop.addEventListener ('change', () => { timeline.loop = loop.checked; this.MarkDirty (); });

        const capture = Element ('div', 'mode_buttons timeline_capture_buttons', undefined, native);
        const addObject = Element ('button', null, 'Keyframe object', capture); addObject.disabled = !this.selected; addObject.title = 'Save selected object position, rotation and scale at the current time.';
        addObject.addEventListener ('click', () => { timeline.CaptureObject (this.selected); this.MarkDirty (); this.AnimationUI (); });
        const addCamera = Element ('button', null, 'Keyframe camera', capture); addCamera.title = 'Save viewer eye, target, up vector, FOV, azimuth and elevation at the current time.';
        addCamera.addEventListener ('click', () => { timeline.CaptureCamera (); this.MarkDirty (); this.AnimationUI (); });

        const controls = Element ('div', 'mode_buttons timeline_transport', undefined, native);
        const play = Element ('button', null, timeline.playing ? 'Pause' : 'Play', controls); play.addEventListener ('click', () => { timeline.Toggle (); play.textContent = timeline.playing ? 'Pause' : 'Play'; });
        const reset = Element ('button', null, 'Reset', controls); reset.addEventListener ('click', () => { timeline.Reset (); this.MarkDirty (); this.AnimationUI (); });
        const timeText = Element ('span', 'timeline_time_text', timeline.time.toFixed (2) + ' / ' + timeline.duration.toFixed (2) + ' s', controls);

        const scrub = Element ('input', 'timeline_scrub', undefined, native); scrub.type = 'range'; scrub.min = '0'; scrub.max = String (timeline.duration); scrub.step = '0.01'; scrub.value = String (timeline.time); scrub.setAttribute ('aria-label', 'Auto3D keyframe timeline');
        scrub.addEventListener ('input', () => { timeline.Seek (Number (scrub.value)); timeText.textContent = timeline.time.toFixed (2) + ' / ' + timeline.duration.toFixed (2) + ' s'; this.MarkDirty (); });
        timeline.onTime = (time) => { if (document.activeElement !== scrub) { scrub.value = String (time); } timeText.textContent = time.toFixed (2) + ' / ' + timeline.duration.toFixed (2) + ' s'; };
        timeline.onPlaybackChanged = (playing) => { play.textContent = playing ? 'Pause' : 'Play'; this.MarkDirty (); };

        const keys = Element ('div', 'timeline_keyframes', undefined, native);
        const entries = timeline.cameraKeyframes.map ((keyframe) => ({ type : 'camera', keyframe, object : null, label : 'Camera' }));
        for (const object of this.document.objects) {
            timeline.NormalizeObjectKeyframes (object).forEach ((keyframe) => entries.push ({ type : 'object', keyframe, object, label : object.name }));
        }
        entries.sort ((left, right) => left.keyframe.time - right.keyframe.time || left.type.localeCompare (right.type));
        if (!entries.length) {
            Element ('p', 'section_hint', 'Set the timeline time, position an object or the viewer camera, then save a keyframe. Smooth tweening is applied between keyframes by default.', keys);
        } else {
            for (const entry of entries) {
                const row = Element ('div', 'timeline_keyframe_row', undefined, keys);
                const seek = Element ('button', 'timeline_keyframe_seek', entry.keyframe.time.toFixed (2) + 's · ' + entry.label, row);
                seek.title = entry.type === 'camera'
                    ? 'Camera · ' + entry.keyframe.azimuth.toFixed (1) + '° az · ' + entry.keyframe.elevation.toFixed (1) + '° el · ' + entry.keyframe.distance.toFixed (2) + ' distance'
                    : entry.label + ' · ' + entry.keyframe.interpolation + ' tween';
                seek.addEventListener ('click', () => { timeline.Seek (entry.keyframe.time); this.AnimationUI (); });
                Element ('span', 'timeline_keyframe_mode', entry.keyframe.interpolation, row);
                if (!this.readOnly) {
                    const remove = Element ('button', 'timeline_keyframe_delete', '×', row); remove.title = 'Delete keyframe';
                    remove.addEventListener ('click', () => { timeline.DeleteKeyframe (entry.type, entry.keyframe.id, entry.object); this.MarkDirty (); this.AnimationUI (); });
                }
            }
        }

        const player = this.selected?.player;
        const embedded = Element ('div', 'embedded_animation', undefined, this.animationPanel);
        Element ('strong', null, 'Embedded animation', embedded);
        if (!player) {
            if (this.selected) { Element ('p', 'section_hint', this.selected.animationError || 'No embedded animation in this model. Auto3D keyframes above are available for every model.', embedded); }
            else { Element ('p', 'section_hint', 'Select a model to inspect any embedded GLB/glTF animation clips.', embedded); }
            return;
        }
        const clips = Element ('select', null, undefined, embedded); clips.setAttribute ('aria-label', 'Animation clip'); player.clips.forEach ((clip, index) => clips.add (new Option (clip.name || 'Clip ' + (index + 1), index))); clips.value = String (player.state.clip);
        clips.addEventListener ('change', () => { player.Choose (Number (clips.value)); this.MarkDirty (); this.AnimationUI (); this.UpdateDetails (); });
        const actions = Element ('div', 'mode_buttons', undefined, embedded); const clipPlay = Element ('button', null, player.state.playing ? 'Pause' : 'Play', actions); clipPlay.setAttribute ('aria-label', 'Play or pause embedded animation'); clipPlay.addEventListener ('click', () => { player.Toggle (); this.MarkDirty (); clipPlay.textContent = player.state.playing ? 'Pause' : 'Play'; if (!player.state.playing) { this.UpdateDetails (); } });
        const clipReset = Element ('button', null, 'Reset', actions); clipReset.addEventListener ('click', () => { player.Seek (0); clipScrub.value = '0'; this.MarkDirty (); this.UpdateDetails (); });
        const clipSettings = Element ('div', 'animation_settings', undefined, embedded);
        const speedLabel = Element ('label', null, 'Speed', clipSettings); const speed = Element ('select', null, undefined, speedLabel); speed.setAttribute ('aria-label', 'Animation speed'); [0.25, 0.5, 1, 1.5, 2].forEach ((value) => speed.add (new Option (value + '×', value))); speed.value = String (player.state.speed); speed.addEventListener ('change', () => { player.state.speed = Number (speed.value); this.MarkDirty (); });
        const clipLoopLabel = Element ('label', null, 'Loop', clipSettings); const clipLoop = Element ('input', null, undefined, clipLoopLabel); clipLoop.type = 'checkbox'; clipLoop.checked = player.state.loop !== false; clipLoop.setAttribute ('aria-label', 'Loop embedded animation'); clipLoop.addEventListener ('change', () => { player.SetLoop (clipLoop.checked); this.MarkDirty (); });
        const clipScrub = Element ('input', null, undefined, embedded); clipScrub.type = 'range'; clipScrub.min = '0'; clipScrub.max = String (player.clips[player.state.clip].duration); clipScrub.step = '0.01'; clipScrub.value = String (player.state.time); clipScrub.setAttribute ('aria-label', 'Embedded animation timeline'); clipScrub.addEventListener ('input', () => { player.Seek (Number (clipScrub.value)); this.MarkDirty (); this.UpdateDetails (); }); player.onTime = (time) => { if (document.activeElement !== clipScrub) { clipScrub.value = String (time); } }; player.onPlaybackChanged = (playing) => { clipPlay.textContent = playing ? 'Pause' : 'Play'; this.MarkDirty (); };
    }

    FitScene ()
    {
        this.website.FitModelToWindow (false);
    }

    DropToFloor ()
    {
        const object = this.selected;
        if (!object?.threeObject) { return; }
        const box = new THREE.Box3 ().setFromObject (object.threeObject, true);
        if (box.isEmpty ()) { return; }
        const delta = DropToFloorDelta (box, this.website.viewer.upVector);
        const axis = delta.findIndex ((value) => Math.abs (value) > 1e-10);
        if (axis < 0) { this.Status (object.name + ' is already on the floor.'); return; }
        const before = TransformState (object);
        object.position[axis] += delta[axis];
        this.ApplyTransform (object);
        this.RecordTransform (object, before);
        this.UpdateDetails ();
        this.Status ('Dropped ' + object.name + ' to floor');
    }

    ArrayDialog ()
    {
        if (!this.selected) { return; }
        const dialog = WorkspaceDialog ('Array selected model');
        const form = Element ('form', 'workspace_save_form', undefined, dialog);
        Element ('p', 'section_hint', 'Create touching copies using the selected model bounding box. W = X · L = Z · H = Y.', form);
        const fields = {};
        for (const [key, title] of [['w', 'Width count (W)'], ['l', 'Length count (L)'], ['h', 'Height count (H)']]) {
            const label = Element ('label', null, title, form);
            const input = Element ('input', null, undefined, label); input.type = 'number'; input.min = '1'; input.max = '20'; input.step = '1'; input.value = '1'; input.required = true;
            fields[key] = input;
        }
        const status = Element ('p', 'section_hint', 'The selected model is position 1,1,1.', form);
        const create = Element ('button', 'workspace_primary', 'Create array', form); create.type = 'submit';
        form.addEventListener ('submit', async (event) => {
            event.preventDefault ();
            const counts = ['w', 'l', 'h'].map ((key) => Number (fields[key].value));
            if (counts.some ((value) => !Number.isInteger (value) || value < 1 || value > 20)) { status.textContent = 'Each count must be an integer from 1 to 20.'; return; }
            const total = counts[0] * counts[1] * counts[2];
            if (this.document.objects.length + total - 1 > 1000) { status.textContent = 'This array would exceed the 1,000-object session limit.'; return; }
            create.disabled = true;
            try { await this.CreateArray (...counts); dialog.close (); } catch (error) { status.textContent = error.message; create.disabled = false; }
        });
    }

    async CreateArray (widthCount, lengthCount, heightCount)
    {
        const source = this.selected;
        if (!source?.threeObject) { throw new Error ('Select a model first.'); }
        const counts = [widthCount, lengthCount, heightCount];
        if (counts.some ((value) => !Number.isInteger (value) || value < 1 || value > 20)) { throw new Error ('Array counts must be integers from 1 to 20.'); }
        const total = widthCount * lengthCount * heightCount;
        if (this.document.objects.length + total - 1 > 1000) { throw new Error ('Array exceeds the 1,000-object session limit.'); }
        if (total === 1) { this.Status ('Array is 1 × 1 × 1; no copies created.'); return []; }

        const box = new THREE.Box3 ().setFromObject (source.threeObject, true);
        const size = box.getSize (new THREE.Vector3 ());
        const added = [];
        const firstIndex = this.document.objects.length;
        for (let h = 0; h < heightCount; h++) {
            for (let l = 0; l < lengthCount; l++) {
                for (let w = 0; w < widthCount; w++) {
                    if (w === 0 && l === 0 && h === 0) { continue; }
                    const copy = this.document.Duplicate (source);
                    copy.name = source.name + ' [' + (w + 1) + ',' + (l + 1) + ',' + (h + 1) + ']';
                    const offset = ArrayOffset (size, w, l, h);
                    copy.position = source.position.map ((value, axis) => value + offset[axis]);
                    this.document.ApplyTransform (copy);
                    added.push (copy);
                }
            }
        }
        this.history.Push ({
            undo : async () => { added.forEach ((object) => this.document.Remove (object)); this.selected = source; await this.Render (); },
            redo : async () => { added.forEach ((object, index) => this.document.Restore (object, firstIndex + index)); this.selected = source; await this.Render (); }
        });
        this.selected = source;
        await this.Render ();
        this.Status ('Created ' + widthCount + ' × ' + lengthCount + ' × ' + heightCount + ' array · ' + total + ' objects');
        return added;
    }

    async Duplicate () { if (!this.selected) { return; } const object = this.document.Duplicate (this.selected); const index = this.document.objects.indexOf (object); this.history.Push ({ undo : async () => { this.document.Remove (object); this.selected = null; await this.Render (); }, redo : async () => { this.document.Restore (object, index); this.selected = object; await this.Render (); } }); this.selected = object; await this.Render (); this.Status ('Duplicated ' + object.name); }
    async Delete () { const object = this.selected; if (!object) { return; } const index = this.document.objects.indexOf (object); this.document.Remove (object); this.history.Push ({ undo : async () => { this.document.Restore (object, index); this.selected = object; await this.Render (); }, redo : async () => { this.document.Remove (object); this.selected = null; await this.Render (); } }); this.selected = null; await this.Render (); this.Status ('Deleted ' + object.name + ' · Undo is available'); }
    ToggleVisibility () { const object = this.selected; if (!object) { return; } const before = object.visible; const apply = (visible) => { object.visible = visible; object.threeObject.visible = visible; this.website.UpdateMeshesVisibility (); this.Select (object); this.UpdateSelectionBox (); }; apply (!before); this.history.Push ({ undo : () => apply (before), redo : () => apply (!before) }); this.RefreshButtons (); }
    Focus () { if (!this.selected) { return; } const box = new THREE.Box3 ().setFromObject (this.selected.threeObject, true); if (!box.isEmpty ()) { this.website.viewer.FitSphereToWindow (box.getBoundingSphere (new THREE.Sphere ()), true); } }
    async Undo () { await this.history.Undo (); this.RefreshUI (); }
    async Redo () { await this.history.Redo (); this.RefreshUI (); }

    Archive (objects, kind, name)
    {
        const data = PackSession (this.document, { camera : this.website.viewer.GetCamera (), cameraState : CaptureCameraState (this.website.viewer), timeline : this.timeline.Serialize (), backgroundPreset : this.website.settings.backgroundPreset, horizonGradient : this.website.settings.horizonGradient, showGroundGrid : this.website.settings.showGroundGrid, lighting : this.website.lightingPanel.Capture () }, objects, kind); data.name = name; return CreateSessionArchive (data);
    }
    async OpenArchive (buffer, append, recovered = false)
    {
        const saved = OpenSessionArchive (buffer); // Validate everything before replacing the current document.
        if (append) {
            const added = [];
            for (const source of saved.document.objects) {
                const model = saved.document.CompactModel ([source], true); model.root = model.root.GetChildNode (0);
                const object = this.document.AddImported (model, source.name, Direction.Y, false); Object.assign (object, TransformState (source), { source : source.source, visible : source.visible, hiddenParts : [...source.hiddenParts], unit : source.unit, userData : { ...(source.userData || {}) }, castShadow : source.castShadow !== false, receiveShadow : source.receiveShadow !== false, keyframes : (source.keyframes || []).map ((keyframe) => ({ ...keyframe, position : [...keyframe.position], rotation : [...keyframe.rotation], scale : [...keyframe.scale] })), animationAsset : source.animationAsset, playback : source.playback }); this.document.ApplyTransform (object); added.push (object);
            }
            const firstIndex = this.document.objects.length - added.length; this.history.Push ({ undo : async () => { added.forEach ((object) => this.document.Remove (object)); this.selected = null; await this.Render (); }, redo : async () => { added.forEach ((object, index) => this.document.Restore (object, firstIndex + index)); this.selected = added[0]; await this.Render (); } }); this.selected = added[0];
        } else { this.document = saved.document; this.history = new SceneHistory (() => this.MarkDirty ()); this.timeline.Load (saved.view.timeline); this.selected = this.document.objects[0] || null; if (this.website.hashHandler.HasHash ()) { this.website.hashHandler.SkipNextEventHandler (); this.website.hashHandler.ClearHash (); } }
        await this.Render (true);
        if (!append) {
            if (['standard', 'dark', 'light', 'sunset', 'outdoor', 'custom'].includes (saved.view.backgroundPreset)) { this.website.settings.backgroundPreset = saved.view.backgroundPreset; }
            for (const key of ['horizonGradient', 'showGroundGrid']) { if (typeof saved.view[key] === 'boolean') { this.website.settings[key] = saved.view[key]; } }
            this.website.UpdateViewport ();
            if (saved.view.lighting) { await this.website.lightingPanel.Restore (saved.view.lighting); }
        }
        if (!append && saved.view.cameraState) {
            ApplyCameraState (this.website.viewer, saved.view.cameraState);
        } else if (!append && saved.view.camera) {
            const camera = this.website.viewer.GetCamera (); const data = saved.view.camera;
            if (['eye', 'center', 'up'].every ((key) => data[key] && ['x', 'y', 'z'].every ((axis) => Number.isFinite (data[key][axis])))) { ['eye', 'center', 'up'].forEach ((key) => Object.assign (camera[key], data[key])); if (Number.isFinite (data.fov)) { camera.fov = data.fov; } this.website.viewer.SetCamera (camera); }
        }
        this.Status ((append ? 'Added from ' : 'Opened ') + saved.document.name);
        if (!append) {
            if (recovered) { this.dirty = true; }
            else { await this.MarkClean (); }
        }
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
        if (this.readOnly) { return; }
        const modified = event.ctrlKey || event.metaKey; const key = event.key.toLowerCase ();
        const target = event.target;
        const textEditing = target.closest ('textarea, [contenteditable="true"]') || (target.matches?.('input') && ['text', 'search', 'email', 'url', 'password', 'number'].includes (target.type));
        if (this.busy || (textEditing && !(modified && key === 'z' && !target.matches?.(':focus')))) { return; }
        if (target.closest ('dialog') && !(modified && key === 'z')) { return; }
        let action = null;
        if (modified && key === 's') { action = () => this.library.SaveDialog (true); } else if (modified && key === 'd') { action = () => this.Duplicate (); } else if (modified && key === 'z') { action = () => event.shiftKey ? this.Redo () : this.Undo (); }
        else if (!modified && !event.altKey) { action = ({ v : () => this.SetMode ('select'), w : () => this.SetMode ('translate'), e : () => this.SetMode ('rotate'), r : () => this.SetMode ('scale'), f : () => this.Focus (), h : () => this.ToggleVisibility (), delete : () => this.Delete () })[key]; }
        if (action) { event.preventDefault (); this.Run (action); }
    }
}

