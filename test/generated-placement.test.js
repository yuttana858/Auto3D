import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlaceGeneratedObject } from '../source/website/generatedplacement.js';
import { SceneDocument } from '../source/website/scenedocument.js';
import { Model } from '../source/engine/model/model.js';
import { Node } from '../source/engine/model/node.js';
import { GenerateCuboid } from '../source/engine/model/generator.js';
import { GetBoundingBox } from '../source/engine/model/modelutils.js';
import { Unit } from '../source/engine/model/unit.js';
import { Matrix } from '../source/engine/geometry/matrix.js';
import { Transformation } from '../source/engine/geometry/transformation.js';

function Box (unit = Unit.Millimeter, width = 20)
{
    const model = new Model (); model.SetUnit (unit); model.AddMeshToRootNode (GenerateCuboid (null, width, 30, 10)); return model;
}
function Bounds (document, object) { return GetBoundingBox (document.CompactModel ([object])); }
function Near (actual, expected) { assert.ok (Math.abs (actual - expected) < 1e-8, actual + ' != ' + expected); }

describe ('Generated model placement', function () {
    it ('keeps the first model at its anchor and moves only X for subsequent models', function () {
        const document = new SceneDocument (), first = document.AddImported (Box (), 'First');
        assert.deepEqual (PlaceGeneratedObject (document, first), [0, 0, 0]);
        const next = document.AddImported (Box (), 'Next');
        Object.assign (next, { position : [5, 8, 19], rotation : [10, 25, 30], scale : [2, .5, 3] }); document.ApplyTransform (next);
        const before = Bounds (document, next), right = Bounds (document, first).max.x;
        const expectedX = next.position[0] + right + Math.max (10, (before.max.x - before.min.x) * .1) - before.min.x;
        PlaceGeneratedObject (document, next);
        Near (next.position[0], expectedX); assert.deepEqual (next.position.slice (1), [8, 19]); assert.deepEqual (next.rotation, [10, 25, 30]); assert.deepEqual (next.scale, [2, .5, 3]);
        Near (Bounds (document, next).min.x - right, Math.max (10, (before.max.x - before.min.x) * .1));
    });

    it ('uses the same physical clearance in every supported unit and grows it for wide models', function () {
        for (const [unit, factor] of [[Unit.Millimeter, 1], [Unit.Centimeter, 10], [Unit.Meter, 1000], [Unit.Inch, 25.4], [Unit.Foot, 304.8]]) {
            for (const widthMm of [20, 300]) {
                const document = new SceneDocument (), first = document.AddImported (Box (unit, 40 / factor), 'First'), next = document.AddImported (Box (unit, widthMm / factor), 'Next');
                PlaceGeneratedObject (document, next);
                Near ((Bounds (document, next).min.x - Bounds (document, first).max.x) * factor, Math.max (10, widthMm * .1));
            }
        }
    });

    it ('respects hidden imported obstacles with nested transforms, rotation and nonuniform scaling', function () {
        const document = new SceneDocument (), model = new Model (); model.SetUnit (Unit.Millimeter);
        const mesh = model.AddMesh (GenerateCuboid (null, 25, 40, 30)), node = new Node (); model.root.AddChildNode (node); node.AddMeshIndex (mesh);
        model.root.SetTransformation (new Transformation (new Matrix ().CreateTranslation (11, -3, 5)));
        node.SetTransformation (new Transformation (new Matrix (new THREE.Matrix4 ().makeRotationY (Math.PI / 3).setPosition (12, 4, 8).toArray ())));
        const obstacle = document.AddImported (model, 'Hidden import');
        Object.assign (obstacle, { visible : false, position : [100, 7, 20], rotation : [25, 37, 0], scale : [-2, 3, .5] }); document.ApplyTransform (obstacle);
        const before = [...obstacle.position], right = Bounds (document, obstacle).max.x, next = document.AddImported (Box (), 'Next');
        PlaceGeneratedObject (document, next);
        Near (Bounds (document, next).min.x, right + 10); assert.deepEqual (obstacle.position, before); assert.equal (obstacle.visible, false);
    });

    it ('ignores detached geometry retained for Undo and reserves it again after restoration', function () {
        const document = new SceneDocument (), first = document.AddImported (Box (), 'First'), removed = document.AddImported (Box (), 'Removed');
        removed.position[0] = 50000; document.ApplyTransform (removed); document.Remove (removed);
        const next = document.AddImported (Box (), 'Next'); PlaceGeneratedObject (document, next);
        Near (Bounds (document, next).min.x, Bounds (document, first).max.x + 10);
        assert.equal (document.model.MeshCount (), 3);
        document.Restore (removed); const afterRestore = document.AddImported (Box (), 'After restore'); PlaceGeneratedObject (document, afterRestore);
        Near (Bounds (document, afterRestore).min.x, Bounds (document, removed).max.x + 10);
    });

    it ('includes the current rendered pose of animated obstacles', function () {
        const document = new SceneDocument (), animated = document.AddImported (Box (), 'Animated');
        animated.animationAsset = {}; animated.threeObject = new THREE.Group ();
        const posed = new THREE.Mesh (new THREE.BoxGeometry (2, 2, 2)); posed.position.x = 500; animated.threeObject.add (posed);
        const next = document.AddImported (Box (), 'Next'); PlaceGeneratedObject (document, next);
        Near (Bounds (document, next).min.x, 511);
        posed.geometry.dispose (); posed.material.dispose ();
    });

    it ('ignores empty obstacles and rejects nonfinite geometry before moving the new model', function () {
        const document = new SceneDocument (), empty = new Model (); empty.SetUnit (Unit.Millimeter); document.AddImported (empty, 'Empty');
        const next = document.AddImported (Box (), 'Next'); assert.deepEqual (PlaceGeneratedObject (document, next), [0, 0, 0]);
        const malformed = document.AddImported (Box (), 'Invalid'); malformed.position[0] = NaN;
        assert.throws (() => PlaceGeneratedObject (document, next), /invalid geometry/); assert.deepEqual (next.position, [0, 0, 0]);
    });
});
