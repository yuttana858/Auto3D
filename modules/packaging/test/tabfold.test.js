import assert from 'node:assert/strict';
import { ValidateTabFold, CreaseRings } from '../src/tabfold.js';
import { CreateBoard } from '../src/geometry.js';
import { CreateCanCollarPlan, CanRadialProfile, SolveTabFold } from '../src/cancollar.js';

// A revolved can surface: body r 33, short neck r 28.38 (117.7–118.34), recess r 26 under a 28.95 seam from 120.17.
function Can (segments = 48)
{
    const profile = [[33, 100], [33, 109.8], [28.38, 117.7], [28.38, 118.34], [25.8, 118.34], [26.7, 120.17], [28.95, 120.17], [28.95, 122]];
    const ring = ([r, y]) => Array.from ({ length : segments }, (_, s) => [r * Math.cos (2 * Math.PI * s / segments), y, r * Math.sin (2 * Math.PI * s / segments)]);
    const triangles = [];
    for (let i = 0; i + 1 < profile.length; i++) { const a = ring (profile[i]), b = ring (profile[i + 1]); for (let s = 0; s < segments; s++) { const n = (s + 1) % segments; triangles.push (...a[s], ...b[s], ...b[n], ...a[s], ...b[n], ...a[n]); } }
    return triangles;
}
const cans = []; for (let row = 0; row < 2; row++) { for (let col = 0; col < 3; col++) { cans.push ([col * 66, row * 66]); } }

describe ('Fold-up collar tabs', () => {
    it ('validates the fold angle', () => {
        assert.deepEqual (ValidateTabFold ({ version : 1, angleDeg : 30 }), { version : 1, angleDeg : 30 });
        assert.throws (() => ValidateTabFold ({ version : 1, angleDeg : 120 }), /0–90/);
        assert.throws (() => ValidateTabFold ({ version : 1, angleDeg : 30, extra : 1 }), /Invalid tab fold/);
    });
    it ('folds every tab up about its crease line and leaves the sheet flat', () => {
        const fold = 30, plan = CreateCanCollarPlan ({ cans, rimRadiusMm : 28.95, thickness : 0.61, standard : '12oz-202', tabFold : { version : 1, angleDeg : fold } });
        const rings = CreaseRings (plan.profile); assert.equal (rings.length, 6); assert.equal (rings[0].edges.length, 16);
        const flat = CreateBoard ({ ...plan.profile, tabFold : { version : 1, angleDeg : 0 } }), folded = CreateBoard (plan.profile);
        const heights = data => data.meshes[0].triangles.flatMap (t => t.vertices.map (v => data.meshes[0].vertices[v][1]));
        assert.ok (Math.max (...heights (flat)) <= 0.61 + 1e-6, Math.max (...heights (flat)));
        // The farthest tab corner (about 2.1 mm from its crease) rises by its distance × sin(fold) above the top face.
        const top = Math.max (...heights (folded)), corner = plan.reliefRadiusMm * Math.cos (Math.PI / 16) - plan.holeRadiusMm * Math.cos (Math.PI / 16 - 0.5 / plan.holeRadiusMm);
        assert.ok (Math.abs (top - (0.61 + corner * Math.sin (fold * Math.PI / 180))) < 0.02, top);
        // Nothing outside the crease rings moves: the outer outline and its faces stay at 0 and 0.61.
        const mesh = folded.meshes[0], outside = mesh.triangles.filter (t => t.vertices.every (v => { const p = mesh.vertices[v]; return rings.every (r => Math.hypot (p[0] - r.centre[0], -p[2] - r.centre[1]) > plan.reliefRadiusMm + 0.01); }));
        assert.ok (outside.length > 100); assert.ok (outside.every (t => t.vertices.every (v => [0, 0.61].some (h => Math.abs (mesh.vertices[v][1] - h) < 1e-6))));
        // The folded board keeps its top face area within the crease rings (tabs are rigid).
        assert.equal (folded.presentationMeshes[0], mesh);
    });
    it ('solves where the collar sits and how far the tabs fold to hook under the rim', () => {
        const triangles = Can (), outline = CanRadialProfile ([{ triangles, center : [0, 0] }], 109, 120.5);
        const fold = SolveTabFold ({ outline, rimRadiusMm : 28.95, rimBottomMm : 120.17, creaseRadiusMm : 29.05, tabs : 16, tipRadiusMm : 26.8, thickness : 0.61, notchWidthMm : 1 });
        assert.ok (fold, 'a fold fits'); assert.ok (fold.angleDeg >= 25 && fold.angleDeg <= 89);
        assert.ok (fold.tipTopMm <= 120.17 - 0.0254 + 1e-9, 'tips stay under the rim'); assert.ok (fold.lockMm >= 0.5, 'tips hook under the rim lip');
        assert.ok (fold.clearanceMm >= 0.0254 - 1e-9, 'tabs clear the can'); assert.ok (outline.radiusIn (fold.sheetTopMm - 0.61, fold.sheetTopMm) <= fold.creaseChordRadiusMm - 0.0254, 'the sheet clears the can');
        // Tabs too long for the recess have no fold that hooks under the rim without hitting the can.
        assert.equal (SolveTabFold ({ outline, rimRadiusMm : 28.95, rimBottomMm : 120.17, creaseRadiusMm : 29.05, tabs : 16, tipRadiusMm : 22, thickness : 0.61, notchWidthMm : 1 }), null);
    });
});
