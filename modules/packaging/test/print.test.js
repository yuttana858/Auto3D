import assert from 'node:assert/strict';
import { ValidatePrint, FitArtwork, WhiteTopColor } from '../src/print.js';
import { CreateBoard } from '../src/geometry.js';
import { CreateCanCollarPlan, CollarStandard, StandardReliefHole, CollarBoards } from '../src/cancollar.js';

const id = 'a'.repeat (64);
const artwork = (extra = {}) => ({ resourceId : id, mime : 'image/png', name : 'Demo', widthPx : 400, heightPx : 200, xMm : 20, yMm : 10, widthMm : 40, heightMm : 20, ...extra });
const board = (print) => ({ version : 1, name : 'Board', grade : 'Custom', thickness : 1, paths : [{ id : 'o', type : 'cut', closed : true, points : [[0, 0], [100, 0], [100, 50], [0, 50]] }], ...(print ? { print } : {}) });
// Top-face area per material, from the mesh triangles facing up.
function TopAreas (data)
{
    const mesh = data.meshes[0], areas = new Map ();
    for (const t of mesh.triangles) {
        if (mesh.normals[t.normals[0]][1] <= .5) { continue; }
        const [a, b, c] = t.vertices.map (i => mesh.vertices[i]);
        const area = Math.abs ((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2;
        areas.set (t.material, (areas.get (t.material) || 0) + area);
    }
    return areas;
}

describe ('Board print', () => {
    it ('validates grounds and artwork placement', () => {
        assert.deepEqual (ValidatePrint ({ version : 1, ground : 'white' }), { version : 1, ground : 'white' });
        assert.equal (ValidatePrint ({ version : 1, ground : 'natural', artwork : artwork () }).artwork.widthMm, 40);
        assert.throws (() => ValidatePrint ({ version : 1, ground : 'gold' }), /ground/);
        assert.throws (() => ValidatePrint ({ version : 1, ground : 'white', artwork : artwork ({ resourceId : 'x' }) }), /resource/);
        assert.throws (() => ValidatePrint ({ version : 1, ground : 'white', artwork : artwork ({ mime : 'image/gif' }) }), /PNG/);
        assert.throws (() => ValidatePrint ({ version : 1, ground : 'white', artwork : artwork ({ widthMm : 0 }) }), /size/);
        assert.throws (() => ValidatePrint ({ version : 1, ground : 'white', extra : 1 }), /Invalid/);
    });
    it ('fits artwork over an area by cover, contain or stretch', () => {
        const area = { minX : 0, minY : 0, maxX : 100, maxY : 50 };
        assert.deepEqual (FitArtwork ({ widthPx : 100, heightPx : 100 }, area, 'cover'), { xMm : 0, yMm : -25, widthMm : 100, heightMm : 100 });
        assert.deepEqual (FitArtwork ({ widthPx : 100, heightPx : 100 }, area, 'contain'), { xMm : 25, yMm : 0, widthMm : 50, heightMm : 50 });
        assert.deepEqual (FitArtwork ({ widthPx : 100, heightPx : 100 }, area, 'stretch'), { xMm : 0, yMm : 0, widthMm : 100, heightMm : 50 });
    });
    it ('turns the top face white and leaves the back and edges natural', () => {
        const plain = CreateBoard (board (), { textured : true }), white = CreateBoard (board ({ version : 1, ground : 'white' }), { textured : true });
        const ground = white.materials.findIndex (m => m.role === 'print-ground');
        assert.ok (ground > 0); assert.deepEqual (white.materials[ground].color, [...WhiteTopColor]); assert.equal (white.materials[ground].diffuseMap, undefined);
        assert.ok (Math.abs (TopAreas (white).get (ground) - 5000) < 1e-6);
        assert.equal (white.meshes[0].triangles.filter (t => t.material === 2).length, plain.meshes[0].triangles.filter (t => t.material === 2).length);
        assert.equal (white.presentationMeshes[0].triangles.filter (t => t.material === ground).length > 0, true);
    });
    it ('splits the top face at the artwork rectangle and maps the image across it', () => {
        const data = CreateBoard (board ({ version : 1, ground : 'white', artwork : artwork () }), { textured : true });
        const art = data.materials.findIndex (m => m.role === 'print'), ground = data.materials.findIndex (m => m.role === 'print-ground');
        assert.equal (data.materials[art].printResource, id); assert.equal (data.materials[art].printMime, 'image/png');
        const areas = TopAreas (data); assert.ok (Math.abs (areas.get (art) - 800) < 1e-6); assert.ok (Math.abs (areas.get (ground) - 4200) < 1e-6);
        // Artwork UVs run 0–1 across the rectangle, with v up the profile (y = −z).
        const mesh = data.meshes[0];
        for (const t of mesh.triangles.filter (t => t.material === art)) {
            t.vertices.forEach ((v, i) => { const p = mesh.vertices[v], uv = mesh.uvs[t.uvs[i]]; assert.ok (Math.abs (uv[0] - (p[0] - 20) / 40) < 1e-9 && Math.abs (uv[1] - (-p[2] - 10) / 20) < 1e-9); });
        }
        // Artwork reaching past the cut edge is cropped by it; artwork on a natural board keeps the kraft top.
        const over = TopAreas (CreateBoard (board ({ version : 1, ground : 'natural', artwork : artwork ({ xMm : -50, yMm : -50, widthMm : 300, heightMm : 300 }) }), { textured : true }));
        const overData = CreateBoard (board ({ version : 1, ground : 'natural', artwork : artwork ({ xMm : 80 }) }), { textured : true });
        assert.ok (Math.abs ([...over.values ()].reduce ((a, b) => a + b, 0) - 5000) < 1e-6); assert.ok (Math.abs (TopAreas (overData).get (0) - (5000 - 400)) < 1e-6);
    });
});

describe ('12 oz collar standard', () => {
    const cans = []; for (let row = 0; row < 2; row++) { for (let col = 0; col < 3; col++) { cans.push ([col * 66, row * 66]); } }
    it ('uses the same hole for every pack: 16 tabs, 4.5 mm tall, tips Ø 55, reliefs Ø 64', () => {
        const s = CollarStandard ('12oz-202');
        assert.equal (s.tabs, 16); assert.equal (s.tabHeightMm, 4.5); assert.ok (Math.abs (s.tabWidthMm - (Math.PI * 55 / 16 - 1)) < 1e-12);
        const six = CreateCanCollarPlan ({ cans, rimRadiusMm : 28.95, neckRadiusMm : 26.65, thickness : 0.61, standard : '12oz-202', tabs : 30, reliefMm : 9 });
        const four = CreateCanCollarPlan ({ cans : cans.slice (0, 2).concat (cans.slice (3, 5)), rimRadiusMm : 28.6, neckRadiusMm : 26.65, thickness : 0.61, standard : '12oz-202' });
        assert.equal (six.tabs, 16); assert.equal (six.holeRadiusMm, 27.5); assert.equal (six.reliefRadiusMm, 32); assert.equal (six.standard.id, '12oz-202');
        // Every hole is the standard CAD hole, translated: identical shape whatever the pack.
        const offsets = plan => plan.profile.paths.slice (1).map (path => { const c = path.points.reduce ((s, p) => [s[0] + p[0] / path.points.length, s[1] + p[1] / path.points.length], [0, 0]); return path.points.map (p => [p[0] - c[0], p[1] - c[1]].map (v => Number (v.toFixed (9)))); });
        const reference = StandardReliefHole ('12oz-202', [0, 0]).map (p => p.map (v => Number (v.toFixed (9))));
        [...offsets (six), ...offsets (four)].forEach (hole => assert.deepEqual (hole.map (p => p.map (v => Number (v.toFixed (6)))), reference.map (p => p.map (v => Number (v.toFixed (6))))));
        assert.ok (six.webMm >= 2 - 1e-9);
    });
    it ('refuses cans that are not 12 oz, too close or whose neck the tabs would cut', () => {
        assert.throws (() => CreateCanCollarPlan ({ cans, rimRadiusMm : 26, thickness : 0.61, standard : '12oz-202' }), /do not fit/);
        assert.throws (() => CreateCanCollarPlan ({ cans : [[0, 0], [65, 0]], rimRadiusMm : 28.9, thickness : 0.61, standard : '12oz-202' }), /at least 65.5 mm/);
        assert.throws (() => CreateCanCollarPlan ({ cans, rimRadiusMm : 28.9, neckRadiusMm : 27.6, thickness : 0.61, standard : '12oz-202' }), /cut into this can neck/);
        assert.throws (() => CollarStandard ('16oz'), /Choose a collar standard/);
    });
    it ('carries the white top print into the collar profile', () => {
        const board = CollarBoards.find (b => b.id === 'cuk-24pt'); assert.equal (board.ground, 'white');
        const plan = CreateCanCollarPlan ({ cans, rimRadiusMm : 28.95, thickness : board.caliperMm, standard : '12oz-202', print : { version : 1, ground : board.ground } });
        assert.deepEqual (plan.profile.print, { version : 1, ground : 'white' });
    });
});
