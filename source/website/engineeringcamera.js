import * as THREE from 'three';

const point = new THREE.Vector3 (), box = new THREE.Box3 ();
function visibleMaterial (material) { return (Array.isArray (material) ? material : [material]).some (item => item && item.visible !== false && item.opacity > 0.005); }

// Only geometry rendered now contributes. Ground, shadows and future hidden parts are excluded.
export function CollectEngineeringFitPoints (root)
{
    const result = []; root.updateMatrixWorld (true);
    function visit (object, covered = false) {
        if (!object.visible) { return; }
        const renderable = (object.isMesh || object.isLineSegments) && visibleMaterial (object.material);
        let containsMesh = covered;
        if (renderable && !(covered && object.isLineSegments)) {
            const geometry = object.geometry, positions = geometry.getAttribute ('position');
            const index = geometry.index, available = index ? index.count : positions.count;
            const start = Math.max (0, geometry.drawRange.start), end = Math.min (available, start + geometry.drawRange.count);
            if (end > start) {
                const morphing = object.isMesh && geometry.morphAttributes.position?.length;
                if (morphing || start > 0 || end < available) {
                    box.makeEmpty ();
                    const allVertices = morphing && start === 0 && end === available;
                    for (let i = allVertices ? 0 : start; i < (allVertices ? positions.count : end); i++) {
                        const vertex = allVertices ? i : index ? index.getX (i) : i;
                        if (morphing) { object.getVertexPosition (vertex, point); } else { point.fromBufferAttribute (positions, vertex); }
                        box.expandByPoint (point);
                    }
                } else {
                    if (!geometry.boundingBox) { geometry.computeBoundingBox (); } box.copy (geometry.boundingBox);
                }
                for (const x of [box.min.x, box.max.x]) {
                    for (const y of [box.min.y, box.max.y]) {
                        for (const z of [box.min.z, box.max.z]) { point.set (x, y, z).applyMatrix4 (object.matrixWorld); result.push (point.x, point.y, point.z); }
                    }
                }
                containsMesh = covered || object.isMesh;
            }
        }
        for (const child of object.children) { visit (child, containsMesh); }
    }
    visit (root); return result;
}

export function FitEngineeringCamera (camera, points, target, fill = 0.88)
{
    camera.updateProjectionMatrix ();
    const direction = new THREE.Vector3 (8.8, 6.7, 11).normalize ();
    const right = new THREE.Vector3 ().crossVectors (new THREE.Vector3 (0, 1, 0), direction).normalize ();
    const up = new THREE.Vector3 ().crossVectors (direction, right).normalize ();
    const tanY = Math.tan (THREE.MathUtils.degToRad (camera.fov) / 2) / camera.zoom, tanX = tanY * camera.aspect;
    let distance = 3;
    for (let i = 0; i < points.length; i += 3) {
        point.set (points[i], points[i + 1], points[i + 2]).sub (target);
        const depth = point.dot (direction);
        distance = Math.max (distance, depth + Math.abs (point.dot (right)) / (tanX * fill), depth + Math.abs (point.dot (up)) / (tanY * fill), depth + camera.near * 2);
    }
    camera.position.copy (target).addScaledVector (direction, distance); camera.lookAt (target); camera.updateMatrixWorld (true);
    let extentX = 0, extentY = 0;
    for (let i = 0; i < points.length; i += 3) {
        point.set (points[i], points[i + 1], points[i + 2]).project (camera);
        extentX = Math.max (extentX, Math.abs (point.x)); extentY = Math.max (extentY, Math.abs (point.y));
    }
    return { distance, target : target.toArray (), extent : [extentX, extentY], visiblePoints : points.length / 3, fill };
}
