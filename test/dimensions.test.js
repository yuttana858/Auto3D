import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Model } from '../source/engine/model/model.js';
import { Mesh } from '../source/engine/model/mesh.js';
import { Triangle } from '../source/engine/model/triangle.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import { Unit } from '../source/engine/model/unit.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { PackSession, ReadSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { PackRecoverySnapshot } from '../source/website/sessionrecoverypack.js';
import { FeatureEdges, ResolveDimension, ValidateDimensions, ProjectDimension, DimensionPlanes, BracketPoints, ProjectPlacedDimension } from '../source/website/dimensioncore.js';
import { FefcoProfile } from '../modules/packaging/src/fefco.js';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { DimensionTool } from '../source/website/dimensiontool.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
function Fixture ()
{
    const model = new Model (); model.SetUnit (Unit.Millimeter); model.AddMaterial (new PhysicalMaterial ()); const mesh = new Mesh (); mesh.SetName ('Solid');
    for (const p of [[0,0,0],[100,0,0],[100,50,0],[0,50,0],[0,0,25],[100,0,25],[100,50,25],[0,50,25]]) { mesh.AddVertex (new Coord3D (...p)); }
    mesh.AddNormal (new Coord3D (0,0,1));
    for (const t of [[0,3,2],[0,2,1],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[3,7,6],[3,6,2],[0,4,7],[0,7,3],[1,2,6],[1,6,5]]) { mesh.AddTriangle (new Triangle (...t).SetMaterial (0).SetNormals (0,0,0).SetCurve (0)); }
    model.AddMeshToRootNode (mesh); const document = new SceneDocument (), object = document.AddImported (model, 'CAD solid');
    const editor = { document, history : new SceneHistory (), readOnly : false, busy : false, buttons : new Map (), RefreshButtons () {}, Status () {}, SetMode () {}, controls : { detach () {} } };
    const camera = new THREE.PerspectiveCamera (45, 800 / 600, 0.1, 10000); camera.position.set (200,200,200); camera.lookAt (50,25,12.5); camera.updateMatrixWorld (); camera.updateProjectionMatrix ();
    const website = { sessionEditor : editor, auth : { user : { id : 'owner' } }, accountReady : true, viewer : { camera, navigation : { clickDetector : { Cancel () {} } } }, measureTool : { SetActive () {} }, preferences : { units : 'metric' } };
    const tool = Object.assign (Object.create (DimensionTool.prototype), { website, active : false, drag : null, topology : new WeakMap (), edges : new WeakMap (), Draw () {}, canvas : { style : {}, getBoundingClientRect : () => ({ left : 0, top : 0, width : 800, height : 600 }) }, host : { setPointerCapture () {}, hasPointerCapture () { return false; } } }); website.dimensions = tool;
    return { tool, editor, document, object, website, camera, mesh : document.model.meshes[0] };
}
describe ('Source-linked 3D dimensions', function () {
    it ('offers twelve solid edges rather than eighteen triangulation edges', function () {
        const { mesh, tool, object } = Fixture (); const edges = FeatureEdges (mesh); assert.equal (edges.length, 12);
        assert.ok (!edges.some (e => [e.a,e.b].sort ((a,b)=>a-b).join () === '0,2'));
        assert.equal (tool.Candidates (object).length, 12);
    });
    it ('creates through strict commands, follows scale and supports offset/delete/layer Undo', async function () {
        const { tool, object, document, editor, website } = Fixture (), commands = CreateAgentCommands (website);
        const found = await commands.Execute ('dimensions.edges', { objectId : object.id }); assert.equal (found.ok, true); const anchor = found.result.anchors.find (a => ResolveDimension (document,a).length === 100);
        const result = await commands.Execute ('dimensions.add', { anchor, offset : 50 }); assert.equal (result.ok, true, JSON.stringify (result)); assert.equal (document.dimensions.length, 1); assert.equal (editor.history.undo.length, 1);
        assert.equal (result.result.dimensions[0].lengthMm, 100); object.scale = [2,1,1]; document.ApplyTransform (object); assert.equal (tool.Inspect ().dimensions[0].lengthMm, 200); assert.equal (tool.Inspect ().dimensions[0].sourceLengthMm, 100);
        const id = document.dimensions[0].id; tool.Offset (id, 90); assert.equal (document.dimensions[0].offset, 90); await editor.history.Undo (); assert.equal (document.dimensions[0].offset, 50);
        tool.LayerVisible (false); assert.equal (document.dimensionsVisible, false); await editor.history.Undo (); assert.equal (document.dimensionsVisible, true);
        tool.Remove (id); assert.equal (document.dimensions.length, 0); await editor.history.Undo (); assert.equal (document.dimensions.length, 1);
        assert.equal ((await commands.Execute ('dimensions.add', { anchor : { ...anchor, a : 0, b : 2 } })).ok, false); assert.equal ((await commands.Execute ('dimensions.offset', { id, offset : Infinity })).ok, false);
    });
    it ('links full canonical CAD segments and updates from actual CAD edits, not visual dashes', function () {
        const { tool, document, object } = Fixture (); object.packagingProfile = { version : 1, name : 'Drawing', grade : 'Custom', thickness : 3, paths : [{ id : 'outline', type : 'cut', closed : true, points : [[0,0],[100,0],[100,50],[0,50]] }] };
        const anchor = tool.Candidates (object)[0]; assert.equal (anchor.kind, 'cad'); assert.equal (ResolveDimension (document,anchor).sourceLengthMm, 100);
        tool.Add (anchor); object.packagingProfile.paths[0].points[1][0] = 150; assert.equal (tool.Inspect ().dimensions[0].lengthMm, 150);
        object.scale = [2,1,1]; document.ApplyTransform (object); assert.equal (tool.Inspect ().dimensions[0].lengthMm, 300); assert.equal (tool.Inspect ().dimensions[0].sourceLengthMm, 150);
        object.userData._auto3dFefco = '{}'; assert.equal (tool.Inspect ().dimensions[0].stale, true);
    });
    it ('persists references and layer visibility across file/recovery and filters model-only archives', function () {
        const { tool, document, object } = Fixture (); tool.Add (tool.Candidates (object)[0]); tool.LayerVisible (false);
        const saved = OpenSessionArchive (CreateSessionArchive (PackSession (document))).document;
        assert.deepEqual (saved.dimensions, document.dimensions); assert.equal (saved.dimensionsVisible, false); assert.equal (ResolveDimension (saved,saved.dimensions[0]).lengthMm, ResolveDimension (document,document.dimensions[0]).lengthMm);
        const recovery = ReadSession (PackRecoverySnapshot (structuredClone (RecoverySnapshot (document, {})))).document; assert.deepEqual (recovery.dimensions, document.dimensions);
        const second = document.Duplicate (object); assert.equal (PackSession (document, {}, [second], 'model').dimensions.length, 0);
        const invalid = PackSession (document); invalid.dimensions[0].offset = NaN; assert.throws (() => ReadSession (invalid));
    });
    it ('marks incompatible topology stale and restores the reference when the object returns', function () {
        const { tool, document, object, mesh } = Fixture (); tool.Add (tool.Candidates (object)[0]); const d = document.dimensions[0];
        document.Remove (object); assert.equal (ResolveDimension (document,d).stale, true); document.Restore (object, 0); assert.equal (ResolveDimension (document,d).stale, undefined);
        mesh.triangles.pop (); assert.equal (ResolveDimension (document,d).stale, true); assert.equal (tool.Inspect ().dimensions[0].stale, true);
    });
    it ('previews a pointer drag without mutation and cancels on account or session changes', function () {
        const f = Fixture (), anchor = f.tool.Candidates (f.object)[0], r = ResolveDimension (f.document,anchor), p = ProjectDimension (r.a,r.b,f.camera,800,600,0), mid = p.start.clone ().add (p.end).multiplyScalar (0.5);
        const event = offset => ({ button : 0, pointerId : 1, clientX : mid.x + p.normal.x * offset, clientY : mid.y + p.normal.y * offset, target : {}, preventDefault () {}, stopImmediatePropagation () {} });
        f.tool.active = true; f.tool.Pick = () => anchor; f.tool.Down (event (0)); f.tool.Move (event (60)); assert.equal (f.document.dimensions.length, 0); f.tool.Up (event (60)); assert.equal (f.document.dimensions.length, 1); assert.equal (f.editor.history.undo.length, 1);
        f.tool.Down (event (0)); f.website.auth.user = { id : 'other' }; f.tool.Up (event (80)); assert.equal (f.document.dimensions.length, 1);
        f.website.auth.user = { id : 'owner' }; f.tool.Down (event (0)); f.editor.document = new SceneDocument (); f.tool.Up (event (80)); assert.equal (f.editor.document.dimensions.length, 0);
    });
    it ('supports macro result references and stops read-only annotation edits', async function () {
        const { tool, editor, website, object } = Fixture (), commands = CreateAgentCommands (website), anchor = tool.Candidates (object)[0];
        const macro = { version : 1, steps : [
            { id : 'added', command : 'dimensions.add', arguments : { anchor } },
            { id : 'moved', command : 'dimensions.offset', arguments : { id : { $ref : 'added.dimensions.0.id' }, offset : 80 } },
            { id : 'read', command : 'dimensions.inspect', arguments : {} }
        ] };
        const result = await commands.RunMacro (macro); assert.equal (result.ok, true, JSON.stringify (result)); assert.equal (result.completed[2].result.dimensions[0].offset, 80);
        editor.readOnly = true; const denied = await commands.RunMacro (macro); assert.equal (denied.ok, false); assert.equal (denied.completed.length, 0); assert.equal (editor.document.dimensions.length, 1);
    });
    it ('restores the viewer cursor and touch policy when closing the tool', function () {
        const { tool, editor } = Fixture (); tool.canvas.style.cursor = 'grab'; tool.canvas.style.touchAction = 'pan-x';
        tool.SetActive (true); assert.equal (tool.canvas.style.cursor, 'crosshair'); assert.equal (tool.canvas.style.touchAction, 'none');
        tool.SetActive (false); assert.equal (tool.canvas.style.cursor, 'grab'); assert.equal (tool.canvas.style.touchAction, 'pan-x'); assert.equal (editor.history.undo.length, 0);
    });
    it ('snaps to adjoining face planes and retains exact world placement across camera orbits', async function () {
        const { tool, document, object, camera, editor } = Fixture (), anchor = tool.Candidates (object).find (a => ResolveDimension (document,a).length === 100);
        const r = ResolveDimension (document,anchor), planes = DimensionPlanes (document,anchor,r); assert.equal (planes.length,2); assert.ok (Math.abs (planes[0].dot (planes[1])) < 1e-8);
        tool.Add (anchor); const id = document.dimensions[0].id; tool.Placement (id,90,25);
        const record = document.dimensions[0], before = BracketPoints (r,record.placement), screen = ProjectPlacedDimension (r,record.placement,camera,800,600);
        camera.position.set (-200,150,200); camera.lookAt (50,25,12.5); camera.updateMatrixWorld ();
        const after = BracketPoints (r,record.placement), changed = ProjectPlacedDimension (r,record.placement,camera,800,600);
        assert.deepEqual (after.a.toArray (),before.a.toArray ()); assert.notDeepEqual (screen.left.toArray (),changed.left.toArray ()); assert.ok (Math.abs (before.a.distanceTo (r.a)-25)<1e-8);
        object.position = [10,20,30]; document.ApplyTransform (object); const moved = BracketPoints (ResolveDimension (document,record),record.placement); assert.ok (moved.a.clone ().sub (before.a).distanceTo (new THREE.Vector3 (10,20,30))<1e-8);
        await editor.history.Undo (); assert.notEqual (document.dimensions[0].placement.plane,90);
        assert.throws (() => ValidateDimensions ([{ ...record, placement : { ...record.placement,distance : Infinity } }]));
    });
    it ('edits real box OD and CAD ID with one Undo, retaining anchors through rebuild and unfold', async function () {
        this.timeout (15000); const { tool, document, editor, website } = Fixture (); editor.website = website; editor.Render = async () => {}; editor.packaging = new PackagingWorkspace (editor);
        await editor.packaging.GenerateFefco ({ code : '0201',length : 400,width : 300,height : 250,thickness : 3,closure : 'closed' }); const source = editor.selected;
        const anchor = tool.Candidates (source).find (a => { const r = ResolveDimension (document,a); return Math.abs (r.a.y-r.b.y)<1e-8 && Math.abs (r.a.x-r.b.x)<1e-8 && r.lengthMm>100; });
        assert.ok (anchor); tool.Add (anchor); const id = document.dimensions[0].id; assert.equal (tool.Inspect ().dimensions[0].basis,'OD'); assert.equal (tool.Inspect ().dimensions[0].lengthMm,406);
        const unrelatedDesign = FefcoProfile ({ length : 550 }); document.packaging = unrelatedDesign; editor.selected = document.objects[0]; const steps = editor.history.undo.length; await tool.Value (id,450); assert.equal (editor.history.undo.length,steps+1); assert.equal (tool.Inspect ().dimensions[0].lengthMm,450); assert.equal (tool.Inspect ().dimensions[0].stale,false);
        await editor.history.Undo (); assert.equal (tool.Inspect ().dimensions[0].lengthMm,406); assert.equal (document.packaging,unrelatedDesign); await editor.history.Redo ();
        const oldId = document.dimensions[0].objectId; await editor.packaging.UnfoldSelected (oldId); assert.notEqual (document.dimensions[0].objectId,oldId); assert.equal (tool.Inspect ().dimensions[0].basis,'ID');
        await tool.Value (id,420); assert.equal (tool.Inspect ().dimensions[0].lengthMm,420); await editor.history.Undo (); await editor.history.Undo (); assert.equal (tool.Inspect ().dimensions[0].basis,'OD'); assert.equal (document.dimensions[0].objectId,oldId);
        const commands = CreateAgentCommands (website); const edited = await commands.RunMacro ({ version : 1,steps : [{ id : 'edit',command : 'dimensions.value',arguments : { id,valueMm : 470 } },{ id : 'read',command : 'dimensions.inspect',arguments : {} }] }); assert.equal (edited.ok,true,JSON.stringify (edited)); assert.equal (edited.completed[1].result.dimensions[0].lengthMm,470);
        assert.equal ((await commands.Execute ('dimensions.placement',{ id,plane : 45,distanceMm : 20 })).ok,false); editor.readOnly = true; await assert.rejects (() => tool.Value (id,480));
    });
    it ('rejects read-only mutations and invalid saved records before changing data', function () {
        const { tool, editor, object, document } = Fixture (); const anchor = tool.Candidates (object)[0]; editor.readOnly = true; assert.throws (() => tool.Add (anchor)); assert.throws (() => tool.LayerVisible (false)); assert.equal (document.dimensions.length, 0);
        assert.throws (() => ValidateDimensions ([{ id : 'bad' }])); assert.throws (() => ValidateDimensions (new Array (501).fill ({})));
    });
});
