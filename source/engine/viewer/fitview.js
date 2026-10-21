import * as THREE from 'three';

export function VisibleSceneBounds (root)
{
    if (!root) { return null; }
    root.updateWorldMatrix (true, true);
    const bounds = new THREE.Box3 ();
    root.traverse (mesh => {
        if ((!mesh.isMesh && !mesh.isLine) || !mesh.geometry) { return; }
        for (let parent = mesh; parent; parent = parent.parent) { if (!parent.visible) { return; } }
        const materials = Array.isArray (mesh.material) ? mesh.material : [mesh.material];
        if (materials.length && materials.every (material => material?.visible === false)) { return; }
        mesh.geometry.computeBoundingBox ();
        if (mesh.geometry.boundingBox && !mesh.geometry.boundingBox.isEmpty ()) { bounds.union (mesh.geometry.boundingBox.clone ().applyMatrix4 (mesh.matrixWorld)); }
    });
    return bounds.isEmpty () || ![...bounds.min.toArray (), ...bounds.max.toArray ()].every (Number.isFinite) ? null : bounds;
}

// Tighten the old spherical fit by 1.2x, but never cross the enclosing-box fit.
export function FitVisibleCamera (camera, bounds, aspect, perspective = true)
{
    if (!bounds || !Number.isFinite (aspect) || aspect <= 0) { return null; }
    const center = bounds.getCenter (new THREE.Vector3 ());
    const back = new THREE.Vector3 (camera.eye.x - camera.center.x, camera.eye.y - camera.center.y, camera.eye.z - camera.center.z);
    if (back.lengthSq () < 1e-18) { back.set (1, 1, 1); } back.normalize ();
    const up = new THREE.Vector3 (camera.up.x, camera.up.y, camera.up.z).normalize ();
    const right = new THREE.Vector3 ().crossVectors (up, back);
    if (right.lengthSq () < 1e-18) { right.crossVectors (Math.abs (back.y) < 0.9 ? new THREE.Vector3 (0, 1, 0) : new THREE.Vector3 (1, 0, 0), back); } right.normalize ();
    const vertical = new THREE.Vector3 ().crossVectors (back, right).normalize ();
    const tanY = Math.tan (THREE.MathUtils.degToRad (camera.fov / 2)); const tanX = tanY * aspect;
    let required = 1e-6;
    for (const x of [bounds.min.x, bounds.max.x]) { for (const y of [bounds.min.y, bounds.max.y]) { for (const z of [bounds.min.z, bounds.max.z]) {
        const offset = new THREE.Vector3 (x, y, z).sub (center); const depth = offset.dot (back);
        required = Math.max (required, (perspective ? depth : 0) + Math.abs (offset.dot (right)) / tanX, (perspective ? depth : 0) + Math.abs (offset.dot (vertical)) / tanY, depth + 1e-6);
    } } }
    const radius = bounds.getSize (new THREE.Vector3 ()).length () / 2;
    const oldDistance = radius / Math.sin (Math.atan (Math.min (tanX, tanY)));
    const distance = Math.max (oldDistance / 1.2, required * 1.03);
    const result = camera.Clone (); const eye = center.clone ().addScaledVector (back, distance);
    Object.assign (result.eye, eye); Object.assign (result.center, center); Object.assign (result.up, vertical);
    return result;
}
