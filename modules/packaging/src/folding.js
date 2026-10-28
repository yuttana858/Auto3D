import { TrimScoreDisplay } from './scorebands.js';
import { BoardAppearanceMesh, TransformAppearanceMesh } from './boardappearance.js';
import * as THREE from 'three';
import { ValidateFefco, FlapDepth, FefcoProfile } from './fefco.js';
import { ValidatePackaging } from './profile.js';
import { BoardMaterials } from './material.js';
import { ReferenceSingleWallStack } from './boardlayers.js';
import { CreaseVisualMeshes } from './creasevisuals.js';
import { MeshData } from './mesh.js';
import { PanelSolid, SolidIntersections } from './solid.js';
import { VisualBoardSpecification, ExposedEdgeUV } from './flutemapping.js';
import { ValidateBoardAppearance } from './appearancesettings.js';

const ease = value => { const t = Math.max (0, Math.min (1, value)); return t * t * (3 - 2 * t); };
const phase = (value, start, end) => ease ((value - start) / (end - start));
const translate = (x, y, z) => new THREE.Matrix4 ().makeTranslation (x, y, z);
const hinge = (matrix, pivot, rotation) => matrix.clone ().multiply (translate (...pivot)).multiply (rotation).multiply (translate (...pivot.map (v => -v)));

export function CreateFefcoFoldRig (input, savedProfile = null)
{
    const parameters = ValidateFefco (input); const expected = FefcoProfile (parameters); const profile = savedProfile ? ValidatePackaging (savedProfile) : expected;
    if (profile.thickness !== expected.thickness || JSON.stringify (profile.paths.map (path => { const copy = { ...path }; delete copy.process; return copy; })) !== JSON.stringify (expected.paths)) { throw new Error ('Folding requires the original generated dieline. Regenerate a box after editing its cut or score paths.'); }
    const { length : l, width : w, height : h, thickness : t } = parameters; const depth = FlapDepth (parameters); const joint = Math.min (35, w / 5); const slot = Math.max (2, t);
    const boardVisual = VisualBoardSpecification (profile);
    const spans = [l, w, l, w]; const edges = [0]; spans.forEach (span => edges.push (edges.at (-1) + span)); const panels = []; const meshes = [];
    const add = (name, points, kind, index) => {
        const geometry = new THREE.ExtrudeGeometry (new THREE.Shape (points.map (p => new THREE.Vector2 (...p))), { depth : t, bevelEnabled : false, steps : 1, curveSegments : 1, UVGenerator : {
            generateTopUV : (g, vertices, a, b, c) => [a, b, c].map (i => new THREE.Vector2 (vertices[i * 3] / 50, vertices[i * 3 + 1] / 50)),
            generateSideWallUV : (g, vertices, a, b, c, d) => [a, b, c, d].map (i => new THREE.Vector2 (...ExposedEdgeUV (vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2], boardVisual)))
        } });
        geometry.rotateX (-Math.PI / 2); const mesh = MeshData (geometry, name, group => group === 1 ? 1 : 0);
        // ExtrudeGeometry uses float32 storage. Restore canonical coordinates so
        // meshes and collision prisms agree on long, fractional-mm blanks.
        mesh.vertices = mesh.vertices.map (v => { const p = points.reduce ((best, p) => Math.hypot (p[0] - v[0], -p[1] - v[2]) < Math.hypot (best[0] - v[0], -best[1] - v[2]) ? p : best); return [p[0], v[1] > t / 2 ? t : 0, -p[1] || 0]; });
        mesh.triangles.forEach (triangle => { if (triangle.material === 0 && mesh.normals[triangle.normals[0]][1] > .5) { triangle.material = 2; } });
        meshes.push (mesh); geometry.dispose (); panels.push ({ name, kind, index, solid : PanelSolid (points, t) });
    };
    const rectangle = (a, b, y0, y1) => [[a, y0], [b, y0], [b, y1], [a, y1]];
    const sides = ['left outer flap', 'front inner flap', 'right outer flap', 'back inner flap']; const wallNames = ['Left wall', 'Front wall', 'Right wall', 'Back wall'];
    for (let i = 0; i < 4; i++) {
        add (wallNames[i], rectangle (edges[i], edges[i + 1], 0, h), 'wall', i);
        const a = edges[i] + (i ? slot / 2 : 0); const b = edges[i + 1] - (i < 3 ? slot / 2 : 0);
        add ('Base ' + sides[i], rectangle (a, b, -depth, 0), 'base', i);
        if (parameters.code !== '0200') { add ('Top ' + sides[i], rectangle (a, b, h, h + depth), 'top', i); }
    }
    add ('Inside glued joint', [[-joint, 2 * t], [0, 0], [0, h], [-joint, h - 2 * t]], 'joint', 0);
    const rig = { apiVersion : 1, units : 'mm', parameters, profile, materials : BoardMaterials (boardVisual, profile.appearance), meshes, panels, edges, boardStack : ReferenceSingleWallStack (t, { pitchMm : boardVisual.pitchMm, fluteAxisRadians : boardVisual.directionDegrees * Math.PI / 180 }), artworkMapping : { coordinates : 'global-dieline-mm', repeat : false } };
    const material = profile.engineering?.materials.find (m => m.id === profile.engineering.activeMaterialId);
    if (material) { rig.boardStack = { model : 'visual-reference', units : 'mm', totalCaliperMm : t, outsideLinerMm : material.outsideLinerMm, insideLinerMm : material.insideLinerMm, mediumPaperMm : material.mediumPaperMm, flute : { pitchMm : material.flutePitchMm, axisRadians : material.fluteDirectionDegrees * Math.PI / 180, heightMm : t - material.outsideLinerMm - material.insideLinerMm }, scoreWidthMm : material.scoreWidthMm }; }
    rig.presentationMeshes = meshes.map ((mesh, i) => BoardAppearanceMesh (mesh, profile, panels[i].solid.vertices.slice (0, panels[i].solid.vertices.length / 2)));
    rig.presentationMeshes = TrimScoreDisplay (rig);
    rig.visualMeshes = CreaseVisualMeshes (rig, { matrices : panels.map (() => new THREE.Matrix4 ().toArray ()) }); return rig;
}

function FoldPose (rig, progress)
{
    if (!Number.isFinite (progress) || progress < 0 || progress > 1) { throw new Error ('Fold progress must be between 0 and 1.'); }
    const { length : l, width : w, height : h, thickness : t, code } = rig.parameters; const depth = FlapDepth (rig.parameters);
    const innerLayers = depth * 2 > l ? 2 : 1; const layers = innerLayers + (code === '0202' || code === '0203' ? 2 : 1);
    const raise = phase (progress, 0.02, 0.22);
    const root = translate ((-w / 2 - t) * raise, layers * t * raise, l / 2 * raise).multiply (new THREE.Matrix4 ().makeRotationY (Math.PI / 2 * raise)).multiply (new THREE.Matrix4 ().makeRotationX (Math.PI / 2 * raise));
    const walls = [root];
    // Outside score face: rotating about the inner face drives the finite board
    // into its neighbor. Three separate turns keep the closing seam outside.
    for (let i = 1; i < 4; i++) { const start = 0.18 + (i - 1) * 0.1; const turn = phase (progress, start, start + 0.1); walls.push (hinge (walls[i - 1], [rig.edges[i], t, 0], new THREE.Matrix4 ().makeRotationZ (Math.PI / 2 * turn))); }
    const matrices = rig.panels.map (panel => {
        if (panel.kind === 'wall') { return walls[panel.index].toArray (); }
        // Reserve one caliper for the seam before wrapping the sleeve. This
        // score clearance approximates compression at the glue-tab crease.
        if (panel.kind === 'joint') { return hinge (root.clone ().multiply (translate (0, t * phase (progress, 0.02, 0.06), 0)), [0, 0, 0], new THREE.Matrix4 ().makeRotationZ (-Math.PI / 2 * phase (progress, 0.06, 0.16))).toArray (); }
        const minor = panel.index % 2 === 1; const layer = minor ? (panel.index === 1 ? 0 : innerLayers - 1) : (panel.index === 0 ? innerLayers : layers - 1);
        // Inner pair first, then outer pair. Lift to the destination stack BEFORE
        // turning so overlapping OSC/FOL flaps cannot sweep through a closed flap.
        const top = panel.kind === 'top'; const order = [1, 3, 0, 2].indexOf (panel.index); const span = top ? 0.06 : 0.05; const start = (top ? 0.76 : 0.48) + order * span;
        const lift = phase (progress, start, start + span * 0.25); const fold = phase (progress, start + span * 0.25, start + span);
        if (top) {
            // Outward-open flaps use the outside roof edge. Lift one spare
            // caliper, stand the flap upright while shifting to the inside
            // score face, then settle onto its layer before folding inward.
            const roofLift = phase (progress, start, start + span * 0.1); const upright = phase (progress, start + span * 0.1, start + span * 0.25); const settle = phase (progress, start + span * 0.25, start + span * 0.35);
            const close = phase (progress, start + span * 0.35, start + span); const open = phase (progress, 0.48, 0.62);
            const angle = -20 * Math.PI / 180 * open * (1 - upright) + Math.PI / 2 * close;
            return hinge (walls[panel.index].clone ().multiply (translate (0, 0, -((layer + 1) * roofLift - settle) * t)), [0, t * upright, -h], new THREE.Matrix4 ().makeRotationX (angle)).toArray ();
        }
        const matrix = walls[panel.index].clone ().multiply (translate (0, 0, (top ? -1 : 1) * layer * t * lift));
        return hinge (matrix, [0, t, top ? -h : 0], new THREE.Matrix4 ().makeRotationX ((top ? 1 : -1) * Math.PI / 2 * fold)).toArray ();
    });
    const stage = progress === 0 ? 'flat' : progress < 0.48 ? 'erecting walls' : progress < 0.68 ? 'closing base' : progress < 0.76 ? 'open box' : progress < 1 ? (code === '0200' ? 'open HSC' : 'closing top') : (code === '0200' ? 'open HSC' : 'closed box');
    return { progress, stage, matrices };
}

export function FefcoFoldContacts (rig, pose)
{
    return SolidIntersections (rig.panels.map ((panel, index) => ({ name : panel.name, solid : panel.solid, matrix : pose.matrices[index] })));
}

export function FefcoFoldPose (rig, progress)
{
    const pose = FoldPose (rig, progress); const contacts = FefcoFoldContacts (rig, pose);
    if (!contacts.clear) { const pair = contacts.intersections[0]; throw new Error ('Fold blocked: ' + pair.panels.join (' / ') + ' intersect at ' + (progress * 100).toFixed (2) + '%.'); }
    // Collision solids retain the clearance needed by the folding audit. For
    // display, move only the glue tab back to its shared score so its tighter
    // visual arc joins both trimmed panels without a perpendicular step.
    const displayMatrices = pose.matrices.map (values => [...values]);
    if (ValidateBoardAppearance (rig.profile.appearance).enabled) {
        const wall = rig.panels.findIndex (panel => panel.kind === 'wall' && panel.index === 0), joint = rig.panels.findIndex (panel => panel.kind === 'joint');
        if (wall >= 0 && joint >= 0) { const root = new THREE.Matrix4 ().fromArray (pose.matrices[wall]), tab = new THREE.Matrix4 ().fromArray (pose.matrices[joint]); const normal = new THREE.Vector3 (0, 1, 0).transformDirection (root); const origin = new THREE.Vector3 ().setFromMatrixPosition (root), tabOrigin = new THREE.Vector3 ().setFromMatrixPosition (tab); const shift = tabOrigin.sub (origin).dot (normal); const offset = normal.multiplyScalar (-shift); tab.premultiply (translate (offset.x, offset.y, offset.z)); displayMatrices[joint] = tab.toArray (); }
    }
    const displayPose = { ...pose, displayMatrices }; return { ...displayPose, contacts, visualMeshes : CreaseVisualMeshes (rig, displayPose) };
}

// Audit independently of display frame rate, before replacing the original.
// Smoothstep hinge speed is at most 3600 degrees per unit progress, so these
// intervals limit each turn to one degree. Hosts can yield for processing UI.
export async function InspectFefcoFold (rig, yieldProgress = null)
{
    const steps = 3600; let samples = 0;
    for (let i = 0; i <= steps; i++) {
        const progress = i / steps; const pose = FoldPose (rig, progress); const contacts = FefcoFoldContacts (rig, pose); samples++;
        if (!contacts.clear) { return { code : rig.parameters.code, samples, angularStep : 1, progress, stage : pose.stage, ...contacts }; }
        if (yieldProgress && i % 128 === 0) { await yieldProgress (progress); }
    }
    return { code : rig.parameters.code, clear : true, samples, angularStep : 1, units : 'mm', tolerance : 0.00001, intersections : [] };
}

export function FefcoFoldFrame (rig, progress)
{
    const pose = FefcoFoldPose (rig, progress);
    const meshes = rig.meshes.map ((mesh, index) => {
        const matrix = new THREE.Matrix4 ().fromArray (pose.matrices[index]); const normals = new THREE.Matrix3 ().getNormalMatrix (matrix);
        return { ...mesh, vertices : mesh.vertices.map (point => new THREE.Vector3 (...point).applyMatrix4 (matrix).toArray ()), normals : mesh.normals.map (normal => new THREE.Vector3 (...normal).applyMatrix3 (normals).normalize ().toArray ()) };
    });
    return { ...rig, meshes, presentationMeshes : rig.presentationMeshes.map ((mesh, index) => TransformAppearanceMesh (mesh, pose.displayMatrices[index])), visualMeshes : pose.visualMeshes, state : progress === 0 ? 'flat' : 'folded', parameters : { ...rig.parameters, closure : progress === 1 && rig.parameters.code !== '0200' ? 'closed' : 'open' }, foldProgress : progress, stage : pose.stage };
}
