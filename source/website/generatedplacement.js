import * as THREE from 'three';
import { Unit } from '../engine/model/unit.js';

const Millimeters = { [Unit.Millimeter] : 1, [Unit.Centimeter] : 10, [Unit.Meter] : 1000, [Unit.Inch] : 25.4, [Unit.Foot] : 304.8 };

function ObjectBounds (document, object)
{
    document.ApplyTransform (object);
    const bounds = new THREE.Box3 ();
    // Walk only attached object nodes: the document retains removed meshes for Undo.
    // New objects do not have rendered geometry yet, and imported nodes can carry their own transforms.
    object.node.Enumerate (node => {
        const transformation = node.GetWorldTransformation ();
        for (const index of node.GetMeshIndices ()) {
            document.model.GetMesh (index).EnumerateVertices (vertex => {
                const point = transformation.TransformCoord3D (vertex);
                if (![point.x, point.y, point.z].every (Number.isFinite)) { throw new Error ('Cannot place a generated model beside invalid geometry.'); }
                bounds.expandByPoint (point);
            });
        }
    });
    // Include the displayed pose of an animated obstacle when available; future animation poses are not reserved.
    if (object.threeObject && (object.animationAsset || object.keyframes?.length)) {
        object.threeObject.updateWorldMatrix (true, true);
        const displayed = new THREE.Box3 ().setFromObject (object.threeObject, true);
        if (!displayed.isEmpty ()) {
            if (![...displayed.min.toArray (), ...displayed.max.toArray ()].every (Number.isFinite)) { throw new Error ('Cannot place a generated model beside invalid geometry.'); }
            bounds.union (displayed);
        }
    }
    return bounds;
}

// Opt in only for new, independent models. Rebuilds and fitted assemblies keep their existing anchors.
export function PlaceGeneratedObject (document, object)
{
    const others = document.objects.filter (current => current !== object);
    if (!others.length) { return [...object.position]; }
    const factor = Millimeters[document.model.GetUnit ()];
    if (!factor) { throw new Error ('Set known scene units before placing a generated model.'); }
    const bounds = ObjectBounds (document, object);
    if (bounds.isEmpty ()) { throw new Error ('Cannot place a generated model without geometry.'); }
    let right = -Infinity;
    for (const other of others) {
        const occupied = ObjectBounds (document, other);
        if (!occupied.isEmpty ()) { right = Math.max (right, occupied.max.x); }
    }
    if (right === -Infinity) { return [...object.position]; }
    const gap = Math.max (10 / factor, (bounds.max.x - bounds.min.x) * .1);
    object.position[0] += Math.max (0, right + gap - bounds.min.x);
    document.ApplyTransform (object);
    return [...object.position];
}
