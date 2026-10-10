import * as THREE from 'three';
import { ValidateFefco, FlapDepth, FefcoProfile } from './fefco.js';
import { ValidatePackaging } from './profile.js';
import { BoardMaterials } from './material.js';
import { MeshData } from './mesh.js';

const ease = value => { const t = Math.max (0, Math.min (1, value)); return t * t * (3 - 2 * t); };
const phase = (value, start, end) => ease ((value - start) / (end - start));
const translate = (x, y, z) => new THREE.Matrix4 ().makeTranslation (x, y, z);
const hinge = (matrix, pivot, rotation) => matrix.clone ().multiply (translate (...pivot)).multiply (rotation).multiply (translate (...pivot.map (v => -v)));

export function CreateFefcoFoldRig (input, savedProfile = null)
{
    const parameters = ValidateFefco (input); const expected = FefcoProfile (parameters); const profile = savedProfile ? ValidatePackaging (savedProfile) : expected;
    if (profile.thickness !== expected.thickness || JSON.stringify (profile.paths) !== JSON.stringify (expected.paths)) { throw new Error ('Folding requires the original generated dieline. Regenerate a box after editing its cut or score paths.'); }
    const { length : l, width : w, height : h, thickness : t } = parameters; const depth = FlapDepth (parameters); const joint = Math.min (35, w / 5); const slot = Math.max (2, t);
    const spans = [l, w, l, w]; const edges = [0]; spans.forEach (span => edges.push (edges.at (-1) + span)); const panels = []; const meshes = [];
    const add = (name, points, kind, index) => {
        const geometry = new THREE.ExtrudeGeometry (new THREE.Shape (points.map (p => new THREE.Vector2 (...p))), { depth : t, bevelEnabled : false, steps : 1, curveSegments : 1, UVGenerator : {
            generateTopUV : (g, vertices, a, b, c) => [a, b, c].map (i => new THREE.Vector2 (vertices[i * 3] / 50, vertices[i * 3 + 1] / 50)),
            generateSideWallUV : (g, vertices, a, b, c, d) => { const length = Math.hypot (vertices[a * 3] - vertices[b * 3], vertices[a * 3 + 1] - vertices[b * 3 + 1]); return [a, b, c, d].map ((i, at) => new THREE.Vector2 ((at === 1 || at === 2 ? length : 0) / (t * 2), vertices[i * 3 + 2] / t)); }
        } });
        geometry.rotateX (-Math.PI / 2); meshes.push (MeshData (geometry, name, group => group === 1 ? 1 : 0)); geometry.dispose (); panels.push ({ name, kind, index });
    };
    const rectangle = (a, b, y0, y1) => [[a, y0], [b, y0], [b, y1], [a, y1]];
    for (let i = 0; i < 4; i++) {
        add ('Fold wall ' + i, rectangle (edges[i], edges[i + 1], 0, h), 'wall', i);
        const a = edges[i] + (i ? slot / 2 : 0); const b = edges[i + 1] - (i < 3 ? slot / 2 : 0);
        add ('Fold base ' + i, rectangle (a, b, -depth, 0), 'base', i);
        if (parameters.code !== '0200') { add ('Fold top ' + i, rectangle (a, b, h, h + depth), 'top', i); }
    }
    add ('Fold glue joint', [[-joint, 2 * t], [0, 0], [0, h], [-joint, h - 2 * t]], 'joint', 0);
    return { apiVersion : 1, units : 'mm', parameters, profile, materials : BoardMaterials (), meshes, panels, edges };
}

export function FefcoFoldPose (rig, progress)
{
    if (!Number.isFinite (progress) || progress < 0 || progress > 1) { throw new Error ('Fold progress must be between 0 and 1.'); }
    const { length : l, width : w, height : h, thickness : t, code } = rig.parameters; const depth = FlapDepth (rig.parameters);
    const innerLayers = depth * 2 > l ? 2 : 1; const layers = innerLayers + (code === '0202' || code === '0203' ? 2 : 1);
    const raise = phase (progress, 0.02, 0.22);
    const root = translate ((-w / 2 - t / 2) * raise, layers * t * raise, l / 2 * raise).multiply (new THREE.Matrix4 ().makeRotationY (Math.PI / 2 * raise)).multiply (new THREE.Matrix4 ().makeRotationX (Math.PI / 2 * raise));
    const walls = [root];
    for (let i = 1; i < 4; i++) { const turn = phase (progress, 0.18 + (i - 1) * 0.06, 0.36 + (i - 1) * 0.06); walls.push (hinge (walls[i - 1], [rig.edges[i], 0, 0], new THREE.Matrix4 ().makeRotationZ (Math.PI / 2 * turn))); }
    const matrices = rig.panels.map (panel => {
        if (panel.kind === 'wall') { return walls[panel.index].toArray (); }
        if (panel.kind === 'joint') { return hinge (root, [0, 0, 0], new THREE.Matrix4 ().makeRotationZ (-Math.PI / 2 * phase (progress, 0.42, 0.52))).toArray (); }
        const minor = panel.index % 2 === 1; const layer = minor ? (panel.index === 1 ? 0 : innerLayers - 1) : (panel.index === 0 ? innerLayers : layers - 1);
        if (panel.kind === 'base') {
            const fold = phase (progress, minor ? 0.48 : 0.57, minor ? 0.59 : 0.68);
            return walls[panel.index].clone ().multiply (translate (0, 0, (layer + 1) * t * fold)).multiply (new THREE.Matrix4 ().makeRotationX (-Math.PI / 2 * fold)).toArray ();
        }
        // Hold an open box before folding the minor top flaps, then the major flaps.
        const open = phase (progress, 0.48, 0.62); const close = phase (progress, minor ? 0.76 : 0.86, minor ? 0.87 : 1);
        const angle = -20 * Math.PI / 180 * open * (1 - close) + Math.PI / 2 * close;
        const matrix = walls[panel.index].clone ().multiply (translate (0, 0, -(layer + 1) * t * close));
        return hinge (matrix, [0, 0, -h], new THREE.Matrix4 ().makeRotationX (angle)).toArray ();
    });
    const stage = progress === 0 ? 'flat' : progress < 0.48 ? 'erecting walls' : progress < 0.68 ? 'closing base' : progress < 0.76 ? 'open box' : progress < 1 ? (code === '0200' ? 'open HSC' : 'closing top') : (code === '0200' ? 'open HSC' : 'closed box');
    return { progress, stage, matrices };
}

export function FefcoFoldFrame (rig, progress)
{
    const pose = FefcoFoldPose (rig, progress);
    const meshes = rig.meshes.map ((mesh, index) => {
        const matrix = new THREE.Matrix4 ().fromArray (pose.matrices[index]); const normals = new THREE.Matrix3 ().getNormalMatrix (matrix);
        return { ...mesh, vertices : mesh.vertices.map (point => new THREE.Vector3 (...point).applyMatrix4 (matrix).toArray ()), normals : mesh.normals.map (normal => new THREE.Vector3 (...normal).applyMatrix3 (normals).normalize ().toArray ()) };
    });
    return { ...rig, meshes, state : progress === 0 ? 'flat' : 'folded', parameters : { ...rig.parameters, closure : progress === 1 && rig.parameters.code !== '0200' ? 'closed' : 'open' }, foldProgress : progress, stage : pose.stage };
}
