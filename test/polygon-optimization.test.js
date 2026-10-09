import * as THREE from 'three';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { Navigation } from '../source/engine/viewer/navigation.js';
import assert from 'node:assert/strict';
import { SimplifyPackedMesh } from '../source/website/polygoncore.js';
import { PackOptimizationMesh, RebuildOptimizationMesh } from '../source/website/polygonoptimizer.js';
import { Mesh } from '../source/engine/model/mesh.js';
import { Triangle } from '../source/engine/model/triangle.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { Coord2D } from '../source/engine/geometry/coord2d.js';
import { Line } from '../source/engine/model/line.js';
import { Unit } from '../source/engine/model/unit.js';
import { DisplayQuantity } from '../source/website/preferences.js';
import { PackSession, ReadSession } from '../source/website/sessionarchive.js';
import { SceneDocument } from '../source/website/scenedocument.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import { Model } from '../source/engine/model/model.js';

export function GridMesh (n = 20)
{
    const mesh = new Mesh (); mesh.AddNormal (new Coord3D (0, 1, 0));
    for (let z = 0; z <= n; z++) { for (let x = 0; x <= n; x++) { mesh.AddVertex (new Coord3D (x, 0, z)); mesh.AddTextureUV (new Coord2D (x / n, z / n)); } }
    for (let z = 0; z < n; z++) { for (let x = 0; x < n; x++) { const a = z * (n + 1) + x; const b = a + 1; const c = a + n + 1; const d = c + 1; for (const vertices of [[a, c, b], [b, c, d]]) { const triangle = new Triangle (...vertices).SetNormals (0, 0, 0).SetTextureUVs (...vertices).SetMaterial (x < n / 2 ? 0 : 1).SetCurve (0); mesh.AddTriangle (triangle); } } }
    return mesh;
}
describe ('Quality-preserving polygon optimization and units', () => {
    it ('reduces a real mesh while retaining material boundaries, UVs, normals and lines', async () => {
        const source = GridMesh (); source.AddLine (new Line ([0, 20]).SetMaterial (0)); const packed = await PackOptimizationMesh (source);
        const result = await SimplifyPackedMesh (packed, 0.5, 0.001); const reduced = await RebuildOptimizationMesh (source, result);
        assert.ok (reduced.TriangleCount () < source.TriangleCount ()); assert.ok (result.error <= 0.001); assert.equal (source.TriangleCount (), 800);
        assert.deepEqual ([...new Set (reduced.triangles.map ((t) => t.mat))].sort (), [0, 1]); assert.equal (reduced.lines.length, 1);
        reduced.triangles.forEach ((t) => { for (let k = 0; k < 3; k++) { const v = reduced.GetVertex (t['v' + k]); const uv = reduced.GetTextureUV (t['u' + k]); assert.equal (uv.x, v.x / 20); assert.equal (uv.y, v.z / 20); assert.deepEqual (reduced.GetNormal (t['n' + k]), new Coord3D (0, 1, 0)); assert.ok (t.mat === 0 ? v.x <= 10 : v.x >= 10); } });
        assert.ok (reduced.VertexCount () < source.VertexCount ());
    });
    it ('rejects invalid targets and converts area/volume with squared/cubed unit factors', async () => {
        const mesh = await PackOptimizationMesh (GridMesh (2)); await assert.rejects (SimplifyPackedMesh (mesh, 0, 0.001));
        assert.equal (DisplayQuantity (25.4 ** 2, Unit.Millimeter, 'standard', 2), '1 inches²'); assert.equal (DisplayQuantity (25.4 ** 3, Unit.Millimeter, 'standard', 3), '1 inches³');
        assert.equal (DisplayQuantity (3, Unit.Unknown, 'standard', 2), '3 model units²');
    });
    it ('forwards Ctrl-left-click modifiers from mouse release to selection', () => {
        const nav = Object.create (Navigation.prototype); nav.enabled = true; nav.canvas = {}; nav.mouse = { IsButtonDown : () => true, Up : () => {}, GetPosition : () => ({ x : 1, y : 2 }) }; nav.clickDetector = { End : () => {}, IsClick : () => true, Cancel : () => {} }; let picked;
        nav.onMouseClick = (button, point, modifiers) => { picked = { button, point, modifiers }; }; nav.OnMouseUp ({ which : 1, ctrlKey : true, metaKey : false }); assert.deepEqual (picked.modifiers, { ctrlKey : true, metaKey : false }); assert.equal (picked.button, 1);
    });
    it ('moves selected objects together and restores every placement through one undo', async () => {
        const editor = Object.create (SessionEditor.prototype); editor.document = new SceneDocument (); const model = new Model (); model.AddMaterial (new PhysicalMaterial ()); model.AddMaterial (new PhysicalMaterial ()); model.AddMeshToRootNode (GridMesh (2)); const first = editor.document.AddImported (model, 'First'); const second = editor.document.Instance (first); second.position = [20, 0, 0];
        [first, second].forEach ((object) => { object.threeObject = new THREE.Group (); }); editor.selected = first; editor.selectedIds = new Set ([first.id, second.id]); editor.website = { viewer : { UpdateGroundGrid : () => {}, Render : () => {} } }; editor.UpdateSelectionBox = editor.SyncInputs = editor.UpdateDetails = () => {}; let undo; editor.history = { Push : (entry) => { undo = entry.undo; } };
        editor.TransformSelection ({ position : [10, 0, 0] }); assert.deepEqual (first.position, [10, 0, 0]); assert.deepEqual (second.position, [30, 0, 0]); await undo (); assert.deepEqual (first.position, [0, 0, 0]); assert.deepEqual (second.position, [20, 0, 0]);
    });
    it ('instances share source mesh data and survive portable compaction', () => {
        const model = new Model (); model.AddMaterial (new PhysicalMaterial ()); model.AddMaterial (new PhysicalMaterial ()); model.AddMeshToRootNode (GridMesh (2)); const document = new SceneDocument (); const source = document.AddImported (model, 'Grid'); const instance = document.Instance (source);
        assert.equal (document.model.meshes.length, 1); assert.deepEqual (instance.node.GetChildNode (0).meshIndices, source.node.GetChildNode (0).meshIndices); assert.equal (document.CompactModel ().TriangleCount (), 16); source.userData._auto3dGroup = instance.userData._auto3dGroup = 'group-id'; const reopened = ReadSession (PackSession (document)).document; assert.equal (reopened.objects[0].userData._auto3dGroup, reopened.objects[1].userData._auto3dGroup);
    });
});
