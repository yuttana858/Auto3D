import { VisibleSceneBounds } from '../engine/viewer/fitview.js';
import { ReleaseWebGLRenderer } from './webglcleanup.js';
import { Coord3D } from '../engine/geometry/coord3d.js';
import { CapturePresentationBackground } from './sharedpresentation.js';
import { Theme } from './settings.js';
import { PreparePackagingPresentations } from './packagingadapter.js';
import { SceneGroups } from './scenegroups.js';
import { CommandBar } from './commandbar.js';
import { ProcessingFeedback } from './processingfeedback.js';
import { ArrayPlacement, ArrayCellSize, ArrayObjectBounds } from './arraylayout.js';
import { RevealArray } from './arrayreveal.js';
import { SessionCameras } from './sessioncameras.js';
import { CalculateVolume, CalculateSurfaceArea } from '../engine/model/quantities.js';
import { IsTwoManifold } from '../engine/model/modelutils.js';
import { PackagingWorkspace } from './packagingworkspace.js';
import { PolygonOptimizer } from './polygonoptimizer.js';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { clone as CloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SceneDocument, SceneHistory } from './scenedocument.js';
import { PackSession, CreateSessionArchive, OpenSessionArchive } from './sessionarchive.js';
import { ModelLibrary, WorkspaceDialog, RecoveryArchiveBuffer } from './modellibrary.js';
import { Selection, SelectionType } from './navigator.js';
import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../engine/threejs/threeconverter.js';
import { Direction } from '../engine/geometry/geometry.js';
import { Unit } from '../engine/model/unit.js';
import { Property, PropertyType } from '../engine/model/property.js';
import { DisplayLength, DisplayUnitLabel, DisplayQuantity, UnitFactor, DisplaySizeFromScale, ScaleFromDisplaySize } from './preferences.js';
import { LoadAnimationScene } from './sessionanimation.js';
import { ShowAdvanceAnimation, CreateTimelineTracks, UpdatePlayheads } from './advanceanimation.js';
import { RecoveryWriter } from './sessionrecovery.js';
import { SessionTimeline, CaptureCameraState, ApplyCameraState } from './sessiontimeline.js';
import { ShowExportDialog } from './exportdialog.js';
import { SessionTabs } from './sessiontabs.js';

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
    'primary-products' : '<path d="M6 2h5v4l2 4v12H4V10l2-4ZM4 14h9M17 7q4-2 7 0v14q-4 2-7 0ZM17 9q4 2 7 0"/>',
    packaging : '<path d="M3 4h18v16H3Z M8 4v16 M16 4v16 M3 10h18"/>',
    dimension : '<path d="M4 3v18M20 3v18M4 12h16M8 8l-4 4 4 4m8-8 4 4-4 4"/>',
    select : '<path d="m6 3 13 10-7 1-3 7Z"/>', move : '<path d="M12 2v20M2 12h20m-13-7 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3"/>',
    rotate : '<path d="M20 8a9 9 0 1 0 1 8M20 3v6h-6"/>', scale : '<path d="M4 13v7h7M13 4h7v7M4 20l16-16"/>', duplicate : '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',
    visible : '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>', remove : '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    focus : '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/><circle cx="12" cy="12" r="3"/>', undo : '<path d="M3 9h12a6 6 0 0 1 0 12M3 9l5-5M3 9l5 5"/>', redo : '<path d="M21 9H9a6 6 0 0 0 0 12m12-12-5-5m5 5-5 5"/>',
    fit : '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',
    commands : '<rect x="2" y="4" width="22" height="16" rx="2"/><path d="m6 9 3 3-3 3M12 15h7"/>',
    array : '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    floor : '<path d="M3 20h18M12 3v12m-4-4 4 4 4-4"/>',
    add : '<path d="M12 3v18M3 12h18"/>', save : '<path d="M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7"/>', export : '<path d="M12 16V2m-4 4 4-4 4 4M4 12v9h16v-9"/>', library : '<path d="M3 4h5v17H3Zm7 0h5v17h-5Zm7 1 4-1 3 16-4 1Z"/>', ai : '<path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Z"/><path d="M19 14l.9 2.6L22.5 18l-2.6.9L19 21.5l-.9-2.6-2.6-.9 2.6-1.4L19 14Z"/>', update : '<path d="M20 7a9 9 0 1 0 1 9M20 2v6h-6"/>'
};

export class SessionEditor
{
    constructor (website)
    {
        this.website = website; this.document = new SceneDocument (); this.history = new SceneHistory (() => this.MarkDirty ()); this.selected = null; this.selectedIds = new Set (); this.selectionPivot = new THREE.Group (); website.viewer.scene.add (this.selectionPivot); this.mode = 'select'; this.busy = false; this.players = []; this.proportionalScaling = false; this.modelPreview = null;
        this.packaging = new PackagingWorkspace (this); this.timeline = new SessionTimeline (this); this.cameras = new SessionCameras (this); this.polygonOptimizer = new PolygonOptimizer (this);
        this.baseSizes = new WeakMap (); this.recoveryWriter = new RecoveryWriter (); this.recoveryRevision = 0;
        this.library = new ModelLibrary (this); this.buttons = new Map (); this.dirty = false; this.recoveryTimer = null; this.recoveryPromptOpen = false; this.recoveryPromptHandled = false;
        const viewer = website.viewer;
        this.selectionBounds = new THREE.Box3 ();
        this.selectionBox = new THREE.Box3Helper (this.selectionBounds, 0x5aaee6);
        this.selectionBox.visible = false;
        this.selectionBox.renderOrder = 10000;
        this.selectionBox.frustumCulled = false;
        if (this.selectionBox.material) {
            this.selectionBox.material.depthTest = false;
            this.selectionBox.material.depthWrite = false;
            this.selectionBox.material.transparent = true;
            this.selectionBox.material.opacity = 1;
        }
        viewer.scene.add (this.selectionBox);
        this.controls = new TransformControls (viewer.camera, viewer.renderer.domElement); this.controls.setSize (0.8); this.helper = this.controls.getHelper (); viewer.scene.add (this.helper);
        viewer.renderer.domElement.addEventListener ('pointerdown', event => { this.shiftDragRequested = event.shiftKey && this.mode === 'translate'; }, true);
        viewer.navigation.onOrbitStart = () => this.OrbitSelected (false);
        // Main viewer: right-drag orbits around the selected model's center (left/right, with up/down tilt) without first
        // re-aiming the camera, so the current framing is kept while the view swings around the object.
        viewer.navigation.rightDragPansHorizontally = false;
        let panControlsEnabled = null;
        viewer.navigation.onPanModifier = active => {
            if (active && panControlsEnabled === null) { panControlsEnabled = this.controls.enabled; this.controls.enabled = false; }
            if (!active && panControlsEnabled !== null) { this.controls.enabled = panControlsEnabled; panControlsEnabled = null; }
        };
        const render = viewer.onRender;
        viewer.SetRenderHandler ((camera) => { if (render) { render (camera); } if (this.controls.camera !== camera) { this.controls.camera = camera; } this.website.dimensions?.Draw (camera); });
        this.controls.addEventListener ('change', () => this.RequestInteractionRender ());
        this.controls.addEventListener ('dragging-changed', (event) => {
            viewer.navigation.enabled = !event.value; viewer.navigation.clickDetector.Cancel ();
            if (event.value && this.selected) { this.dragStart = TransformState (this.selected); this.dragObjects = this.SelectedObjects ().map ((object) => ({ object, before : TransformState (object), matrix : object.threeObject.matrix.clone () })); this.dragPivot = this.selectionPivot.matrix.clone (); }
            if (!event.value) { this.FinishDrag (); }
        });
        this.controls.addEventListener ('objectChange', () => {
            if (!this.selected?.threeObject) { return; }
            if (this.dragObjects?.length > 1) {
                this.selectionPivot.updateMatrix (); const delta = this.selectionPivot.matrix.clone ().multiply (this.dragPivot.clone ().invert ());
                for (const item of this.dragObjects) { const matrix = delta.clone ().multiply (item.matrix); const position = new THREE.Vector3 (); const rotation = new THREE.Quaternion (); const scale = new THREE.Vector3 (); matrix.decompose (position, rotation, scale); item.object.position = position.toArray (); const euler = new THREE.Euler ().setFromQuaternion (rotation); item.object.rotation = [euler.x, euler.y, euler.z].map (THREE.MathUtils.radToDeg); item.object.scale = scale.toArray (); this.document.ApplyTransform (item.object); this.ApplyTransform (item.object); }
                this.RequestInteractionRender (); return;
            }
            const object = this.selected; object.position = object.threeObject.position.toArray (); object.rotation = [object.threeObject.rotation.x, object.threeObject.rotation.y, object.threeObject.rotation.z].map (THREE.MathUtils.radToDeg); object.scale = object.threeObject.scale.toArray ();
            object.scale = object.scale.map ((value) => Math.abs (value) < 1e-6 ? 1e-6 : value); this.document.ApplyTransform (object); this.RequestInteractionRender ();
        });
        const cancelDrag = () => { if (this.controls.dragging) { this.controls.pointerUp (null); } this.FinishDrag (); };
        viewer.renderer.domElement.addEventListener ('pointercancel', cancelDrag);
        viewer.renderer.domElement.addEventListener ('lostpointercapture', cancelDrag);
        window.addEventListener ('blur', cancelDrag);
        window.addEventListener ('keyup', event => { if (['x', 'y', 'z'].includes (event.key?.toLowerCase ())) { this.SetRotationAxisOverride (null); } });
        window.addEventListener ('blur', () => this.SetRotationAxisOverride (null));
        this.CreateUI ();
        const headerSave = Element ('button', 'header_library_button header_save_button', undefined, document.getElementById ('header_buttons'));
        headerSave.type = 'button'; headerSave.title = 'Save current session'; headerSave.setAttribute ('aria-label', 'Save current session');
        headerSave.innerHTML = '<svg viewBox="0 0 26 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 3h15l3 3v15H4Z M8 3v6h10V3 M8 21v-8h10v8"/></svg><span>Save</span>';
        headerSave.addEventListener ('click', () => this.library.SaveDialog ().catch (error => this.Status (error.message)));
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
        if (!this.readOnly) { this.sessions = new SessionTabs (this, document.getElementById ('header_buttons')); }
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
            if (!(this.sessions?.HasDirty () || this.dirty) || this.readOnly) { return; }
            event.preventDefault (); event.returnValue = '';
        });

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

    ModelTools ()
    {
        return [['ai', 'AI Generative', () => this.website.aiWorkspace?.Open ()], ['packaging', 'Packaging design', () => this.website.packagingPanel?.Open ()], ['primary-products', 'Primary Products', () => this.website.primaryProductsPanel?.Open ()], ['select', 'Select (V)', () => this.SetMode ('select')], ['move', 'Move (W)', () => this.SetMode ('translate')], ['rotate', 'Rotate (E)', () => this.SetMode ('rotate')], ['scale', 'Scale (R)', () => this.SetMode ('scale')], ['dimension', 'Dimensions · drag an edge', () => this.website.dimensions.SetActive (!this.website.dimensions.active)], ['duplicate', 'Duplicate object (Ctrl+D)', () => this.Duplicate ()], ['array', 'Array selected object', () => this.ArrayDialog ()], ['floor', 'Drop selected object to floor', () => this.DropToFloor ()], ['visible', 'Hide or show object (H)', () => this.ToggleVisibility ()], ['remove', 'Delete object', () => this.Delete ()], ['focus', 'Focus object (F)', () => this.Focus ()], ['fit', 'Fit all objects to screen', () => this.FitScene ()], ['update', 'Update selected model', () => this.UpdateModel ()], ['undo', 'Undo object edit (Ctrl+Z)', () => this.Undo ()], ['redo', 'Redo object edit (Ctrl+Shift+Z)', () => this.Redo ()], ['add', 'Add model', () => this.AddModel ()], ['save', 'Save or open session (Ctrl+S)', () => this.library.SaveDialog (true)], ['export', 'Export', () => this.Export ()], ['library', 'Model library', () => this.library.Open ()]];
    }

    ToolDisabled (key)
    {
        return this.busy || (this.readOnly && !['select', 'focus', 'fit'].includes (key)) || (['move', 'rotate', 'scale', 'duplicate', 'array', 'floor', 'visible', 'remove', 'focus', 'update'].includes (key) && !this.selected) || (key === 'export' && !this.document.objects.length) || (key === 'undo' && !this.history.undo.length) || (key === 'redo' && !this.history.redo.length);
    }

    ModelToolMenu ()
    {
        return this.ModelTools ().map (([key, name, onClick]) => ({ name, onClick, disabled : this.ToolDisabled (key) }));
    }

    CreateUI ()
    {
        this.strip = Element ('div', 'scene_tools', undefined, this.website.parameters.rightContainerDiv); this.strip.setAttribute ('role', 'toolbar'); this.strip.setAttribute ('aria-label', 'Object tools');
        this.processing = new ProcessingFeedback ();
        const stripHidden = new Set (['visible', 'remove', 'library', 'save', 'export', 'add']);
        const moduleTools = Element ('div', 'scene_module_tools', undefined, this.strip); moduleTools.setAttribute ('role', 'group'); moduleTools.setAttribute ('aria-label', 'Generation modules');
        const historyTools = Element ('div', 'session_history_tools', undefined, document.getElementById ('toolbar')); historyTools.setAttribute ('role', 'group'); historyTools.setAttribute ('aria-label', 'Edit history'); document.getElementById ('toolbar').prepend (historyTools);
        const tools = this.ModelTools ().filter (([key]) => !stripHidden.has (key));
        for (const [key, label, action] of tools) {
            const button = Element ('button', 'scene_tool', undefined, ['ai', 'packaging', 'primary-products'].includes (key) ? moduleTools : ['undo', 'redo'].includes (key) ? historyTools : this.strip); button.title = label; button.setAttribute ('aria-label', label); button.innerHTML = '<svg viewBox="0 0 26 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + Icons[key] + '</svg>';
            button.addEventListener ('click', async () => { if (['undo', 'redo'].includes (key)) { button.setAttribute ('aria-busy', 'true'); button.disabled = true; try { await this.Run (action); } finally { button.removeAttribute ('aria-busy'); this.RefreshButtons (); } } else { await this.Run (action); } }); this.buttons.set (key, button);
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
                    if (key === 'scale') {
                        this.SetObjectDisplayDimension (this.selected, axis, input.valueAsNumber);
                        return;
                    } else {
                        const vector = [...this.selected[key]]; vector[axis] = key === 'position' ? input.valueAsNumber / (UnitFactor (this.selected.unit, this.website.preferences.units) ?? 1) : input.valueAsNumber; this.TransformSelection ({ [key] : vector }); return;
                    }
                });
            }
        }
        const space = Element ('select', null, undefined, this.transformPanel); space.setAttribute ('aria-label', 'Transform space'); space.add (new Option ('World', 'world')); space.add (new Option ('Local', 'local')); space.addEventListener ('change', () => this.controls.setSpace (space.value));
        this.transformHint = Element ('p', 'section_hint', 'Position uses source coordinates. Size follows the global unit preference.', this.transformPanel);
        this.commandBar = new CommandBar (this.website, this.website.parameters.viewerDiv); this.status = this.commandBar.status;
        // The Commands button sits at the bottom of the tool strip and reopens the command bar after it is closed.
        const commandsButton = Element ('button', 'scene_tool scene_tool_commands', undefined, this.strip); commandsButton.title = 'Command bar'; commandsButton.setAttribute ('aria-label', 'Command bar');
        commandsButton.innerHTML = '<svg viewBox="0 0 26 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">' + Icons.commands + '</svg>';
        const syncCommands = visible => commandsButton.setAttribute ('aria-pressed', String (visible)); syncCommands (this.commandBar.visible);
        this.commandBar.onVisibilityChange = syncCommands;
        commandsButton.addEventListener ('click', () => this.commandBar.SetVisible (!this.commandBar.visible));
        const section = Element ('details', 'workspace_section'); section.open = false; section.id = 'session_objects'; Element ('summary', null, 'Session objects', section);
        const content = Element ('div', 'section_content', undefined, section); const actions = Element ('div', 'mode_buttons', undefined, content);
        const add = Element ('button', null, 'Add model', actions); add.addEventListener ('click', () => this.AddModel ()); const library = Element ('button', null, 'Library', actions); library.addEventListener ('click', () => this.library.Open ());
        this.objectList = Element ('div', 'session_object_list', undefined, content);
        const animationSection = Element ('details', 'workspace_section'); animationSection.open = false; animationSection.id = 'session_animation'; Element ('summary', null, 'Animation', animationSection);
        const animationContent = Element ('div', 'section_content', undefined, animationSection); this.animationPanel = Element ('div', 'animation_panel', undefined, animationContent);
        const uploadContent = document.getElementById ('upload_panel_content'); const materials = document.getElementById ('materials_section');
        uploadContent.insertBefore (section, materials); uploadContent.insertBefore (animationSection, materials);
        this.sessionInput = Element ('input', null, undefined, document.body); this.sessionInput.type = 'file'; this.sessionInput.accept = '.auto3d'; this.sessionInput.hidden = true;
        this.sessionInput.addEventListener ('change', async () => { const file = this.sessionInput.files[0]; this.sessionInput.value = ''; if (file) { await this.Run (() => this.OpenArchiveFile (file)); } });
        this.website.parameters.fileInput.addEventListener ('cancel', () => { this.replaceTarget = null; });
        this.RefreshUI ();
    }

    OpenContextMenu (coordinates, actions)
    {
        this.closeContextMenu?. ();
        const menu = Element ('div', 'auto3d_context_menu', undefined, document.body);
        menu.setAttribute ('role', 'menu');
        Object.assign (menu.style, { maxHeight : 'calc(100vh - 24px)', overflowY : 'auto', position : 'fixed', zIndex : '100000', minWidth : '170px', padding : '6px', borderRadius : '8px', background : 'var(--ov_background_color, #242424)', boxShadow : '0 8px 28px rgba(0,0,0,.35)' });
        const dismiss = (event) => { if (!menu.contains (event.target)) { close (); } };
        const drag = (event) => { if ((event.buttons & 2) && Math.hypot (event.clientX - coordinates.x, event.clientY - coordinates.y) > 5) { close (); } };
        const escape = (event) => { if (event.key === 'Escape') { close (); } };
        const close = () => {
            window.removeEventListener ('pointerdown', dismiss);
            window.removeEventListener ('keydown', escape);
            window.removeEventListener ('pointermove', drag);
            window.removeEventListener ('blur', close);
            this.closeContextMenu = null;
            menu.remove ();
        };
        this.closeContextMenu = close;
        for (const { name, onClick, disabled = false } of actions) {
            const button = Element ('button', 'scene_context_action', name, menu);
            button.setAttribute ('role', 'menuitem'); button.disabled = disabled; button.setAttribute ('aria-disabled', String (disabled));
            Object.assign (button.style, { display : 'block', width : '100%', padding : '7px 10px', textAlign : 'left' });
            button.addEventListener ('click', () => { close (); this.Run (onClick); });
        }
        menu.style.left = Math.max (0, Math.min (coordinates.x, window.innerWidth - menu.offsetWidth)) + 'px';
        menu.style.top = Math.max (0, Math.min (coordinates.y, window.innerHeight - menu.offsetHeight)) + 'px';
        window.addEventListener ('pointerdown', dismiss);
        window.addEventListener ('keydown', escape);
        window.addEventListener ('pointermove', drag);
        window.addEventListener ('blur', close);
    }

    async Run (action) { if (this.busy) { return; } try { await action (); } catch (error) { this.website.errorLogs?.Record ('error', 'operation', error.message, error.stack || ''); this.Status (error.message); } }
    Status (text) { this.status.textContent = text; this.processing?.Update (text); }

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
        const value = window.prompt ('Rename session', this.document.name);
        if (value === null) { return; }
        try { this.SetSessionName (value); } catch (error) { this.Status (error.message); }
    }
    // Shared by the header prompt and session.rename.
    SetSessionName (value)
    {
        if (this.readOnly) { throw new Error ('This shared viewer is read-only.'); }
        const previous = this.document.name;
        const next = String (value).trim ().slice (0, 100);
        if (!next) { throw new Error ('Use a session name of 1–100 characters.'); }
        if (next === previous) { return { name : next, changed : false }; }
        const apply = (name) => {
            this.document.name = name;
            this.website.parameters.fileNameDiv.textContent = name;
            this.MarkDirty ();
        };
        apply (next);
        this.PushHistory (() => apply (previous), () => apply (next));
        return { name : next, changed : true };
    }
    async DiscardRecovery ()
    {
        if (this.readOnly) { throw new Error ('This shared viewer is read-only.'); }
        await this.library.deviceStorage.ClearRecovery ();
        return { discarded : true };
    }
    RemoveUserData (item, key)
    {
        if (this.readOnly) { throw new Error ('This shared viewer is read-only.'); }
        if (!item.userData || !Object.hasOwn (item.userData, key) || key.startsWith ('_auto3d')) { throw new Error ('User data field not found.'); }
        delete item.userData[key]; this.MarkDirty ();
        return { objectId : item.id, userData : { ...item.userData } };
    }

    RequestInteractionRender ()
    {
        this.website.viewer.viewportQuality?.Interact ();
        if (this.interactionFrame) { return; }
        this.interactionFrame = requestAnimationFrame (() => {
            this.interactionFrame = null;
            this.UpdateSelectionBox (); this.SyncInputs (); this.website.viewer.Render ();
        });
    }

    FinishDrag ()
    {
        this.website.viewer.navigation.enabled = true;
        const before = this.dragStart; this.dragStart = null;
        const shiftCopy = this.shiftDragRequested && before && this.mode === 'translate'; this.shiftDragRequested = false;
        if (shiftCopy) {
            const records = (this.dragObjects?.length ? this.dragObjects : [{ object : this.selected, before }]).map (item => ({ object : item.object, before : item.before, after : TransformState (item.object) }));
            this.dragObjects = null;
            if (records.some (item => JSON.stringify (item.before) !== JSON.stringify (item.after))) { this.busy = true; this.RefreshButtons (); this.DuplicateTransformed (records).catch (error => this.Status ('Could not duplicate: ' + error.message)).finally (() => { this.busy = false; this.RefreshButtons (); }); return; }
        }
        if (this.dragObjects?.length > 1) { const records = this.dragObjects.map ((item) => ({ ...item, after : TransformState (item.object) })); const apply = (key) => { records.forEach ((item) => { Object.assign (item.object, JSON.parse (JSON.stringify (item[key]))); this.ApplyTransform (item.object); }); this.Select (this.selected, false, true); }; this.history.Push ({ undo : () => apply ('before'), redo : () => apply ('after') }); this.dragStart = null; }
        else if (before && this.selected) { this.RecordTransform (this.selected, before); this.UpdateDetails (); this.website.viewer.UpdateGroundGrid (); this.website.sceneEffects?.Refresh (); }
        this.dragObjects = null; this.RequestInteractionRender ();
    }

    MarkDirty ()
    {
        if (this.readOnly) { return; }
        this.dirty = true; this.recoveryRevision++;
        this.sessions?.Refresh ();
        if (this.recoveryTimer) { clearTimeout (this.recoveryTimer); }
        if (!this.document.objects.length && !this.document.packaging?.paths?.length) { this.recoveryWriter.Cancel (); this.library.deviceStorage.ClearRecovery ().catch (() => {}); return; }
        this.recoveryTimer = setTimeout (() => this.SaveRecovery (), 1500);
    }

    async SaveRecovery ()
    {
        this.recoveryTimer = null;
        if (!this.dirty || this.readOnly || (!this.document.objects.length && !this.document.packaging?.paths?.length)) { return; }
        if (this.busy || this.controls.dragging || this.timeline.playing || this.players.some ((player) => player.state.playing) || this.recoverySaving) {
            this.recoveryTimer = setTimeout (() => this.SaveRecovery (), 1500); return;
        }
        const revision = this.recoveryRevision; const document = this.document;
        this.recoverySaving = true;
        try {
            const archive = await this.recoveryWriter.Create (document, this.CaptureView ());
            if (this.dirty && this.document === document && revision === this.recoveryRevision) { await this.library.deviceStorage.SaveRecovery (archive, document.name); }
        } catch (error) { console.warn ('Auto3D recovery save failed.', error); }
        finally { this.recoverySaving = false; }
    }

    async MarkClean ()
    {
        if (this.readOnly) { return; }
        this.dirty = false; this.recoveryRevision++; this.recoveryWriter.Cancel ();
        this.sessions?.Refresh ();
        if (this.recoveryTimer) { clearTimeout (this.recoveryTimer); this.recoveryTimer = null; }
        try { await this.library.deviceStorage.ClearRecovery (); } catch { /* Recovery cleanup is best effort. */ }
    }

    async ReadRecovery ()
    {
        const storage = this.library.deviceStorage; const owner = storage.accountId;
        const check = () => { if (!owner || this.website.auth?.user?.id !== owner || !this.website.accountReady || this.library.deviceStorage !== storage) { throw new Error ('Sign in to the same account before inspecting recovery.'); } };
        check (); const recovery = await storage.GetRecovery (); check ();
        let buffer = null; let validationError = null;
        if (recovery?.archive) {
            try { buffer = await RecoveryArchiveBuffer (recovery.archive); check (); OpenSessionArchive (buffer); }
            catch (error) { validationError = error; }
        }
        check (); return { recovery, buffer, validationError };
    }
    async InspectRecovery ()
    {
        const { recovery, buffer, validationError } = await this.ReadRecovery ();
        return { available : Boolean (recovery?.archive), valid : Boolean (buffer && !validationError), updatedAt : recovery?.updatedAt || null, bytes : buffer?.byteLength || 0, error : validationError?.message || null };
    }
    async RestoreRecovery ()
    {
        if (this.readOnly || this.busy) { throw new Error ('Recovery requires an idle, editable workspace.'); }
        if (this.document.objects.length || this.document.packaging?.paths?.length) { throw new Error ('Save and close the current session before restoring recovery.'); }
        const { recovery, buffer, validationError } = await this.ReadRecovery ();
        if (this.readOnly || this.busy || this.document.objects.length || this.document.packaging?.paths?.length) { throw new Error ('Workspace changed before recovery could be restored.'); }
        if (!recovery?.archive) { throw new Error ('No unsaved recovery checkpoint is available for this account on this device.'); }
        if (validationError) { throw validationError; }
        await this.OpenArchive (buffer.slice (0), false, true);
        // Retain the only unsaved copy until an explicit full-session save.
        this.MarkDirty (); this.recoveryPromptHandled = true;
        this.Status ('Recovered unsaved session · Save to keep it.'); return { recovered : true, objects : this.document.objects.length };
    }
    async OfferRecovery (force = false)
    {
        if (this.recoveryPromptOpen || this.recoveryPromptHandled && !force) { return { opened : false }; }
        if (this.document.objects.length || this.document.packaging?.paths?.length) { const message = 'Save and close the current session before restoring recovery.'; if (force) { this.Status (message); } return { opened : false, reason : message }; }
        let result;
        try { result = await this.ReadRecovery (); }
        catch (error) { console.warn ('Auto3D recovery lookup failed.', error); if (force) { this.Status (error.message); } return { opened : false, reason : error.message }; }
        const { recovery, validationError } = result;
        if (!recovery?.archive) { const message = 'No unsaved recovery checkpoint is available for this account on this device.'; if (force) { this.Status (message); } return { opened : false, reason : message }; }
        if (validationError) { this.website.errorLogs?.Record ('error', 'recovery', validationError.message); }

        this.recoveryPromptOpen = true;
        const dialog = WorkspaceDialog ('Recover unsaved session');
        const body = document.createElement ('div'); body.className = 'workspace_save_form';
        const timestamp = recovery.updatedAt ? new Date (recovery.updatedAt) : null;
        const message = document.createElement ('p');
        message.textContent = validationError
            ? 'The saved recovery checkpoint cannot be opened: ' + validationError.message
            : 'Auto3D found an unsaved recovery checkpoint' + (timestamp && !Number.isNaN (timestamp.getTime ()) ? ' from ' + timestamp.toLocaleString () : '') + '.';
        const restore = document.createElement ('button'); restore.type = 'button'; restore.className = 'workspace_primary'; restore.textContent = 'Restore recovery'; restore.disabled = Boolean (validationError) || this.readOnly;
        const discard = document.createElement ('button'); discard.type = 'button'; discard.textContent = validationError ? 'Discard invalid recovery' : 'Discard recovery';

        const dismiss = () => {
            this.recoveryPromptHandled = true;
            this.recoveryPromptOpen = false;
            if (dialog.open) { dialog.close (); }
        };

        restore.addEventListener ('click', async () => {
            dismiss ();
            this.Status ('Restoring recovery…');
            try {
                await this.RestoreRecovery ();
            } catch (error) {
                this.Status ('Recovery could not be restored: ' + error.message);
            }
        }, { once : true });

        discard.addEventListener ('click', async () => {
            dismiss ();
            try {
                await this.DiscardRecovery ();
                this.Status ('Recovery checkpoint discarded.');
            } catch (error) {
                this.Status ('Recovery could not be discarded: ' + error.message);
            }
        }, { once : true });

        dialog.addEventListener ('close', () => { this.recoveryPromptOpen = false; }, { once : true });
        body.append (message, restore, discard); dialog.appendChild (body); return { opened : true, valid : !validationError };
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

    async Render (fit = false, beforeDisplay = null)
    {
        this.website.viewModes?.Restore (); this.timeline.Stop (); this.packaging.presentation?.Clear (); this.DisposeModelPreview ();
        this.busy = true; this.controls.detach (); this.players.forEach ((player) => player.Dispose ()); this.players = [];
        try {
            if (!this.document.objects.length) { this.selectionBox.visible = false; this.DisposeModelPreview (); this.website.ClearModel (); this.website.SetUIState (1); this.RefreshUI (); return; }
            const output = new ModelToThreeConversionOutput ();
            const root = await new Promise ((resolve, reject) => ConvertModelToThreeObject (this.document.model, new ModelToThreeConversionParams (), output, { onTextureLoaded : () => this.website.viewer.RequestRender (), onModelLoaded : resolve, onError : reject })).catch (error => { output.objectUrls.forEach (URL.revokeObjectURL); throw error; });
            for (let index = 0; index < this.document.objects.length; index++) {
                const object = this.document.objects[index]; object.threeObject = root.children[index]; object.threeObject.name = object.name;
                if (object.animationAsset) {
                    try { const player = await LoadAnimationScene (object, this.document.model, () => this.website.viewer.Render ()); if (player) { this.players.push (player); } else { object.animationAsset = null; } }
                    catch (error) { object.animationError = 'Animation unavailable: ' + error.message; }
                }
            }
            this.document.objects.forEach ((object) => { object.threeObject.visible = object.visible; });
            await PreparePackagingPresentations (this.document.objects, this.document.model.materials, this.document.model.GetUnit ());
            if (beforeDisplay) { beforeDisplay (); }
            this.website.navigator.Clear ();
            this.website.SetUIState (2);
            this.website.OnModelLoaded ({ model : this.document.model, mainFile : this.document.name, usedFiles : this.document.objects.map ((object) => object.source), missingFiles : [] }, root, fit);
            this.document.objects.forEach ((object) => {
                let index = 0; this.document.model.EnumerateMeshInstances ((instance) => { if (this.document.Owner (instance) === object) { if (object.hiddenParts?.includes (index)) { this.website.navigator.ToggleMeshVisibility (instance.id); } index++; } });
            });
            if (this.objectUrls) { this.objectUrls.forEach (URL.revokeObjectURL); } this.objectUrls = output.objectUrls;
            this.website.sidebar.detailsPanel.modelFormat = 'SESSION';
            this.website.UpdateMeshesVisibility ();
            this.website.sceneEffects?.ApplyObjectSettings (this.document.objects);
            await this.packaging.presentation?.PrepareAll (); this.packaging.presentation?.Apply (this.timeline.time, false);
            this.RefreshUI (); this.Select (this.selected); this.website.sceneEffects?.Refresh (); this.website.viewModes?.Refresh (); this.website.viewer.Render ();
        } finally { this.busy = false; this.RefreshButtons (); this.website.materialPanel?.Update (); }
    }

    ApplyTransform (object)
    {
        this.document.ApplyTransform (object);
        if (object.threeObject) { object.threeObject.position.fromArray (object.position); object.threeObject.rotation.set (...object.rotation.map (THREE.MathUtils.degToRad)); object.threeObject.scale.fromArray (object.scale); object.threeObject.updateMatrixWorld (true); }
        this.website.viewer.UpdateGroundGrid (); this.UpdateSelectionBox (); this.website.sceneEffects?.Refresh (); this.website.viewer.Render (); this.SyncInputs ();
    }
    RecordTransform (object, before)
    {
        if (this.liveDetailsEditing) { return; }
        const after = TransformState (object); if (JSON.stringify (before) === JSON.stringify (after)) { return; }
        const apply = (state) => { Object.assign (object, { position : [...state.position], rotation : [...state.rotation], scale : [...state.scale] }); this.ApplyTransform (object); this.UpdateDetails (); };
        this.history.Push ({ undo : () => apply (before), redo : () => apply (after) }); this.RefreshButtons ();
    }

    TransformSelection (args, primary = this.selected)
    {
        if (this.readOnly || this.busy || !primary) { throw new Error ('Select editable objects.'); }
        const objects = this.SelectedObjects ().includes (primary) ? this.SelectedObjects () : [primary];
        const records = objects.map ((object) => ({ object, before : TransformState (object) }));
        const matrix = (state) => new THREE.Matrix4 ().compose (new THREE.Vector3 (...state.position), new THREE.Quaternion ().setFromEuler (new THREE.Euler (...state.rotation.map (THREE.MathUtils.degToRad))), new THREE.Vector3 (...state.scale));
        const next = { ...TransformState (primary), ...args }; if (next.scale.some ((value) => !Number.isFinite (value) || Math.abs (value) < 1e-6)) { throw new Error ('Scale components must be nonzero.'); }
        const delta = matrix (next).multiply (matrix (TransformState (primary)).invert ());
        records.forEach ((item) => { const position = new THREE.Vector3 (); const rotation = new THREE.Quaternion (); const scale = new THREE.Vector3 (); delta.clone ().multiply (matrix (item.before)).decompose (position, rotation, scale); const euler = new THREE.Euler ().setFromQuaternion (rotation); item.after = { position : position.toArray (), rotation : [euler.x, euler.y, euler.z].map (THREE.MathUtils.radToDeg), scale : scale.toArray () }; });
        const apply = (key) => { records.forEach ((item) => { Object.assign (item.object, JSON.parse (JSON.stringify (item[key]))); this.document.ApplyTransform (item.object); const root = item.object.threeObject; if (root) { root.position.fromArray (item.object.position); root.rotation.set (...item.object.rotation.map (THREE.MathUtils.degToRad)); root.scale.fromArray (item.object.scale); root.updateMatrixWorld (true); } }); this.UpdateSelectionBox (); this.SyncInputs (); this.UpdateDetails (); this.website.viewer.UpdateGroundGrid (); this.website.sceneEffects?.Refresh (); this.website.viewer.Render (); };
        apply ('after'); this.history.Push ({ undo : () => apply ('before'), redo : () => apply ('after') }); return { objectIds : objects.map ((object) => object.id) };
    }

    SetMode (mode) { if (this.website.dimensions?.active) { this.website.dimensions.SetActive (false); } if (this.readOnly && mode !== 'select') { return; } this.SetRotationAxisOverride (null); this.mode = mode; this.Select (this.selected, false, true); }
    SetRotationAxisOverride (axis)
    {
        if (axis !== null && !['X', 'Y', 'Z'].includes (axis)) { throw new Error ('Choose X, Y or Z.'); }
        const controls = this.controls; if (!controls) { return; }
        if (axis && this.mode === 'rotate') {
            this.rotationAxisBefore ||= { showX : controls.showX, showY : controls.showY, showZ : controls.showZ, axis : controls.axis };
            controls.showX = axis === 'X'; controls.showY = axis === 'Y'; controls.showZ = axis === 'Z'; if (controls.dragging) { controls.axis = axis; }
        } else if (this.rotationAxisBefore) { Object.assign (controls, this.rotationAxisBefore); this.rotationAxisBefore = null; }
        this.website.viewer?.RequestRender?.();
    }
    SelectedObjects () { return this.document.objects.filter ((object) => this.selectedIds?.has (object.id)); }
    Select (object, fromNavigator = false, additive = false, single = false)
    {
        this.selected = object && this.document.objects.includes (object) ? object : null;
        if (!this.selectedIds) { this.selectedIds = new Set (); }
        if (!additive) { this.selectedIds.clear (); }
        if (this.selected) { const group = !single && this.selected.userData?._auto3dGroup; this.document.objects.filter ((item) => item === this.selected || (group && item.userData?._auto3dGroup === group)).forEach ((item) => this.selectedIds.add (item.id)); }
        this.controls.detach ();
        const selection = this.SelectedObjects ();
        if (selection.length > 1 && this.mode !== 'select' && !this.readOnly) { const bounds = new THREE.Box3 (); selection.forEach ((item) => { if (item.threeObject) { bounds.union (new THREE.Box3 ().setFromObject (item.threeObject)); } }); this.selectionPivot.position.copy (bounds.getCenter (new THREE.Vector3 ())); this.selectionPivot.rotation.set (0, 0, 0); this.selectionPivot.scale.set (1, 1, 1); this.selectionPivot.updateMatrix (); this.controls.setMode (this.mode); this.controls.attach (this.selectionPivot); }
        else if (this.selected?.threeObject && this.selected.visible && this.mode !== 'select') { this.controls.setMode (this.mode); this.controls.attach (this.selected.threeObject); }
        this.transformPanel.hidden = !this.selected || this.mode === 'select';
        if (!fromNavigator && this.selected) {
            let first = null; this.document.model.EnumerateMeshInstances ((instance) => { if (!first && this.document.Owner (instance) === this.selected) { first = instance.id; } });
            const current = this.website.navigator.GetSelectedMeshId (); if (first && (!current || !current.IsEqual (first))) { this.selecting = true; try { this.website.navigator.SetSelection (new Selection (SelectionType.Mesh, first)); } finally { this.selecting = false; } }
        }
        if (!this.selected && !fromNavigator && this.website.navigator.GetSelectedMeshId ()) { this.website.navigator.SetSelection (null); }
        this.UpdateSelectionBox (); this.SyncInputs (); this.RefreshUI (); this.UpdateDetails (); this.website.viewer.Render ();
    }
    SelectionChanged ()
    {
        if (this.selecting) { return; }
        const id = this.website.navigator.GetSelectedMeshId (); const instance = id && this.website.model ? this.website.model.GetMeshInstance (id) : null;
        this.Select (this.document.Owner (instance), true);
    }
    IsVisible (instance) { return this.document.Owner (instance)?.visible !== false; }
    GetObjectBaseSize (object)
    {
        if (!object?.threeObject) { return [0, 0, 0]; }
        const cached = this.baseSizes.get (object.threeObject);
        if (cached) { return [...cached]; }
        const root = object.threeObject; root.updateWorldMatrix (true, true);
        const inverse = root.matrixWorld.clone ().invert (); const box = new THREE.Box3 (); const point = new THREE.Vector3 ();
        root.traverse ((mesh) => {
            if (mesh.userData?.auto3dFoldPresentation) { return; }
            const positions = mesh.geometry?.attributes?.position; if (!positions) { return; }
            const relative = new THREE.Matrix4 ().multiplyMatrices (inverse, mesh.matrixWorld);
            const canonical = mesh.userData?.auto3dBoardAppearance ? mesh.userData.originalMeshInstance?.GetMesh?.().vertices : null;
            if (canonical) { canonical.forEach (vertex => box.expandByPoint (point.set (vertex.x, vertex.y, vertex.z).applyMatrix4 (relative))); return; }
            for (let index = 0; index < positions.count; index++) {
                if (mesh.isMesh) { mesh.getVertexPosition (index, point); } else { point.fromBufferAttribute (positions, index); }
                box.expandByPoint (point.applyMatrix4 (relative));
            }
        });
        const result = box.getSize (new THREE.Vector3 ()).toArray (); this.baseSizes.set (root, result);
        return result;
    }

    UpdateSelectionBox ()
    {
        if (this.packaging?.foldOperation || this.packaging?.presentation?.HasVisiblePreview () || this.arrayOperation || !this.selected?.threeObject || !this.selected.visible) {
            this.selectionBox.visible = false;
            return;
        }
        this.selectionBounds.makeEmpty (); (this.SelectedObjects ().length ? this.SelectedObjects () : [this.selected]).forEach ((object) => { if (object.threeObject && object.visible) { const include = () => this.selectionBounds.union (new THREE.Box3 ().setFromObject (object.threeObject)); if (this.packaging?.presentation) { this.packaging.presentation.WithOriginal (object, include); } else { include (); } } });
        this.selectionBox.visible = !this.selectionBounds.isEmpty ();
        this.selectionBox.updateMatrixWorld (true);
    }

    SyncInputs ()
    {
        const units = this.website.preferences?.units || 'metric';
        const factor = this.selected ? UnitFactor (this.selected.unit, units) : null;
        const base = this.selected ? this.GetObjectBaseSize (this.selected) : [0, 0, 0];
        if (this.scaleHeading) {
            this.scaleHeading.textContent = 'Size (' + (factor === null ? 'model units' : DisplayUnitLabel (units)) + ')';
        }
        if (this.transformHint) {
            this.transformHint.textContent = factor === null ? 'Position and size use model units because this model has no declared unit.' : 'Position and size follow the global ' + DisplayUnitLabel (units) + ' preference.';
        }
        for (const { input, key, axis } of this.inputs) {
            if (!this.selected) { input.value = ''; continue; }
            const value = key === 'scale' ? DisplaySizeFromScale (base[axis], this.selected.scale[axis], this.selected.unit, units) : key === 'position' ? this.selected.position[axis] * (factor ?? 1) : this.selected[key][axis];
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
        this.website?.dimensions?.Draw (this.website.viewer.camera);
        this.website?.primaryProductsPanel?.RefreshAvailability ();
        this.processing?.Sync (this.busy && !this.packaging?.foldOperation && !this.packaging?.dimensionUpdating && this.arrayOperation?.stage !== 'revealing' && !this.website?.rendering?.running); this.commandBar?.SetBusy (this.busy);
        this.website?.packagingPanel?.fefcoPanel?.SetDisabled ();
        for (const [key, button] of this.buttons) {
            button.disabled = this.ToolDisabled (key) || button.hasAttribute?.('aria-busy') === true;
            if (key === 'dimension') { button.setAttribute ('aria-pressed', String (this.website.dimensions?.active === true)); }
            if (['select', 'move', 'rotate', 'scale'].includes (key)) { button.setAttribute ('aria-pressed', String ((key === 'move' ? 'translate' : key) === this.mode)); }
        }
        const groupButtons = this.objectList?.querySelectorAll ('.selection_group_tools button');
        if (groupButtons?.length === 2) { groupButtons[0].disabled = this.readOnly || this.busy || this.SelectedObjects ().length < 2; groupButtons[1].disabled = this.readOnly || this.busy || !this.SelectedObjects ().some ((object) => object.userData?._auto3dGroup); }
        if (this.headerExport) { this.headerExport.disabled = this.busy || this.readOnly || !this.document.objects.length; }
    }
    RefreshUI ()
    {
        this.RefreshButtons (); this.objectList.replaceChildren ();
        if (!this.document.objects.length) { Element ('p', 'section_hint', 'Add multiple models and select an object to edit its placement.', this.objectList); }
        this.groupExpanded ||= new Map (); const groups = SceneGroups (this.document.objects); const hosts = new Map ();
        for (const object of this.document.objects) {
            let host = this.objectList; const group = groups.find (group => group.id === object.userData?._auto3dGroup);
            if (group) {
                if (!hosts.has (group.id)) { const details = Element ('details', 'scene_object_group', undefined, this.objectList); details.dataset.sceneGroup = group.id; details.open = this.groupExpanded.get (group.id) === true; Element ('summary', null, group.name + ' (' + group.objects.length + ')', details); details.addEventListener ('toggle', () => { if (details.isConnected) { this.SetGroupExpanded (group.id, details.open); } }); hosts.set (group.id, details); }
                host = hosts.get (group.id);
            }
            const row = Element ('div', 'session_object_row', undefined, host); row.classList.toggle ('selected', this.selectedIds.has (object.id));
            const select = Element ('button', 'object_name editable_name', object.name, row);
            select.title = object === this.selected ? 'Click again to rename · ' + object.source : 'Select ' + object.name + ' · ' + object.source;
            select.setAttribute ('aria-label', (object === this.selected ? 'Rename ' : 'Select ') + object.name);
            select.addEventListener ('mouseenter', () => object.threeObject?.traverse ((item) => { if (item.isMesh) { item.userData.auto3dNameHover = true; } }));
            select.addEventListener ('mouseleave', () => object.threeObject?.traverse ((item) => { if (item.isMesh) { delete item.userData.auto3dNameHover; } }));
            select.addEventListener ('click', (event) => { if (event.ctrlKey || event.metaKey) { this.Select (object, false, true); } else if (object === this.selected) { this.RenameObject (object); } else { this.Select (object); } });
            const visible = Element ('button', null, object.visible ? '◉' : '○', row); visible.title = object.visible ? 'Hide object' : 'Show object'; visible.setAttribute ('aria-label', visible.title + ' ' + object.name); visible.addEventListener ('click', () => { this.Select (object); this.ToggleVisibility (); });
            const update = Element ('button', null, '↻', row); update.title = 'Replace model, keep placement'; update.setAttribute ('aria-label', 'Update ' + object.name); update.addEventListener ('click', () => this.UpdateModel (object));
        }
        this.website.navigator?.meshesPanel?.SetSceneGroups?.(groups, this.groupExpanded, (id, expanded) => this.SetGroupExpanded (id, expanded));
        const selectionTools = Element ('div', 'selection_group_tools', undefined, this.objectList);
        Element ('p', 'section_hint', this.SelectedObjects ().length + ' selected · Ctrl + click adds to selection.', selectionTools);
        const group = Element ('button', null, 'Group selection', selectionTools); group.disabled = this.readOnly || this.busy || this.SelectedObjects ().length < 2; group.onclick = () => this.Run (() => this.GroupObjects ());
        const ungroup = Element ('button', null, 'Ungroup selection', selectionTools); ungroup.disabled = this.readOnly || this.busy || !this.SelectedObjects ().some ((object) => object.userData?._auto3dGroup); ungroup.onclick = () => this.Run (() => this.UngroupObjects ());
        this.AnimationUI ();
    }
    UpdateDetails ()
    {
        if (this.updatingDetails) { return; }
        this.updatingDetails = true;
        try { this.RenderDetails (); } finally { this.updatingDetails = false; }
    }
    RenderDetails ()
    {
        if (this.liveDetailsEditing) { this.SyncLiveDimensions (); return; }
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
        const instances = []; this.document.model.EnumerateMeshInstances ((instance) => { if (this.document.Owner (instance) === object) { instances.push (instance); } });
        table.querySelectorAll ('.ov_property_table_row').forEach ((row) => { if (['Volume:', 'Surface:'].includes (row.querySelector ('.ov_property_table_name')?.textContent)) { row.remove (); } });
        panel.AddCalculatedProperty (table, 'Volume', () => instances.every (IsTwoManifold) ? new Property (PropertyType.Text, null, DisplayQuantity (instances.reduce ((value, instance) => value + Math.abs (CalculateVolume (instance)), 0), object.unit, this.website.preferences.units, 3)) : null);
        panel.AddCalculatedProperty (table, 'Surface', () => new Property (PropertyType.Text, null, DisplayQuantity (instances.reduce ((value, instance) => value + CalculateSurfaceArea (instance), 0), object.unit, this.website.preferences.units, 2)));
        const counts = { vertices : 0, triangles : 0 }; object.node.EnumerateMeshIndices ((index) => { const mesh = this.document.model.GetMesh (index); counts.vertices += mesh.VertexCount (); counts.triangles += mesh.TriangleCount (); });
        table.querySelectorAll ('.scene_polygon_tool').forEach ((row) => row.remove ());
        for (const row of table.querySelectorAll ('.ov_property_table_row')) {
            const label = row.querySelector ('.ov_property_table_name')?.textContent;
            if (label === 'Vertices:' || label === 'Triangles:') { row.querySelector ('.ov_property_table_value').textContent = (label === 'Triangles:' ? counts.triangles : counts.vertices).toLocaleString (); }
            if (label === 'Triangles:') { const tool = Element ('div', 'scene_polygon_tool'); const button = Element ('button', null, 'Optimize polygons…', tool); button.disabled = this.readOnly; button.onclick = () => this.OpenPolygonTool (); row.after (tool); }
        }
        const base = this.GetObjectBaseSize (object);
        const units = this.website.preferences.units;
        const unitLabel = UnitFactor (object.unit, units) === null ? 'model units' : DisplayUnitLabel (units);
        const sizes = [
            DisplaySizeFromScale (base[0], object.scale[0], object.unit, units),
            DisplaySizeFromScale (base[2], object.scale[2], object.unit, units),
            DisplaySizeFromScale (base[1], object.scale[1], object.unit, units)
        ];
        panel.AddProperty (table, new Property (PropertyType.Text, 'Object', object.name)).classList.add ('scene_dimension');
        for (const [title, label, axis, value] of [['Width (W / X)', 'W', 0, sizes[0]], ['Length (L / Z)', 'L', 2, sizes[1]], ['Height (H / Y)', 'H', 1, sizes[2]]]) {
            const row = panel.AddProperty (table, new Property (PropertyType.Text, title, '')); row.classList.add ('scene_dimension');
            const cell = row.querySelector ('.ov_property_table_value');
            const input = Element ('input', 'scene_dimension_input', undefined, cell); input.type = 'number'; input.step = 'any'; input.min = '0.000001'; input.value = Number (value.toFixed (5)); input.disabled = this.readOnly || base[axis] <= 1e-12;
            input.setAttribute ('aria-label', label + ' dimension in ' + unitLabel); Element ('span', 'scene_dimension_unit', ' ' + unitLabel, cell);
            input.dataset.dimensionAxis = String (axis);
            this.BindLiveDimension (input, object, value => this.SetObjectDisplayDimension (object, axis, value, this.proportionalScaling));
        }
        panel.contentDiv.querySelectorAll ('.scene_object_details').forEach ((item) => item.remove ());
        const details = Element ('div', 'scene_object_details', undefined, panel.contentDiv);
        const proportional = Element ('button', 'scene_proportion_button', 'Proportional scaling', details); proportional.setAttribute ('aria-pressed', String (this.proportionalScaling)); proportional.disabled = this.readOnly;
        proportional.onclick = () => { this.SetProportionalScaling (!this.proportionalScaling); };
        const percentLabel = Element ('label', 'scene_scale_percent', 'Scale (%)', details); const percent = Element ('input', null, undefined, percentLabel); percent.type = 'number'; percent.step = 'any'; percent.min = '0.0001'; percent.value = '100'; percent.disabled = this.readOnly; percent.setAttribute ('aria-label', 'Scale percentage');
        this.BindLiveDimension (percent, object, (value, before) => this.ScaleByPercentage (object, value, before.scale));
        Element ('p', 'section_hint', 'Percentage multiplies the current size on all axes. W = X · L = Z · H = Y.', details);

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

        Element ('strong', null, 'User data', details);
        const userDataList = Element ('div', 'scene_user_data', undefined, details);
        const renderUserData = () => {
            userDataList.replaceChildren ();
            const entries = Object.entries (object.userData || {}).filter (([key]) => !key.startsWith ('_auto3d'));
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
                remove.addEventListener ('click', () => { try { this.RemoveUserData (object, key); } catch (error) { this.Status (error.message); } renderUserData (); });
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
        ReleaseWebGLRenderer (this.modelPreview.renderer);
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

        if (!panel.IsVisible () || this.website.parameters.rightContainerDiv.classList.contains ('collapsed')) { element.remove (); return; }
        let renderer;
        try { renderer = new THREE.WebGLRenderer ({ canvas, antialias : true, alpha : true, preserveDrawingBuffer : false }); }
        catch (error) { element.remove (); throw error; }
        this.modelPreview = { object, root : object.threeObject, element, renderer };
        try {
        renderer.setPixelRatio (Math.min (window.devicePixelRatio || 1, 2)); renderer.setSize (300, 190, false); renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene ();
        const camera = new THREE.PerspectiveCamera (32, 300 / 190, 0.01, 100); camera.position.set (1.8, 1.25, 2.6); camera.lookAt (0, 0, 0);
        scene.add (new THREE.HemisphereLight (0xffffff, 0x777777, 2.0));
        const key = new THREE.DirectionalLight (0xffffff, 2.4); key.position.set (3, 4, 5); scene.add (key);

        const pivot = new THREE.Group (); scene.add (pivot);
        const metadata = new Map (); object.threeObject.traverse ((item) => { metadata.set (item, item.userData); item.userData = {}; });
        let clone;
        try { clone = CloneRig (object.threeObject); }
        finally { metadata.forEach ((data, item) => { item.userData = data; }); }
        clone.position.copy (object.threeObject.position); clone.rotation.copy (object.threeObject.rotation); clone.scale.copy (object.threeObject.scale); clone.updateMatrixWorld (true);
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
        Object.assign (this.modelPreview, { scene, camera, pivot });
        } catch (error) { this.DisposeModelPreview (); throw error; }
    }

    SyncLiveDimensions ()
    {
        const object = this.selected; if (!object) { return; } const base = this.GetObjectBaseSize (object);
        for (const input of this.website.sidebar.detailsPanel.contentDiv.querySelectorAll ('[data-dimension-axis]')) {
            if (input === document.activeElement) { continue; } const axis = Number (input.dataset.dimensionAxis);
            input.value = Number (DisplaySizeFromScale (base[axis], object.scale[axis], object.unit, this.website.preferences.units).toFixed (5));
        }
    }
    BindLiveDimension (input, object, apply)
    {
        let before = null;
        input.addEventListener ('focus', () => { before = TransformState (object); });
        input.addEventListener ('input', () => {
            if (this.readOnly || this.busy || !Number.isFinite (input.valueAsNumber) || input.valueAsNumber <= 0) { return; }
            before ||= TransformState (object); this.liveDetailsEditing = true;
            try { apply (input.valueAsNumber, before); this.MarkDirty (); } catch (error) { this.Status (error.message); }
            finally { this.liveDetailsEditing = false; }
        });
        const finish = () => { if (!before) { return; } const previous = before; before = null; this.RecordTransform (object, previous); this.UpdateDetails (); };
        input.addEventListener ('change', finish); input.addEventListener ('blur', finish);
    }

    SetObjectDisplayDimension (object, axis, value, proportional = false)
    {
        if (this.readOnly || !object || !Number.isInteger (axis) || axis < 0 || axis > 2 || !Number.isFinite (value)) { return; }
        const base = this.GetObjectBaseSize (object);
        const next = ScaleFromDisplaySize (base[axis], value, object.unit, this.website.preferences.units);
        if (next === null || !Number.isFinite (next) || Math.abs (next) < 1e-6) { return; }
        const before = TransformState (object);
        if (proportional) { const ratio = next / Math.abs (object.scale[axis]); object.scale = object.scale.map ((scale) => scale * ratio); }
        else { object.scale[axis] = next * Math.sign (object.scale[axis] || 1); }
        this.ApplyTransform (object);
        this.RecordTransform (object, before);
        this.UpdateDetails ();
    }

    SetProportionalScaling (enabled) { this.proportionalScaling = Boolean (enabled); this.UpdateDetails (); return { proportional : this.proportionalScaling }; }
    ScaleByPercentage (object, percent, baseline = object.scale)
    {
        if (this.readOnly || this.busy || !object || !Number.isFinite (percent) || percent <= 0 || percent > 100000 || baseline.some ((value) => !Number.isFinite (value) || Math.abs (value * percent / 100) < 1e-6)) { throw new Error ('Enter a positive scale percentage with nonzero resulting dimensions.'); }
        const before = TransformState (object); object.scale = baseline.map ((value) => value * percent / 100); this.ApplyTransform (object); this.RecordTransform (object, before); this.UpdateDetails (); return { id : object.id, scale : [...object.scale] };
    }

    ShowAdvanceAnimation (visible) { ShowAdvanceAnimation (this, visible); }
    CreateTimelineTracks (parent) { CreateTimelineTracks (this, parent); }
    UpdatePlayheads () { UpdatePlayheads (this); }

    AnimationUI ()
    {
        this.animationPanel.replaceChildren ();
        const timeline = this.timeline;
        timeline.ExtendDurationForKeys ();

        if (!this.advancePanel) {
            this.advancePanel = Element ('section', 'advance_animation_panel', undefined, document.body);
            this.advancePanel.id = 'advance_animation_panel'; this.advancePanel.hidden = true; this.advancePanel.setAttribute ('aria-label', 'Advance animation');
        }
        this.advancePanel.replaceChildren ();
        const open = Element ('button', 'advance_animation_button', 'Advance animation', this.animationPanel);
        open.setAttribute ('aria-expanded', String (!this.advancePanel.hidden)); open.setAttribute ('aria-controls', this.advancePanel.id);
        open.addEventListener ('click', () => this.ShowAdvanceAnimation (this.advancePanel.hidden));
        const close = Element ('button', 'advance_animation_close', 'Close', this.advancePanel); close.setAttribute ('aria-label', 'Close Advance animation');
        close.addEventListener ('click', () => this.ShowAdvanceAnimation (false));
        const native = Element ('div', 'native_timeline', undefined, this.advancePanel);
        const nativeHeader = Element ('div', 'timeline_header', undefined, native);
        Element ('strong', null, 'Advance animation', nativeHeader);
        const cameraNow = CaptureCameraState (this.website.viewer);
        Element ('span', 'timeline_camera_readout', 'Cam ' + cameraNow.azimuth.toFixed (1) + '° az · ' + cameraNow.elevation.toFixed (1) + '° el', nativeHeader);

        const cameraSettings = Element ('button', 'timeline_camera_settings', 'Camera settings', nativeHeader);
        cameraSettings.addEventListener ('click', () => this.website.cameraPanel.Open ());

        const settings = Element ('div', 'timeline_settings', undefined, native);
        const durationLabel = Element ('label', null, 'Duration', settings); const duration = Element ('input', null, undefined, durationLabel); duration.type = 'number'; duration.min = '0.1'; duration.max = '3600'; duration.step = '0.1'; duration.value = String (timeline.duration); duration.setAttribute ('aria-label', 'Timeline duration in seconds');
        duration.disabled = this.readOnly;
        duration.addEventListener ('change', () => { timeline.SetDuration (Number (duration.value)); this.MarkDirty (); this.AnimationUI (); });
        const tweenLabel = Element ('label', null, 'Tween', settings); const tween = Element ('select', null, undefined, tweenLabel); tween.setAttribute ('aria-label', 'Keyframe interpolation'); [['smooth', 'Smooth'], ['linear', 'Linear'], ['step', 'Step']].forEach (([value, label]) => tween.add (new Option (label, value))); tween.value = timeline.interpolation;
        tween.disabled = this.readOnly;
        tween.addEventListener ('change', () => { timeline.interpolation = tween.value; this.MarkDirty (); });
        const loopLabel = Element ('label', 'timeline_loop_label', undefined, settings); const loop = Element ('input', null, undefined, loopLabel); loop.type = 'checkbox'; loop.checked = timeline.loop; loop.disabled = this.readOnly; loopLabel.appendChild (document.createTextNode (' Loop')); loop.addEventListener ('change', () => { timeline.loop = loop.checked; this.MarkDirty (); });

        const capture = Element ('div', 'mode_buttons timeline_capture_buttons', undefined, native);
        const addObject = Element ('button', null, 'Keyframe scene state', capture); addObject.disabled = this.readOnly || !this.document.objects.length; addObject.title = 'Save every scene object position, rotation and scale at the current time.';
        addObject.addEventListener ('click', () => { timeline.CaptureScene (); this.MarkDirty (); this.AnimationUI (); });
        const addAction = Element ('button', null, 'Action', capture); addAction.disabled = this.readOnly || this.busy || !this.selected?.userData?._auto3dFefco; addAction.addEventListener ('click', () => this.Run (() => this.packaging.OpenTimelineAction ()));
        const addCamera = Element ('button', null, 'Keyframe camera', capture); addCamera.disabled = this.readOnly; addCamera.title = 'Save viewer eye, target, up vector, FOV, azimuth and elevation at the current time.';
        addCamera.addEventListener ('click', () => { timeline.CaptureCamera (); this.MarkDirty (); this.AnimationUI (); });

        const controls = Element ('div', 'mode_buttons timeline_transport', undefined, native);
        const play = Element ('button', null, timeline.playing ? 'Pause' : 'Play', controls); play.addEventListener ('click', () => { timeline.Toggle (); play.textContent = timeline.playing ? 'Pause' : 'Play'; });
        const reset = Element ('button', null, 'Reset', controls); reset.addEventListener ('click', () => { timeline.Reset (); this.MarkDirty (); this.AnimationUI (); });
        const timeText = Element ('span', 'timeline_time_text', timeline.time.toFixed (2) + ' / ' + timeline.duration.toFixed (2) + ' s', controls);

        this.CreateTimelineTracks (native);
        const scrub = Element ('input', 'timeline_scrub', undefined, native); scrub.type = 'range'; scrub.min = '0'; scrub.max = String (timeline.duration); scrub.step = '0.01'; scrub.value = String (timeline.time); scrub.setAttribute ('aria-label', 'Auto3D keyframe timeline');
        scrub.addEventListener ('input', () => { timeline.Seek (Number (scrub.value)); timeText.textContent = timeline.time.toFixed (2) + ' / ' + timeline.duration.toFixed (2) + ' s'; this.MarkDirty (); });
        timeline.onTime = (time) => { this.UpdatePlayheads (); if (document.activeElement !== scrub) { scrub.value = String (time); } timeText.textContent = time.toFixed (2) + ' / ' + timeline.duration.toFixed (2) + ' s'; };
        timeline.onPlaybackChanged = (playing) => { play.textContent = playing ? 'Pause' : 'Play'; this.MarkDirty (); };

        const keys = Element ('div', 'timeline_keyframes', undefined, native);
        const entries = timeline.cameraKeyframes.map ((keyframe) => ({ type : 'camera', keyframe, object : null, label : 'Camera' }));
        for (const object of this.document.objects) {
            timeline.NormalizeObjectKeyframes (object).forEach ((keyframe) => entries.push ({ type : 'object', keyframe, object, label : object.name }));
        }
        for (const action of timeline.actions) { const object = this.document.objects.find (object => object.id === action.objectId); if (object) { entries.push ({ type : 'action', keyframe : action, object, label : object.name + ' · ' + action.direction + ' fold action (' + action.duration + ' s)' }); } }
        entries.sort ((left, right) => left.keyframe.time - right.keyframe.time || left.type.localeCompare (right.type));
        if (!entries.length) {
            Element ('p', 'section_hint', 'Set the timeline time, position an object or the viewer camera, then save a keyframe. Smooth tweening is applied between keyframes by default.', keys);
        } else {
            for (const entry of entries) {
                const row = Element ('div', 'timeline_keyframe_row', undefined, keys);
                const seek = Element ('button', 'timeline_keyframe_seek', entry.keyframe.time.toFixed (2) + 's · ' + entry.label, row);
                seek.title = entry.type === 'camera'
                    ? 'Camera · ' + entry.keyframe.azimuth.toFixed (1) + '° az · ' + entry.keyframe.elevation.toFixed (1) + '° el · ' + DisplayLength (entry.keyframe.distance, this.document.model.GetUnit (), this.website.preferences.units) + ' distance'
                    : entry.label + (entry.type === 'action' ? ' · procedural fold' : ' · ' + entry.keyframe.interpolation + ' tween');
                seek.addEventListener ('click', () => { timeline.Seek (entry.keyframe.time); this.AnimationUI (); });
                Element ('span', 'timeline_keyframe_mode', entry.type === 'action' ? 'Action' : entry.keyframe.interpolation, row);
                if (!this.readOnly) {
                    const remove = Element ('button', 'timeline_keyframe_delete', '×', row); remove.title = 'Delete keyframe';
                    remove.addEventListener ('click', () => { if (entry.type === 'action') { timeline.DeleteAction (entry.keyframe.id); } else { timeline.DeleteKeyframe (entry.type, entry.keyframe.id, entry.object); } this.MarkDirty (); this.AnimationUI (); });
                }
            }
        }

        const player = this.selected?.player;
        const embedded = Element ('div', 'embedded_animation', undefined, this.animationPanel);
        Element ('strong', null, 'Embedded animation', embedded);
        if (!player) {
            if (this.selected?.animationError) { Element ('p', 'section_hint', this.selected.animationError, embedded); }
            else if (!this.selected) { Element ('p', 'section_hint', 'Select a model to inspect any embedded GLB/glTF animation clips.', embedded); }
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

    OpenPolygonTool () { return this.polygonOptimizer.Open (); }

    ArrayDialog ()
    {
        if (!this.selected) { return; }
        const dialog = WorkspaceDialog ('Array selected model');
        dialog.classList.add ('array_dialog');
        const form = Element ('form', 'workspace_save_form', undefined, dialog);
        const countRow = Element ('div', 'array_counts', undefined, form);
        Element ('p', 'section_hint', 'Copy the selected model. W = X · L = Z · H = Y. Zero spacing makes copies touch.', form);
        const fields = {};
        for (const [key, title] of [['w', 'W'], ['l', 'L'], ['h', 'H']]) {
            const label = Element ('label', null, title, countRow);
            const input = Element ('input', null, undefined, label); input.type = 'number'; input.setAttribute ('aria-label', { w : 'Width count (W)', l : 'Length count (L)', h : 'Height count (H)' }[key]); input.min = '1'; input.max = '20'; input.step = '1'; input.value = '1'; input.required = true;
            fields[key] = input;
        }
        const gapFactor = UnitFactor (this.selected.unit, this.website.preferences.units);
        Element ('strong', null, 'Spacing between copies (' + (gapFactor === null ? 'model units' : DisplayUnitLabel (this.website.preferences.units)) + ')', form);
        const gapRow = Element ('div', 'array_counts', undefined, form); const gaps = {};
        for (const [key, title] of [['w', 'W'], ['l', 'L'], ['h', 'H']]) {
            const label = Element ('label', null, title, gapRow); const input = Element ('input', null, undefined, label);
            input.type = 'number'; input.min = '0'; input.max = '1000000'; input.step = 'any'; input.value = '0'; input.required = true;
            input.setAttribute ('aria-label', { w : 'Width spacing (W)', l : 'Length spacing (L)', h : 'Height spacing (H)' }[key]); gaps[key] = input;
        }
        const gap = () => {
            const values = ['w', 'h', 'l'].map (axis => gaps[axis].valueAsNumber);
            if (values.some (value => !Number.isFinite (value) || value < 0 || value > 1000000)) { throw new Error ('Use nonnegative spacing up to 1,000,000.'); }
            return new THREE.Vector3 (...values.map (value => value / (gapFactor ?? 1)));
        };
        const layerLabel = Element ('label', null, 'Rotate every other layer', form); const layerRotation = Element ('select', null, undefined, layerLabel); layerRotation.setAttribute ('aria-label', 'Alternate layer rotation'); [0, 45, 90, 180].forEach (angle => layerRotation.add (new Option (angle ? angle + '°' : 'None', String (angle))));
        const groupLabel = Element ('label', null, 'Automatically group array', form); const group = Element ('input', null, undefined, groupLabel); group.type = 'checkbox'; group.checked = true; group.setAttribute ('aria-label', 'Automatically group array');
        const animateLabel = Element ('label', null, 'Animate array reveal', form); const animate = Element ('input', null, undefined, animateLabel); animate.type = 'checkbox'; animate.checked = true; animate.setAttribute ('aria-label', 'Animate array reveal');
        const durationLabel = Element ('label', null, 'Reveal duration (seconds)', form); const duration = Element ('input', null, undefined, durationLabel); duration.type = 'number'; duration.min = 1; duration.max = 15; duration.step = .5; duration.value = 4; duration.setAttribute ('aria-label', 'Array reveal duration');
        const cameraLabel = Element ('label', null, 'Auto-fit array camera (camera keyframes take priority)', form); const autoFit = Element ('input', null, undefined, cameraLabel); autoFit.type = 'checkbox'; autoFit.checked = true; autoFit.setAttribute ('aria-label', 'Auto-fit array camera');
        const optimizeLabel = Element ('label', null, 'Retain triangles (%)', form); const retain = Element ('input', null, undefined, optimizeLabel); retain.type = 'number'; retain.min = '5'; retain.max = '100'; retain.value = '100'; retain.setAttribute ('aria-label', 'Array retained triangles percentage');
        Element ('p', 'section_hint', 'Optional polygon reduction: preview quality before creating.', form);
        const host = Element ('div', 'array_polygon_preview', undefined, form); let dispose = null; let previewKey = null; const source = this.selected; const originalSize = ArrayObjectBounds (source.threeObject).getSize (new THREE.Vector3 ());
        const preview = Element ('button', null, 'Preview optimized array', form); preview.type = 'button';
        const key = () => [fields.w.value, fields.l.value, fields.h.value, gaps.w.value, gaps.l.value, gaps.h.value, retain.value, layerRotation.value].join (':');
        const invalidate = () => { previewKey = null; this.polygonOptimizer.Cancel (); dispose?.(); dispose = null; };
        [...Object.values (fields), ...Object.values (gaps)].forEach ((input) => input.addEventListener ('input', invalidate)); retain.addEventListener ('input', invalidate); layerRotation.addEventListener ('change', invalidate);
        preview.onclick = async () => {
            const requestedKey = key ();
            if (this.selected !== source) { status.textContent = 'Selection changed. Close this dialog and reopen it.'; return; }
            const counts = ['w', 'l', 'h'].map ((axis) => Number (fields[axis].value)); const ratio = Number (retain.value) / 100;
            if (counts.some ((value) => !Number.isInteger (value) || value < 1 || value > 20) || counts.reduce ((a, b) => a * b, 1) + this.document.objects.length - 1 > 1000 || !Number.isFinite (ratio) || ratio < 0.05 || ratio > 1) { status.textContent = 'Use valid counts within the 1,000-object limit and 5–100% retained triangles.'; return; }
            preview.disabled = true; create.disabled = true; status.textContent = 'Preparing array decimation preview…'; dispose?.();
            try { const spacing = gap (); const result = await this.polygonOptimizer.PreviewArray (counts, ratio); dispose = await this.polygonOptimizer.ShowPreview (host, counts, Number (layerRotation.value), spacing, originalSize); if (this.selected !== source || requestedKey !== key ()) { dispose?.(); dispose = null; throw new Error ('Array settings changed. Preview again before creating.'); } previewKey = requestedKey; status.textContent = 'Array preview: ' + (result.before * counts.reduce ((a, b) => a * b, 1)).toLocaleString () + ' → ' + (result.after * counts.reduce ((a, b) => a * b, 1)).toLocaleString () + ' triangles. Inspect quality before creating.'; }
            catch (error) { status.textContent = error.message; } finally { preview.disabled = false; create.disabled = false; }
        };
        dialog.addEventListener ('close', () => { this.polygonOptimizer.Cancel (); dispose?.(); }, { once : true });
        const status = Element ('p', 'section_hint', 'The selected model is position 1,1,1.', form);
        const create = Element ('button', 'workspace_primary', 'Create array', form); create.type = 'submit';
        form.addEventListener ('submit', async (event) => {
            event.preventDefault ();
            const counts = ['w', 'l', 'h'].map ((key) => Number (fields[key].value));
            if (counts.some ((value) => !Number.isInteger (value) || value < 1 || value > 20)) { status.textContent = 'Each count must be an integer from 1 to 20.'; return; }
            const total = counts[0] * counts[1] * counts[2];
            if (this.document.objects.length + total - 1 > 1000) { status.textContent = 'This array would exceed the 1,000-object session limit.'; return; }
            const ratio = Number (retain.value) / 100;
            if (!Number.isFinite (ratio) || ratio < 0.05 || ratio > 1) { status.textContent = 'Retain 5–100% of triangles.'; return; }
            if (ratio < 1 && previewKey !== key ()) { status.textContent = 'Preview optimized array before creating it.'; return; }
            if (this.selected !== source) { status.textContent = 'Selection changed. Close this dialog and reopen it.'; return; }
            let spacing; try { spacing = gap (); } catch (error) { status.textContent = error.message; return; }
            create.disabled = true; status.textContent = 'Creating an array…';
            try { if (ratio < 1) { await this.polygonOptimizer.Apply (); } const seconds = duration.valueAsNumber; if (!Number.isFinite (seconds) || seconds < 1 || seconds > 15) { throw new Error ('Use a 1–15 second array reveal.'); } dialog.close (); await this.CreateArray (...counts, { autoGroup : group.checked, spacing : originalSize, gap : spacing, layerRotation : Number (layerRotation.value), animate : animate.checked, duration : seconds, autoFit : autoFit.checked }); } catch (error) { status.textContent = error.message; this.Status (error.message); create.disabled = false; }
        });
    }

    async CreateArray (widthCount, lengthCount, heightCount, options = {})
    {
        if (this.readOnly || this.busy) { throw new Error ('The session cannot be edited right now.'); }
        const source = this.selected;
        if (!source?.threeObject) { throw new Error ('Select a model first.'); }
        const counts = [widthCount, lengthCount, heightCount];
        if (counts.some ((value) => !Number.isInteger (value) || value < 1 || value > 20)) { throw new Error ('Array counts must be integers from 1 to 20.'); }
        const layerRotation = options.layerRotation ?? 0; if (![0, 45, 90, 180].includes (layerRotation)) { throw new Error ('Use 0, 45, 90 or 180 degree layer rotation.'); }
        for (const key of ['animate', 'autoFit']) { if (options[key] !== undefined && typeof options[key] !== 'boolean') { throw new Error ('Array animation options must be boolean.'); } }
        const duration = options.duration ?? 4; if (!Number.isFinite (duration) || duration < 1 || duration > 15) { throw new Error ('Use a 1–15 second array reveal.'); }
        const gap = options.gap || new THREE.Vector3 (); ArrayCellSize (new THREE.Vector3 (), layerRotation, gap);
        const total = widthCount * lengthCount * heightCount;
        if (this.document.objects.length + total - 1 > 1000) { throw new Error ('Array exceeds the 1,000-object session limit.'); }
        if (total === 1) { this.Status ('Array is 1 × 1 × 1; no copies created.'); return []; }

        const added = [];
        const firstIndex = this.document.objects.length;
        const sourceData = { ...(source.userData || {}) }; const groupId = options.autoGroup === false ? null : crypto.randomUUID ();
        if (!this.website.auth?.user || this.website.accountReady === false) { throw new Error ('Sign in to an editable workspace.'); }
        const target = this.document; const owner = this.website.auth.user.id; const cameraBefore = this.website.viewer?.GetCamera?.().Clone ();
        this.website.viewer?.navigation?.StopCameraMovement ();
        const operation = { stage : 'creating', duration, total, cameraAutoFit : options.autoFit !== false && !this.timeline?.cameraKeyframes?.length, placed : 1, cancelled : false };
        operation.check = () => { if (operation.cancelled) { throw new Error ('Array creation canceled.'); } if (this.document !== target || this.website.auth.user?.id !== owner || this.website.accountReady === false || this.readOnly) { throw new Error ('The workspace or account changed during array creation.'); } };
        this.arrayOperation = operation; if (this.selectionBox) { this.UpdateSelectionBox (); }
        this.busy = true; this.RefreshButtons ();
        this.Status ('Creating an array… 0 / ' + (total - 1) + ' copies');
        try {
            await new Promise ((resolve) => setTimeout (resolve, 20));
            const box = ArrayObjectBounds (source.threeObject);
            const size = options.spacing || box.getSize (new THREE.Vector3 ());
            for (let h = 0; h < heightCount; h++) {
                for (let l = 0; l < lengthCount; l++) {
                    for (let w = 0; w < widthCount; w++) {
                        if (w === 0 && l === 0 && h === 0) { continue; }
                        operation.check ();
                        const copy = this.document.Instance (source);
                        added.push (copy);
                        copy.name = source.name + ' [' + (w + 1) + ',' + (l + 1) + ',' + (h + 1) + ']';
                        Object.assign (copy, ArrayPlacement (source, box, size, w, l, h, layerRotation, gap));
                        this.document.ApplyTransform (copy);
                        this.Status ('Creating an array… ' + added.length + ' / ' + (total - 1) + ' copies');
                        await new Promise ((resolve) => setTimeout (resolve, 0));
                    }
                }
            }
            const groupData = () => { if (groupId) { [source, ...added].forEach ((object) => { object.userData = { ...(object.userData || {}), _auto3dGroup : groupId, _auto3dGroupName : 'Array group of ' + source.name, _auto3dGroupKind : 'array' }; }); } }; groupData ();
            this.selected = source;
            const animate = options.animate !== false;
            operation.stage = animate ? 'revealing' : 'creating';
            await this.Render (false, () => { if (animate) { added.forEach (object => { object.threeObject.visible = false; }); } });
            this.busy = true; this.RefreshButtons (); operation.check ();
            if (animate) { if (this.selectionBox) { this.selectionBox.visible = false; } await RevealArray (this, source, added, Math.max (size.y * 1.25, 0.001), operation); operation.check (); }
            this.history.Push ({
                undo : async () => { source.userData = { ...sourceData }; added.forEach ((object) => this.document.Remove (object)); this.selected = source; await this.Render (); },
                redo : async () => { groupData (); added.forEach ((object, index) => this.document.Restore (object, firstIndex + index)); this.selected = source; await this.Render (); }
            });
            this.Status ('Created ' + widthCount + ' × ' + lengthCount + ' × ' + heightCount + ' array · ' + total + ' objects');
            this.lastArray = { state : 'completed', progress : 1, placed : added.length + 1, total : added.length + 1 }; return added;
        } catch (error) {
            source.userData = { ...sourceData }; added.forEach ((object) => target.Remove (object));
            if (this.document === target) { this.selected = source; try { await this.Render (); if (cameraBefore) { this.website.viewer.SetCamera (cameraBefore); } } catch { /* Preserve the original failure. */ } }
            this.lastArray = { state : operation.cancelled ? 'cancelled' : 'failed', progress : 0, error : error.message };
            this.Status ('Could not create the array. ' + error.message);
            throw error;
        } finally { this.arrayOperation = null; this.busy = false; this.RefreshButtons (); if (this.selectionBox) { this.selectionBox.visible = false; } }
    }

    ArrayInspect () { const operation = this.arrayOperation; return operation ? { ...(operation.player?.Inspect () || { state : operation.stage, progress : 0 }), stage : operation.stage, placed : operation.placed, total : operation.total, duration : operation.duration, cameraAutoFit : operation.cameraAutoFit, framing : operation.framing || null } : this.lastArray || { state : 'idle', progress : 0 }; }
    ArrayControl (action)
    {
        if (!['pause', 'resume', 'cancel'].includes (action)) { throw new Error ('Choose pause, resume or cancel.'); }
        const operation = this.arrayOperation; if (!operation) { return this.ArrayInspect (); }
        operation.check ();
        if (action === 'cancel') { operation.cancelled = true; operation.player?.Stop (); }
        else if (action === 'pause') { operation.player?.Pause (); } else { operation.player?.Resume (); }
        return this.ArrayInspect ();
    }

    GroupObjects (objects = this.SelectedObjects (), name = 'Group')
    {
        if (this.readOnly || this.busy || objects.length < 2 || objects.some ((object) => !this.document.objects.includes (object))) { throw new Error ('Select at least two editable objects.'); }
        const id = crypto.randomUUID (); const records = objects.map ((object) => ({ object, before : { ...(object.userData || {}) } }));
        const apply = (grouped) => { records.forEach ((item) => { item.object.userData = grouped ? { ...item.before, _auto3dGroup : id, _auto3dGroupName : name.slice (0, 100), _auto3dGroupKind : 'group' } : { ...item.before }; }); this.Select (objects[0]); this.MarkDirty (); };
        apply (true); this.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); return { groupId : id, objectIds : objects.map ((object) => object.id) };
    }
    UngroupObjects ()
    {
        if (this.readOnly || this.busy) { throw new Error ('The session cannot be edited right now.'); }
        const records = this.SelectedObjects ().map ((object) => ({ object, before : { ...(object.userData || {}) } }));
        const apply = (restore) => { records.forEach ((item) => { item.object.userData = { ...item.before }; if (!restore) { delete item.object.userData._auto3dGroup; delete item.object.userData._auto3dGroupName; } }); this.Select (this.selected, false, true, true); this.MarkDirty (); };
        apply (false); this.history.Push ({ undo : () => apply (true), redo : () => apply (false) }); return { ungrouped : records.length };
    }
    async Duplicate ()
    {
        if (this.readOnly || this.busy) { return; }
        const originals = this.SelectedObjects ().length ? this.SelectedObjects () : [this.selected].filter (Boolean); if (!originals.length) { return; }
        const start = this.document.objects.length; const groupId = originals.length > 1 ? crypto.randomUUID () : null;
        const added = originals.map ((source) => { const copy = this.document.Duplicate (source); copy.position = [...source.position]; copy.position[0] += 1.1 * Math.max (...this.GetObjectBaseSize (source).map ((size, axis) => size * Math.abs (source.scale[axis])), 0.01); if (groupId) { copy.userData._auto3dGroup = groupId; } else { delete copy.userData._auto3dGroup; delete copy.userData._auto3dGroupName; } this.document.ApplyTransform (copy); return copy; });
        this.history.Push ({ undo : async () => { added.forEach ((object) => this.document.Remove (object)); this.selected = originals[0]; await this.Render (); }, redo : async () => { added.forEach ((object, index) => this.document.Restore (object, start + index)); this.selected = added[0]; await this.Render (); } }); this.selected = added[0]; await this.Render (); this.Status ('Duplicated ' + added.length + ' object(s)');
    }
    async DuplicateTransformed (records)
    {
        if (this.readOnly || !Array.isArray (records) || !records.length || records.some (item => !this.document.objects.includes (item.object))) { throw new Error ('Select editable objects to duplicate.'); }
        const document = this.document, previous = this.selected, previousIds = new Set (this.selectedIds), start = document.objects.length, meshCount = document.model.meshes.length, materialCount = document.model.materials.length, copies = [];
        try {
            if (start + records.length > 1000) { throw new Error ('The session supports up to 1,000 objects.'); }
            const groupId = records.length > 1 ? crypto.randomUUID () : null;
            for (const item of records) {
                const copy = document.Duplicate (item.object); copies.push (copy); Object.assign (copy, structuredClone (item.after));
                if (groupId) { copy.userData._auto3dGroup = groupId; } else { delete copy.userData._auto3dGroup; delete copy.userData._auto3dGroupName; }
                document.ApplyTransform (copy); Object.assign (item.object, structuredClone (item.before)); document.ApplyTransform (item.object);
            }
            this.selected = copies[0]; this.selectedIds = new Set (copies.map (item => item.id)); await this.Render ();
            const apply = async forward => { if (forward) { copies.forEach ((item, index) => document.Restore (item, start + index)); this.selected = copies[0]; this.selectedIds = new Set (copies.map (item => item.id)); } else { copies.forEach (item => document.Remove (item)); this.selected = previous; this.selectedIds = new Set (previousIds); } await this.Render (); };
            this.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); this.Status ('Duplicated ' + copies.length + ' object(s)'); return { objectIds : copies.map (item => item.id) };
        } catch (error) {
            copies.forEach (copy => document.Remove (copy)); document.model.meshes.length = meshCount; document.model.materials.length = materialCount;
            for (const item of records) { Object.assign (item.object, structuredClone (item.before)); document.ApplyTransform (item.object); } this.selected = previous; this.selectedIds = previousIds; try { await this.Render (); } catch { /* Preserve the original failure. */ } throw error;
        }
    }
    async Delete ()
    {
        if (this.readOnly || this.busy) { return; }
        const objects = this.SelectedObjects ().length ? this.SelectedObjects () : [this.selected].filter (Boolean); if (!objects.length) { return; }
        const records = objects.map ((object) => ({ object, index : this.document.objects.indexOf (object) })); objects.forEach ((object) => this.document.Remove (object));
        this.history.Push ({ undo : async () => { records.forEach ((item) => this.document.Restore (item.object, item.index)); this.selected = objects[0]; await this.Render (); }, redo : async () => { objects.forEach ((object) => this.document.Remove (object)); this.selected = null; await this.Render (); } }); this.selected = null; this.selectedIds.clear (); await this.Render (); this.Status ('Deleted ' + objects.length + ' object(s) · Undo is available');
    }
    ToggleVisibility ()
    {
        if (this.readOnly || this.busy || !this.selected) { return; }
        const objects = this.SelectedObjects ().length ? this.SelectedObjects () : [this.selected]; const records = objects.map ((object) => ({ object, before : object.visible })); const after = !this.selected.visible;
        const apply = (restore) => { records.forEach ((item) => { item.object.visible = restore ? item.before : after; item.object.threeObject.visible = item.object.visible; }); this.website.UpdateMeshesVisibility (); this.Select (this.selected, false, true); }; apply (false); this.history.Push ({ undo : () => apply (true), redo : () => apply (false) }); this.RefreshButtons ();
    }
    // Sets the orbit pivot to the selection's center. `aim` also points the view at it (camera.orbit.focus_selected);
    // right-drag passes false, so eye and view center orbit together around the object and the framing is kept.
    OrbitSelected (aim = true)
    {
        const navigation = this.website.viewer.navigation; navigation.StopCameraMovement (); const bounds = this.SelectedViewBounds ();
        const center = bounds?.getCenter (new THREE.Vector3 ()); navigation.orbitCenter = center ? new Coord3D (center.x, center.y, center.z) : null;
        if (center && aim) { navigation.camera.center = new Coord3D (center.x, center.y, center.z); }
        return { focused : Boolean (center), objectId : center ? this.selected?.id || null : null, pivot : center ? center.toArray () : null };
    }
    SelectedViewBounds ()
    {
        const objects = this.SelectedObjects (); const selection = objects.length ? objects : [this.selected].filter (Boolean);
        const bounds = new THREE.Box3 (); let found = false;
        for (const object of selection) {
            if (object.visible === false || !object.threeObject) { continue; }
            const item = VisibleSceneBounds (object.threeObject);
            if (item && !item.isEmpty ()) { bounds.union (item); found = true; }
        }
        return found ? bounds : null;
    }
    Focus ()
    {
        const bounds = this.SelectedViewBounds ();
        if (!bounds) { return { focused : false, objectIds : [] }; }
        const center = bounds.getCenter (new THREE.Vector3 ());
        this.website.viewer.navigation.orbitCenter = new Coord3D (center.x, center.y, center.z);
        this.website.viewer.FitSphereToWindow (bounds.getBoundingSphere (new THREE.Sphere ()), true);
        return { focused : true, objectIds : this.SelectedObjects ().filter (object => object.visible !== false && VisibleSceneBounds (object.threeObject)).map (object => object.id) };
    }
    async Undo () { await this.history.Undo (); this.RefreshUI (); }
    async Redo () { await this.history.Redo (); this.RefreshUI (); }

    CaptureView ()
    {
        return { presentationBackground : CapturePresentationBackground (this.website.settings, this.website.settings.themeId === Theme.Dark), camera : this.website.viewer.GetCamera (), cameraState : CaptureCameraState (this.website.viewer), timeline : this.timeline.Serialize (), cameraViews : this.cameras.Inspect (), backgroundPreset : this.website.settings.backgroundPreset, horizonGradient : this.website.settings.horizonGradient, showGroundGrid : this.website.settings.showGroundGrid, lighting : this.website.lightingPanel.Capture () };
    }
    async ArchiveAsync (objects, kind, name)
    {
        if (this.arrayOperation) { throw new Error ('Finish or cancel the array animation before saving the session.'); }
        if (this.packaging?.foldOperation) { throw new Error ('Finish or cancel folding before saving the session.'); }
        const writer = new RecoveryWriter ();
        try { return await writer.Create ({ ...this.document, objects }, this.CaptureView (), kind, name); }
        finally { writer.Cancel (); }
    }
    Archive (objects, kind, name)
    {
        if (this.arrayOperation) { throw new Error ('Finish or cancel the array animation before saving the session.'); }
        if (this.packaging?.foldOperation) { throw new Error ('Finish or cancel folding before saving the session.'); }
        const data = PackSession (this.document, this.CaptureView (), objects, kind); data.name = name; return CreateSessionArchive (data);
    }
    async OpenArchive (buffer, append, recovered = false)
    {
        if (this.website?.rendering?.running) { throw new Error ('Stop rendering before opening another session.'); }
        if (this.arrayOperation) { throw new Error ('Finish or cancel the array animation before opening a session.'); }
        if (this.packaging?.foldOperation) { throw new Error ('Finish or cancel folding before opening a session.'); }
        const saved = OpenSessionArchive (buffer); // Validate everything before replacing the current document.
        if (append) { return this.AppendArchive (saved); }
        this.website.rendering?.Lock (); this.document = saved.document; this.history = new SceneHistory (() => this.MarkDirty ()); this.timeline.Load (saved.view.timeline); this.cameras.Load (saved.view.cameraViews); this.selected = this.document.objects[0] || null; if (this.website.hashHandler.HasHash ()) { this.website.hashHandler.SkipNextEventHandler (); this.website.hashHandler.ClearHash (); }
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
        this.website.cameraPanel?.Render ();
        this.Status ((append ? 'Added from ' : 'Opened ') + saved.document.name);
        if (!append) {
            if (recovered) { this.dirty = true; }
            else { await this.MarkClean (); }
        }
    }
    async AppendArchive (saved, place = null)
    {
        if (this.readOnly) { throw new Error ('This session is read-only.'); }
        const target = this.document; const owner = this.website.auth?.user?.id; const previous = this.selected; const selection = new Set (this.selectedIds || []);
        if (!saved.document.objects.length) { throw new Error ('The saved Library item has no models to add.'); }
        if (target.objects.length + saved.document.objects.length > 1000) { throw new Error ('Adding this save would exceed 1,000 scene objects.'); }
        const added = []; const firstIndex = target.objects.length; const meshes = target.model.meshes.length; const materials = target.model.materials.length; const unit = target.model.GetUnit (); const groups = new Map (); const objectIds = new Map (); const previousActions = this.timeline?.actions || []; let importedActions = [];
        try {
            for (const source of saved.document.objects) {
                const model = saved.document.CompactModel ([source], true); model.root = model.root.GetChildNode (0);
                const object = target.AddImported (model, source.name, Direction.Y, false); added.push (object); objectIds.set (source.id, object.id);
                Object.assign (object, TransformState (source), { source : source.source, packagingProfile : source.packagingProfile, visible : source.visible, hiddenParts : [...source.hiddenParts], unit : source.unit, userData : { ...source.userData }, castShadow : source.castShadow !== false, receiveShadow : source.receiveShadow !== false, keyframes : source.keyframes.map (frame => ({ ...frame, id : crypto.randomUUID (), position : [...frame.position], rotation : [...frame.rotation], scale : [...frame.scale] })), animationAsset : source.animationAsset, playback : source.playback ? { ...source.playback, playing : false } : undefined });
                const group = object.userData._auto3dGroup; if (group) { if (!groups.has (group)) { groups.set (group, crypto.randomUUID ()); } object.userData._auto3dGroup = groups.get (group); }
                target.ApplyTransform (object);
            }
            importedActions = (saved.view?.timeline?.actions || []).filter (action => objectIds.has (action.objectId)).map (action => ({ ...action, id : crypto.randomUUID (), objectId : objectIds.get (action.objectId) }));
            if (this.timeline) { this.timeline.actions = [...previousActions, ...importedActions]; this.timeline.ExtendDurationForKeys (); }
            this.selected = added[0]; this.selectedIds = new Set ([added[0].id]); await this.Render (true);
            if (this.document !== target || this.website.auth?.user?.id !== owner || this.website.accountReady === false || this.readOnly) { throw new Error ('Account or workspace changed while adding the saved model.'); }
            if (place) { place (this, added); }
            this.history.Push ({ undo : async () => { added.forEach (object => target.Remove (object)); if (this.timeline) { this.timeline.actions = previousActions; } this.selected = previous; this.selectedIds = new Set (selection); await this.Render (); }, redo : async () => { added.forEach ((object, index) => target.Restore (object, firstIndex + index)); if (this.timeline) { this.timeline.actions = [...previousActions, ...importedActions]; } this.selected = added[0]; this.selectedIds = new Set ([added[0].id]); await this.Render (); } });
            this.Status ('Added ' + added.length + ' model(s) from ' + saved.document.name + ' · selected ' + added[0].name);
            return { objectIds : added.map (object => object.id), objectCount : added.length };
        } catch (error) {
            added.forEach (object => target.Remove (object)); if (this.timeline) { this.timeline.actions = previousActions; } target.model.meshes.length = meshes; target.model.materials.length = materials; target.model.SetUnit (unit);
            if (this.document === target) { this.selected = previous; this.selectedIds = selection; try { await this.Render (); } catch { /* Keep the original import error. */ } } throw error;
        }
    }
    GroupsInspect () { return SceneGroups (this.document.objects).map (group => ({ id : group.id, name : group.name, array : group.array, count : group.objects.length, expanded : this.groupExpanded?.get (group.id) === true })); }
    SetGroupExpanded (id, expanded)
    {
        if (typeof expanded !== 'boolean' || !SceneGroups (this.document.objects).some (group => group.id === id)) { throw new Error ('Choose a scene group and expanded state.'); }
        this.groupExpanded ||= new Map (); this.groupExpanded.set (id, expanded);
        this.objectList?.querySelectorAll ('details[data-scene-group]').forEach (element => { if (element.dataset.sceneGroup === id) { element.open = expanded; } });
        this.website.navigator?.meshesPanel?.groupItems?.get (id)?.ShowChildren (expanded); return { id, expanded };
    }
    Thumbnail (objects)
    {
        if (!objects.length && this.document.packaging?.paths?.length) { return this.packaging.Thumbnail (); }
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
        if (this.arrayOperation) { this.Status ('Finish or cancel the array animation before exporting.'); return; }
        if (this.packaging?.foldOperation) { this.Status ('Finish or cancel folding before exporting.'); return; }
        const dialog = WorkspaceDialog ('Export session'); const form = Element ('div', 'workspace_save_form', undefined, dialog);
        Element ('p', 'section_hint', 'GLB/glTF includes embedded animation. Hidden objects are excluded.', form);
        for (const binary of [true, false]) {
            const button = Element ('button', 'workspace_primary', binary ? 'Download GLB' : 'Download glTF', form);
            button.addEventListener ('click', async () => {
                button.disabled = true;
                try {
                    if (this.arrayOperation) { throw new Error ('Finish or cancel the array animation before exporting.'); }
                    if (this.packaging?.foldOperation) { throw new Error ('Finish or cancel folding before exporting.'); }
                    this.website.viewModes?.Restore (); this.website.viewer.SetMeshesHighlight (this.website.highlightColor, () => false);
                    const root = this.website.viewer.mainModel.mainModel.GetRootObject (); const animations = this.players.filter ((player) => player.object.visible).flatMap ((player) => player.ExportClips ());
                    const metadata = []; root.traverse ((item) => { metadata.push ([item, item.userData]); item.userData = {}; });
                    const colors = new Map (); root.traverse ((item) => { if (item.material) { for (const material of Array.isArray (item.material) ? item.material : [item.material]) { if (!colors.has (material) && material.color) { colors.set (material, [material.color.clone (), material.emissive?.clone ()]); material.color.convertSRGBToLinear (); material.emissive?.convertSRGBToLinear (); } } } });
                    let result;
                    const exporter = new GLTFExporter (); exporter.register ((writer) => ({ name : 'SW_Auto3D_surface', writeMaterialAsync : async (material, definition) => {
                        const surface = { bumpScale : material.bumpScale, displacementScale : material.displacementScale, displacementBias : material.displacementBias };
                        for (const [key, map] of [['bumpTexture', material.bumpMap || material.auto3dBumpMap], ['displacementTexture', material.displacementMap]]) {
                            if (map) { const texture = { index : await writer.processTextureAsync (map) }; writer.applyTextureTransform (texture, map); surface[key] = texture; }
                        }
                        definition.extras = { ...definition.extras, swAuto3D : surface };
                    } }));
                    try { result = await exporter.parseAsync (root, { binary, animations, trs : true, onlyVisible : true }); }
                    finally { metadata.forEach (([item, data]) => { item.userData = data; }); colors.forEach (([color, emissive], material) => { material.color.copy (color); if (emissive) { material.emissive.copy (emissive); } }); this.website.UpdateMeshesSelection (); this.website.viewModes?.Refresh (); this.website.viewer.Render (); }
                    this.Download (binary ? result : JSON.stringify (result), this.document.name + (binary ? '.glb' : '.gltf'), binary ? 'model/gltf-binary' : 'model/gltf+json'); dialog.close (); this.Status ('Export downloaded.');
                } catch (error) { this.Status ('Export failed: ' + error.message); button.disabled = false; }
            });
        }
        const other = Element ('button', null, 'Other mesh formats', form); other.addEventListener ('click', () => { dialog.close (); ShowExportDialog (this.document.model, this.website.viewer, { isMeshVisible : (id) => this.website.navigator.IsMeshVisible (id) && this.IsVisible (this.document.model.GetMeshInstance (id)) }); });
    }
    KeyDown (event)
    {
        if (this.website.modulePanels?.overlay?.open) { return; }
        if ((this.website?.auth && !this.website.auth.user) || this.readOnly || typeof event.key !== 'string') { return; }
        const modified = event.ctrlKey || event.metaKey; const key = event.key.toLowerCase ();
        const target = event.target;
        const textEditing = target.closest?.('textarea, [contenteditable="true"]') || (target.matches?.('input') && ['text', 'search', 'email', 'url', 'password', 'number'].includes (target.type));
        if (this.busy || (textEditing && !(modified && key === 'z' && !target.matches?.(':focus')))) { return; }
        if (target.closest?.('dialog') && !(modified && key === 'z')) { return; }
        if (!modified && !event.altKey && ['x', 'y', 'z'].includes (key) && this.mode === 'rotate') { this.SetRotationAxisOverride (key.toUpperCase ()); return; }
        let action = null;
        if (modified && key === 's') { action = () => this.library.SaveDialog (true); } else if (modified && key === 'd') { action = () => this.Duplicate (); } else if (modified && key === 'c' && this.SelectedObjects ().length) { action = () => this.sessions.Copy (); } else if (modified && key === 'v' && this.sessions?.clipboard) { action = () => this.sessions.Paste (); } else if (modified && key === 'z') { action = () => event.shiftKey ? this.Redo () : this.Undo (); }
        else if (!modified && !event.altKey) { action = ({ v : () => this.SetMode ('select'), w : () => this.SetMode ('translate'), e : () => this.SetMode ('rotate'), r : () => this.SetMode ('scale'), f : () => this.Focus (), h : () => this.ToggleVisibility (), delete : () => this.Delete () })[key]; }
        if (action) { event.preventDefault (); this.Run (action); }
    }
}

