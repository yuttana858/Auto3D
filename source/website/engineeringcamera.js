import * as THREE from 'three';

const point = new THREE.Vector3 (), vertices = new WeakMap ();
const direction = new THREE.Vector3 (8.8, 6.7, 11).normalize ();
const right = new THREE.Vector3 ().crossVectors (new THREE.Vector3 (0, 1, 0), direction).normalize ();
const up = new THREE.Vector3 ().crossVectors (direction, right).normalize ();
function visibleMaterial (material) { return (Array.isArray (material) ? material : [material]).some (item => item && item.visible !== false && item.opacity > 0.005); }

function uniqueVertices (geometry)
{
    const positions = geometry.getAttribute ('position'), index = geometry.index;
    let saved = vertices.get (geometry);
    if (!saved || saved.position !== positions.version || saved.index !== index?.version) {
        const seen = new Set (), ids = [], count = index ? index.count : positions.count;
        for (let i = 0; i < count; i++) {
            const id = index ? index.getX (i) : i;
            const key = [positions.getX (id), positions.getY (id), positions.getZ (id)].join (',');
            if (!seen.has (key)) { seen.add (key); ids.push (id); }
        }
        saved = { position : positions.version, index : index?.version, ids }; vertices.set (geometry, saved);
    }
    return saved.ids;
}

// Only geometry rendered now contributes. Ground, shadows and future hidden parts are excluded.
export function CollectEngineeringFitPoints (root, result = [])
{
    result.length = 0; root.updateMatrixWorld (true);
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
                const complete = start === 0 && end === available;
                // Actual surface vertices avoid fitting empty corners around curved or L-shaped parts.
                // Morph vertices may share a base position but move apart, so retain each of them.
                const ids = complete && !morphing ? uniqueVertices (geometry) : null;
                const count = ids ? ids.length : complete && morphing ? positions.count : end - start;
                for (let i = 0; i < count; i++) {
                    const vertex = ids ? ids[i] : complete && morphing ? i : index ? index.getX (start + i) : start + i;
                    if (morphing) { object.getVertexPosition (vertex, point); } else { point.fromBufferAttribute (positions, vertex); }
                    point.applyMatrix4 (object.matrixWorld); result.push (point.x, point.y, point.z);
                }
                containsMesh = covered || object.isMesh;
            }
        }
        for (const child of object.children) { visit (child, containsMesh); }
    }
    visit (root); return result;
}

function tangents (camera)
{
    const y = Math.tan (THREE.MathUtils.degToRad (camera.fov) / 2) / camera.zoom;
    return { x : y * camera.aspect, y };
}

function distanceFor (camera, points, target, fill)
{
    const tan = tangents (camera);
    let distance = 3;
    for (let i = 0; i < points.length; i += 3) {
        point.set (points[i], points[i + 1], points[i + 2]).sub (target);
        const depth = point.dot (direction);
        distance = Math.max (distance, depth + Math.abs (point.dot (right)) / (tan.x * fill), depth + Math.abs (point.dot (up)) / (tan.y * fill), depth + camera.near * 2);
    }
    return distance;
}

function boundsFor (camera, points, target, distance)
{
    const tan = tangents (camera); let left = Infinity, bottom = Infinity, rightEdge = -Infinity, top = -Infinity;
    for (let i = 0; i < points.length; i += 3) {
        point.set (points[i], points[i + 1], points[i + 2]).sub (target);
        const depth = Math.max (camera.near, distance - point.dot (direction)), x = point.dot (right) / (depth * tan.x), y = point.dot (up) / (depth * tan.y);
        left = Math.min (left, x); rightEdge = Math.max (rightEdge, x); bottom = Math.min (bottom, y); top = Math.max (top, y);
    }
    return { center : [(left + rightEdge) / 2, (bottom + top) / 2], extent : [Math.max (Math.abs (left), Math.abs (rightEdge)), Math.max (Math.abs (bottom), Math.abs (top))] };
}

function apply (camera, points, target, distance, fill)
{
    camera.position.copy (target).addScaledVector (direction, distance); camera.lookAt (target); camera.updateProjectionMatrix (); camera.updateMatrixWorld (true);
    const bounds = boundsFor (camera, points, target, distance);
    return { distance, target : target.toArray (), extent : bounds.extent, screenCenter : bounds.center, visiblePoints : points.length / 3, fill };
}

export function FitEngineeringCamera (camera, points, target, fill = 0.94)
{
    return apply (camera, points, target, distanceFor (camera, points, target, fill), fill);
}

// Exact critically damped spring integration: continuous position/velocity at any frame rate.
function spring (value, velocity, goal, delta, frequency)
{
    const change = value - goal, slope = velocity + frequency * change, decay = Math.exp (-frequency * delta);
    return [goal + (change + slope * delta) * decay, (velocity - frequency * slope * delta) * decay];
}

export function CreateEngineeringCamera (camera, fill = 0.94)
{
    let distance = null, speed = 0; const target = new THREE.Vector3 ();
    return {
        reset () { distance = null; speed = 0; },
        update (points, anchor, delta = 0) {
            const goal = anchor.clone (), tan = tangents (camera);
            let desiredDistance = distanceFor (camera, points, goal, fill);
            // Center the visible silhouette, rather than the origin of the mechanical model.
            for (let i = 0; i < 5; i++) {
                const bounds = boundsFor (camera, points, goal, desiredDistance);
                goal.addScaledVector (right, bounds.center[0] * desiredDistance * tan.x).addScaledVector (up, bounds.center[1] * desiredDistance * tan.y);
                desiredDistance = distanceFor (camera, points, goal, fill);
            }
            const first = distance === null;
            if (first) { distance = desiredDistance; }
            else if (delta > 0) {
                const previous = distance;
                [distance, speed] = spring (distance, speed, desiredDistance, delta, 12);
                // Expanding material already follows an eased reveal. Follow its outline outward
                // without letting smoothing crop a flap, then ease inward as the structure closes.
                if (distance < desiredDistance) { distance = desiredDistance; speed = Math.max (0, (distance - previous) / delta); }
            }
            if (first || delta > 0) {
                target.copy (goal);
                // Center at the displayed distance as well, so zoom easing cannot pull the pack
                // below the middle of the window while its flat blank grows or folds.
                for (let i = 0; i < 5; i++) {
                    const bounds = boundsFor (camera, points, target, distance);
                    target.addScaledVector (right, bounds.center[0] * distance * tan.x).addScaledVector (up, bounds.center[1] * distance * tan.y);
                }
            }
            return { ...apply (camera, points, target, distance, fill), desiredDistance };
        }
    };
}
