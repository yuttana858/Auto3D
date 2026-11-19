import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ViewerMainModel, IntersectionMode } from '../source/engine/viewer/viewermodel.js';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { SceneDocument } from '../source/website/scenedocument.js';
import { Model } from '../source/engine/model/model.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import { GenerateCuboid, GeneratorParams } from '../source/engine/model/generator.js';
import { FinalizeModel } from '../source/engine/model/modelfinalization.js';

describe ('Timeline visibility and selection', () => {
    it ('picks the visible model behind a timeline-hidden parent instead of its invisible child mesh', () => {
        const scene = new THREE.Scene (), root = new THREE.Group (), hidden = new THREE.Group ();
        const front = new THREE.Mesh (new THREE.BoxGeometry (1, 1, 1), new THREE.MeshBasicMaterial ()), back = new THREE.Mesh (new THREE.BoxGeometry (1, 1, 1), new THREE.MeshBasicMaterial ());
        hidden.add (front); hidden.position.z = 2; root.add (hidden, back); const model = new ViewerMainModel (scene); model.mainModel.SetRootObject (root);
        const camera = new THREE.PerspectiveCamera (45, 1, .1, 100); camera.position.z = 5; camera.lookAt (0, 0, 0); camera.updateMatrixWorld (true); scene.updateMatrixWorld (true);
        const pick = () => model.GetMeshIntersectionUnderMouse (IntersectionMode.MeshOnly, { x : 50, y : 50 }, camera, 100, 100)?.object;
        assert.equal (pick (), front); hidden.visible = false; assert.equal (front.visible, true); assert.equal (pick (), back);
        front.geometry.dispose (); back.geometry.dispose (); front.material.dispose (); back.material.dispose ();
    });
    it ('detaches and restores transform controls at visibility boundaries without changing the saved visibility', () => {
        const object = { id : 'box', visible : true, threeObject : new THREE.Group (), visibilityKeys : [{ id : 'hide', time : 1, visible : false }, { id : 'show', time : 2, visible : true }] };
        let attached = object.threeObject;
        const editor = { selected : object, document : { objects : [object] }, mode : 'translate', readOnly : false, SelectedObjects : () => [object], controls : { detach : () => { attached = null; }, setMode : () => {}, attach : value => { attached = value; } }, UpdateTransformControls : SessionEditor.prototype.UpdateTransformControls };
        const timeline = new SessionTimeline (editor); timeline.time = 1; timeline.ApplyVisibility (); assert.equal (attached, null); assert.equal (object.visible, true);
        timeline.time = 2; timeline.ApplyVisibility (); assert.equal (attached, object.threeObject); assert.equal (object.visible, true);
    });
    it ('preserves transient array and packing visibility across actual scene rebuilds', async () => {
        const model = new Model (); model.AddMaterial (new PhysicalMaterial ()); model.AddMeshToRootNode (GenerateCuboid (new GeneratorParams ().SetMaterial (0), 1, 1, 1)); FinalizeModel (model, {});
        const document = new SceneDocument (), object = document.AddImported (model, 'Product'), roots = [];
        const editor = { document, players : [], controls : { detach : () => {} }, packaging : { presentation : { Clear : () => {}, PrepareAll : async () => {}, Apply : () => {} } }, DisposeModelPreview : () => {}, RefreshUI : () => {}, Select : () => {}, RefreshButtons : () => {}, website : { navigator : { Clear : () => {} }, SetUIState : () => {}, OnModelLoaded : (result, root) => roots.push (root), sidebar : { detailsPanel : {} }, UpdateMeshesVisibility : () => {}, viewer : { Render : () => {}, RequestRender : () => {} } } };
        editor.timeline = new SessionTimeline (editor);
        try {
            await SessionEditor.prototype.Render.call (editor, false, () => { object.threeObject.visible = false; }); assert.equal (object.visible, true); assert.equal (object.threeObject.visible, false);
            editor.motionOverride = () => { object.threeObject.visible = false; object.threeObject.position.y = 8; };
            await SessionEditor.prototype.Render.call (editor); assert.equal (object.threeObject.visible, false); assert.equal (object.threeObject.position.y, 8); assert.equal (object.position[1], 0);
            editor.motionOverride = null; await SessionEditor.prototype.Render.call (editor); assert.equal (object.threeObject.visible, true);
        } finally { for (const root of roots) { root.traverse (mesh => { mesh.geometry?.dispose (); const materials = Array.isArray (mesh.material) ? mesh.material : [mesh.material]; materials.forEach (material => material?.dispose ()); }); } }
    });
});
