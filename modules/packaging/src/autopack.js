import * as THREE from 'three';
import { CreateFefcoFoldRig, FefcoFoldPose, FefcoFlapLayers, FefcoFlapLayer, FefcoDisplayPose } from './folding.js';
import { CreateAutoPackPlan } from './autopackplan.js';
export { AutoPackClearanceMm, CreateAutoPackPlan, AutoPackStyles } from './autopackplan.js';
import { PanelSolid, SolidIntersections } from './solid.js';
import { TransformAppearanceMesh } from './boardappearance.js';

const translate = (x, y, z) => new THREE.Matrix4 ().makeTranslation (x, y, z);
const hinge = (matrix, pivot, rotation) => matrix.clone ().multiply (translate (...pivot)).multiply (rotation).multiply (translate (...pivot.map (v => -v)));
const phase = (progress, start, end) => { const t = Math.max (0, Math.min (1, (progress - start) / (end - start))); return t * t * (3 - 2 * t); };

export function CreateAutoPackRig (input, savedProfile = null)
{
    const plan = CreateAutoPackPlan ({ size : input.size, clearanceMm : input.clearanceMm, ...(input.code ? { code : input.code } : {}), ...(input.material ? { material : input.material } : { thickness : input.thickness }) });
    // The carton is the Packaging generator's own rig for this style: same panels, presentation meshes (board
    // appearance, panel bow, trimmed score bands) and crease visuals, so new generator styles carry over unchanged.
    // The product-clearance audit uses the exact panel solids; bow and rounded crease joins are display only.
    const rig = CreateFefcoFoldRig (plan.parameters, savedProfile);
    rig.autoPack = plan; rig.flapLayers = FefcoFlapLayers (plan.parameters);
    const anchorIndex = rig.panels.findIndex (panel => panel.kind === 'base' && panel.index === 1);
    const final = FefcoFoldPose (rig, 1);
    // The product rests on the base flap stack: drop the anchor by the stack plus clearance.
    const alignment = new THREE.Matrix4 ().makeRotationY (plan.swapped ? Math.PI / 2 : 0).multiply (translate (0, -(rig.flapLayers.baseLayers * plan.thickness + plan.clearanceMm), plan.thickness / 2));
    rig.autoPackAnchor = alignment.multiply (new THREE.Matrix4 ().fromArray (final.matrices[anchorIndex])).toArray ();
    const [x, y, z] = plan.size;
    rig.autoPackProduct = PanelSolid ([[-x / 2, -z / 2], [x / 2, -z / 2], [x / 2, z / 2], [-x / 2, z / 2]], y);
    return rig;
}

// Open top: top flaps stand 120° open from closed, i.e. 30° outward past upright, so the product can be loaded or shown.
export const AutoPackOpenTopDegrees = 120;
const OpenTopAngle = Math.PI / 2 - AutoPackOpenTopDegrees * Math.PI / 180;
// openTop (0–1) blends each top flap from its closed route to the open-top route: the last-closed (outer) flap opens
// first, and each flap leaves its closed stack offset while it passes upright. A carton saved with an open top
// (rig.autoPackOpenTop) folds and unfolds with its top flaps on the open route.
function Pose (rig, progress, openTop = rig.autoPackOpenTop ? 1 : 0)
{
    if (!rig.autoPack || !Number.isFinite (progress) || progress < 0 || progress > 1) { throw new Error ('Choose an Auto Pack rig and fold progress between 0 and 1.'); }
    if (!Number.isFinite (openTop) || openTop < 0 || openTop > 1) { throw new Error ('Open top must be between 0 and 1.'); }
    const { thickness : t, height : h } = rig.parameters, walls = [new THREE.Matrix4 ()];
    for (let i = 1; i < 4; i++) {
        const start = .2 + (i - 1) * .12;
        walls.push (hinge (walls[i - 1], [rig.edges[i], t, 0], new THREE.Matrix4 ().makeRotationZ (Math.PI / 2 * phase (progress, start, start + .12))));
    }
    const local = rig.panels.map (panel => {
        const wall = walls[panel.index];
        if (panel.kind === 'wall') { return wall; }
        if (panel.kind === 'joint') { return hinge (wall.clone ().multiply (translate (0, t * phase (progress, .02, .04), 0)), [0, 0, 0], new THREE.Matrix4 ().makeRotationZ (-Math.PI / 2 * phase (progress, .04, .15))); }
        const top = panel.kind === 'top', anchor = !top && panel.index === 1, layer = FefcoFlapLayer (panel, rig.flapLayers);
        const order = (top ? [1, 3, 0, 2] : [3, 0, 2]).indexOf (panel.index), start = (top ? .77 : .58) + order * .055;
        const turn = anchor ? phase (progress, 0, .2) : phase (progress, start + .01, start + .05);
        const lift = anchor ? 1 : phase (progress, start, start + .01);
        if (top && openTop > 0) {
            const opening = [2, 0, 3, 1].indexOf (panel.index) * .25, blend = phase (openTop, opening, opening + .25);
            // Like closing in reverse: swing up to upright, leave the stack offset while exactly upright, then lean outward.
            const closed = Math.PI / 2 * turn, open = OpenTopAngle * phase (progress, .7, .77);
            const angle = closed * (1 - phase (blend, 0, .6)) + open * phase (blend, .7, 1), unlift = phase (blend, .6, .7);
            // Inward turns hinge on the inside score face; the outward lean hinges on the outside face (as in the generator),
            // so the board never rolls into its own wall. The pivot moves while upright, where it changes nothing.
            return hinge (wall.clone ().multiply (translate (0, 0, -layer * t * lift * (1 - unlift))), [0, t * (1 - unlift), -h], new THREE.Matrix4 ().makeRotationX (angle));
        }
        return hinge (wall.clone ().multiply (translate (0, 0, (top ? -1 : 1) * layer * t * lift)), [0, t, top ? -h : 0], new THREE.Matrix4 ().makeRotationX ((top ? 1 : -1) * Math.PI / 2 * turn));
    });
    const anchorIndex = rig.panels.findIndex (panel => panel.kind === 'base' && panel.index === 1);
    const root = new THREE.Matrix4 ().fromArray (rig.autoPackAnchor).multiply (local[anchorIndex].clone ().invert ());
    const matrices = local.map (matrix => root.clone ().multiply (matrix).toArray ());
    const tops = rig.panels.some (panel => panel.kind === 'top');
    const stage = progress === 0 ? 'flat beneath product' : progress < .2 ? 'raising anchored wall' : progress < .56 ? 'wrapping walls around product' : progress < .75 ? 'closing base below product' : progress < 1 ? (tops && openTop === 1 ? 'opening top flaps' : 'closing top above product') : tops && openTop === 1 ? 'open top' : tops && openTop > 0 ? 'opening top' : 'packed';
    return { progress, stage, matrices, displayMatrices : matrices };
}

export function AutoPackFoldContacts (rig, pose)
{
    return SolidIntersections ([{ name : 'Selected product bounds', solid : rig.autoPackProduct, matrix : new THREE.Matrix4 ().toArray () }, ...rig.panels.map ((panel, i) => ({ name : panel.name, solid : panel.solid, matrix : pose.matrices[i] }))]);
}

export function AutoPackFoldPose (rig, progress, openTop = undefined)
{
    const pose = Pose (rig, progress, openTop), contacts = AutoPackFoldContacts (rig, pose);
    if (!contacts.clear) { throw new Error ('Auto Pack blocked: ' + contacts.intersections[0].panels.join (' / ') + ' intersect at ' + (100 * progress).toFixed (2) + '%.'); }
    return { ...pose, contacts, ...FefcoDisplayPose (rig, pose) };
}

// Audit is independent of display frame rate. Maximum hinge speed is 3375
// degrees/progress, so 3600 intervals keep sampled turns below one degree.
// This is a sampled solid audit, not a manufacturing tolerance certification.
// route 'top' audits the open/close-top motion of a packed carton (openTop 0 → 1 at full fold).
export async function InspectAutoPackFold (rig, yieldProgress = null, route = 'fold')
{
    const steps = 3600, top = route === 'top';
    for (let i = 0; i <= steps; i++) {
        const progress = i / steps, pose = top ? Pose (rig, 1, progress) : Pose (rig, progress), contacts = AutoPackFoldContacts (rig, pose);
        if (!contacts.clear) { return { code : rig.parameters.code, samples : i + 1, progress, stage : pose.stage, ...contacts }; }
        if (yieldProgress && i % 128 === 0) { await yieldProgress (progress); }
    }
    return { code : rig.parameters.code, clear : true, samples : steps + 1, angularStep : 1, units : 'mm', tolerance : .00001, intersections : [], productClearanceMm : rig.autoPack.clearanceMm };
}

export function AutoPackFoldFrame (rig, progress, openTop = undefined)
{
    const pose = AutoPackFoldPose (rig, progress, openTop);
    const meshes = rig.meshes.map ((mesh, index) => {
        const matrix = new THREE.Matrix4 ().fromArray (pose.matrices[index]), normals = new THREE.Matrix3 ().getNormalMatrix (matrix);
        return { ...mesh, vertices : mesh.vertices.map (point => new THREE.Vector3 (...point).applyMatrix4 (matrix).toArray ()), normals : mesh.normals.map (normal => new THREE.Vector3 (...normal).applyMatrix3 (normals).normalize ().toArray ()) };
    });
    return { ...rig, meshes, presentationMeshes : rig.presentationMeshes.map ((mesh, index) => TransformAppearanceMesh (mesh, pose.displayMatrices[index])), visualMeshes : pose.visualMeshes, state : progress === 0 ? 'flat' : 'folded', parameters : { ...rig.parameters, closure : progress === 1 && (openTop ?? (rig.autoPackOpenTop ? 1 : 0)) < 1 ? 'closed' : 'open' }, foldProgress : progress, stage : pose.stage };
}

export const AutoPackFrame = AutoPackFoldFrame;
