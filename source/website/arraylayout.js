import * as THREE from 'three';

export function ArrayCellSize (size, angle = 0)
{
    if (![0, 45, 90, 180].includes (angle)) { throw new Error ('Layer rotation must be 0, 45, 90 or 180 degrees.'); }
    const radians = THREE.MathUtils.degToRad (angle); const c = Math.abs (Math.cos (radians)); const s = Math.abs (Math.sin (radians));
    return new THREE.Vector3 (Math.max (size.x, c * size.x + s * size.z), size.y, Math.max (size.z, s * size.x + c * size.z));
}

export function ArrayPlacement (source, bounds, size, w, l, h, angle = 0)
{
    const cell = ArrayCellSize (size, angle); const rotate = h % 2 ? angle : 0;
    const q = new THREE.Quaternion ().setFromAxisAngle (new THREE.Vector3 (0, 1, 0), THREE.MathUtils.degToRad (rotate));
    const offset = bounds.getCenter (new THREE.Vector3 ()).sub (new THREE.Vector3 (...source.position));
    const position = new THREE.Vector3 (...source.position).add (new THREE.Vector3 (w * cell.x, h * cell.y, l * cell.z)).add (offset).sub (offset.clone ().applyQuaternion (q));
    const original = new THREE.Quaternion ().setFromEuler (new THREE.Euler (...(source.rotation || [0, 0, 0]).map (THREE.MathUtils.degToRad)));
    const rotation = new THREE.Euler ().setFromQuaternion (q.multiply (original));
    return { position : position.toArray (), rotation : rotate === 0 ? [...(source.rotation || [0, 0, 0])] : [rotation.x, rotation.y, rotation.z].map (THREE.MathUtils.radToDeg) };
}
