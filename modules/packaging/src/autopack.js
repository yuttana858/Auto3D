import * as THREE from 'three';
import { CreateFefcoFoldRig, FefcoFoldPose } from './folding.js';
import { CreateAutoPackPlan } from './autopackplan.js';
export { AutoPackClearanceMm, CreateAutoPackPlan } from './autopackplan.js';
import { PanelSolid, SolidIntersections } from './solid.js';
import { TransformAppearanceMesh } from './boardappearance.js';

const translate = (x, y, z) => new THREE.Matrix4 ().makeTranslation (x, y, z);
const hinge = (matrix, pivot, rotation) => matrix.clone ().multiply (translate (...pivot)).multiply (rotation).multiply (translate (...pivot.map (v => -v)));
const phase = (progress, start, end) => { const t = Math.max (0, Math.min (1, (progress - start) / (end - start))); return t * t * (3 - 2 * t); };

export function CreateAutoPackRig (input, savedProfile = null)
{
    const plan = CreateAutoPackPlan ({ size : input.size, clearanceMm : input.clearanceMm, ...(input.material ? { material : input.material } : { thickness : input.thickness }) });
    const rig = CreateFefcoFoldRig (plan.parameters, savedProfile);
    rig.autoPack = plan;
    // Cosmetic bow and crease arcs can leave the audited prisms by more than
    // the requested clearance. Keep exact panel geometry for this tight fit;
    // existing material grain/texture maps remain available.
    rig.presentationMeshes = rig.meshes; rig.visualMeshes = [];
    const anchorIndex = rig.panels.findIndex (panel => panel.kind === 'base' && panel.index === 1);
    const final = FefcoFoldPose (rig, 1);
    const alignment = new THREE.Matrix4 ().makeRotationY (plan.swapped ? Math.PI / 2 : 0).multiply (translate (0, -(2 * plan.thickness + plan.clearanceMm), plan.thickness / 2));
    rig.autoPackAnchor = alignment.multiply (new THREE.Matrix4 ().fromArray (final.matrices[anchorIndex])).toArray ();
    const [x, y, z] = plan.size;
    rig.autoPackProduct = PanelSolid ([[-x / 2, -z / 2], [x / 2, -z / 2], [x / 2, z / 2], [-x / 2, z / 2]], y);
    return rig;
}

function Pose (rig, progress)
{
    if (!rig.autoPack || !Number.isFinite (progress) || progress < 0 || progress > 1) { throw new Error ('Choose an Auto Pack rig and fold progress between 0 and 1.'); }
    const { thickness : t, height : h } = rig.parameters, walls = [new THREE.Matrix4 ()];
    for (let i = 1; i < 4; i++) {
        const start = .2 + (i - 1) * .12;
        walls.push (hinge (walls[i - 1], [rig.edges[i], t, 0], new THREE.Matrix4 ().makeRotationZ (Math.PI / 2 * phase (progress, start, start + .12))));
    }
    const local = rig.panels.map (panel => {
        const wall = walls[panel.index];
        if (panel.kind === 'wall') { return wall; }
        if (panel.kind === 'joint') { return hinge (wall.clone ().multiply (translate (0, t * phase (progress, .02, .04), 0)), [0, 0, 0], new THREE.Matrix4 ().makeRotationZ (-Math.PI / 2 * phase (progress, .04, .15))); }
        const top = panel.kind === 'top', anchor = !top && panel.index === 1, layer = panel.index % 2 === 1 ? 0 : 1;
        const order = (top ? [1, 3, 0, 2] : [3, 0, 2]).indexOf (panel.index), start = (top ? .77 : .58) + order * .055;
        const turn = anchor ? phase (progress, 0, .2) : phase (progress, start + .01, start + .05);
        const lift = anchor ? 1 : phase (progress, start, start + .01);
        return hinge (wall.clone ().multiply (translate (0, 0, (top ? -1 : 1) * layer * t * lift)), [0, t, top ? -h : 0], new THREE.Matrix4 ().makeRotationX ((top ? 1 : -1) * Math.PI / 2 * turn));
    });
    const anchorIndex = rig.panels.findIndex (panel => panel.kind === 'base' && panel.index === 1);
    const root = new THREE.Matrix4 ().fromArray (rig.autoPackAnchor).multiply (local[anchorIndex].clone ().invert ());
    const matrices = local.map (matrix => root.clone ().multiply (matrix).toArray ());
    const stage = progress === 0 ? 'flat beneath product' : progress < .2 ? 'raising anchored wall' : progress < .56 ? 'wrapping walls around product' : progress < .75 ? 'closing base below product' : progress < 1 ? 'closing top above product' : 'packed';
    return { progress, stage, matrices, displayMatrices : matrices };
}

export function AutoPackFoldContacts (rig, pose)
{
    return SolidIntersections ([{ name : 'Selected product bounds', solid : rig.autoPackProduct, matrix : new THREE.Matrix4 ().toArray () }, ...rig.panels.map ((panel, i) => ({ name : panel.name, solid : panel.solid, matrix : pose.matrices[i] }))]);
}

export function AutoPackFoldPose (rig, progress)
{
    const pose = Pose (rig, progress), contacts = AutoPackFoldContacts (rig, pose);
    if (!contacts.clear) { throw new Error ('Auto Pack blocked: ' + contacts.intersections[0].panels.join (' / ') + ' intersect at ' + (100 * progress).toFixed (2) + '%.'); }
    return { ...pose, contacts, visualMeshes : [] };
}

// Audit is independent of display frame rate. Maximum hinge speed is 3375
// degrees/progress, so 3600 intervals keep sampled turns below one degree.
// This is a sampled solid audit, not a manufacturing tolerance certification.
export async function InspectAutoPackFold (rig, yieldProgress = null)
{
    const steps = 3600;
    for (let i = 0; i <= steps; i++) {
        const progress = i / steps, pose = Pose (rig, progress), contacts = AutoPackFoldContacts (rig, pose);
        if (!contacts.clear) { return { code : '0201', samples : i + 1, progress, stage : pose.stage, ...contacts }; }
        if (yieldProgress && i % 128 === 0) { await yieldProgress (progress); }
    }
    return { code : '0201', clear : true, samples : steps + 1, angularStep : 1, units : 'mm', tolerance : .00001, intersections : [], productClearanceMm : rig.autoPack.clearanceMm };
}

export function AutoPackFoldFrame (rig, progress)
{
    const pose = AutoPackFoldPose (rig, progress);
    const meshes = rig.meshes.map ((mesh, index) => {
        const matrix = new THREE.Matrix4 ().fromArray (pose.matrices[index]), normals = new THREE.Matrix3 ().getNormalMatrix (matrix);
        return { ...mesh, vertices : mesh.vertices.map (point => new THREE.Vector3 (...point).applyMatrix4 (matrix).toArray ()), normals : mesh.normals.map (normal => new THREE.Vector3 (...normal).applyMatrix3 (normals).normalize ().toArray ()) };
    });
    return { ...rig, meshes, presentationMeshes : rig.presentationMeshes.map ((mesh, index) => TransformAppearanceMesh (mesh, pose.displayMatrices[index])), visualMeshes : pose.visualMeshes, state : progress === 0 ? 'flat' : 'folded', parameters : { ...rig.parameters, closure : progress === 1 ? 'closed' : 'open' }, foldProgress : progress, stage : pose.stage };
}

export const AutoPackFrame = AutoPackFoldFrame;
