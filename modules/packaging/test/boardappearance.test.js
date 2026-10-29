import { FoldScorePairs, ScoreBandTrim } from '../src/scorebands.js';
import { CreateBoard } from '../src/geometry.js';
import assert from 'node:assert/strict';
import { CreateFefcoFoldRig, FefcoFoldFrame } from '../src/folding.js';
import { ValidatePackaging, ExportPackagingSVG } from '../src/profile.js';
import { FefcoProfile } from '../src/fefco.js';
import { BoardTexturePixels, BoardMaterials } from '../src/material.js';
import { ValidateBoardAppearance } from '../src/appearancesettings.js';
describe ('Realistic board appearance independent of CAD', () => {
    it ('Keeps canonical panels, score points and exports unchanged while adding finite bowed display surfaces', () => {
        const profile = FefcoProfile ({ length : 100, width : 80, height : 60 }); const original = JSON.stringify (profile), svg = ExportPackagingSVG (profile);
        const rig = CreateFefcoFoldRig ({ length : 100, width : 80, height : 60 }, profile), canonical = JSON.stringify (rig.meshes);
        assert.equal (rig.presentationMeshes.length, rig.meshes.length); assert.ok (rig.presentationMeshes.every (mesh => mesh.presentationOnly && mesh.vertices.flat ().every (Number.isFinite) && mesh.normals.flat ().every (Number.isFinite)));
        const wall = rig.presentationMeshes[0]; assert.ok (wall.vertices.some (p => p[1] > profile.thickness + .001), 'Bow must affect geometry, not only texture');
        assert.ok (wall.triangles.length > rig.meshes[0].triangles.length);
        for (const progress of [0, .23, .72, 1]) { const frame = FefcoFoldFrame (rig, progress); assert.ok (frame.presentationMeshes[0].normals.every (n => Math.abs (Math.hypot (...n) - 1) < 1e-8)); }
        assert.equal (JSON.stringify (rig.meshes), canonical); assert.equal (JSON.stringify (profile), original); assert.equal (ExportPackagingSVG (profile), svg);
    });
    it ('Pins the trimmed score-band faces and compresses only free cut boundaries', () => {
        const p = { length : 100, width : 80, height : 60 }; const profile = { ...FefcoProfile (p), appearance : { panelBow : 0, cutCompression : 1 } }; const rig = CreateFefcoFoldRig (p, profile);
        const wall = rig.presentationMeshes[0]; const faceVertices = new Set (wall.triangles.filter (triangle => triangle.material !== 1).flatMap (triangle => triangle.vertices)); const atScore = wall.vertices.filter ((v, index) => faceVertices.has (index) && Math.abs (v[0] - (100 - ScoreBandTrim (rig, FoldScorePairs (rig)[0]))) < 1e-7 && Math.abs (v[2] + 30) < 25); assert.ok (atScore.length); assert.ok (atScore.every (v => v[1] === 0 || Math.abs (v[1] - 3) < 1e-8));
        const flapIndex = rig.panels.findIndex (p => p.kind === 'base'); const flap = rig.presentationMeshes[flapIndex]; const minZ = Math.min (...flap.vertices.map (p => p[2]));
        const maxZ = Math.max (...flap.vertices.map (p => p[2])); const cutZ = Math.abs (minZ) > Math.abs (maxZ) ? minZ : maxZ;
        assert.ok (flap.vertices.some (v => Math.abs (v[2] - cutZ) < 1e-8 && v[1] > 0 && v[1] < 3));
    });
    it ('Rounds the exposed closing edge and minor flap cut without changing CAD', () => {
        for (const thickness of [1.5, 3, 7]) {
            const parameters = { length : 100, width : 80, height : 60, thickness }, profile = FefcoProfile (parameters), canonical = JSON.stringify (profile); const rig = CreateFefcoFoldRig (parameters, profile);
            for (const index of [rig.panels.findIndex (panel => panel.kind === 'wall' && panel.index === 3), rig.panels.findIndex (panel => panel.kind === 'top' && panel.index === 1)]) {
                const source = rig.meshes[index], visible = rig.presentationMeshes[index]; const boundary = Math.max (...source.vertices.map (point => point[0]));
                const faceVertices = new Set (visible.triangles.filter (triangle => triangle.material !== 1).flatMap (triangle => triangle.vertices));
                assert.ok (visible.vertices.some ((point, vertex) => faceVertices.has (vertex) && Math.abs (point[0] - boundary) < 1e-7 && point[1] > thickness * .01 && point[1] < thickness * .99), 'exposed cut should show a compressed liner shoulder');
                assert.ok (visible.vertices.every (point => point.every (Number.isFinite)));
            }
            assert.equal (JSON.stringify (profile), canonical);
        }
    });
    it ('Retains custom cut holes while supplying compressed display shoulders', () => {
        const profile = { version : 1, name : 'Die cut', grade : 'Custom', thickness : 3, paths : [{ id : 'outer', type : 'cut', closed : true, points : [[0, 0], [100, 0], [100, 80], [0, 80]] }, { id : 'hole', type : 'cut', closed : true, points : [[30, 30], [50, 30], [50, 50], [30, 50]] }] };
        const board = CreateBoard (profile, { textured : true }); assert.equal (board.presentationMeshes.length, 1); assert.ok (board.presentationMeshes[0].vertices.flat ().every (Number.isFinite));
        for (const triangle of board.presentationMeshes[0].triangles) { const centre = triangle.vertices.reduce ((sum, id) => [sum[0] + board.presentationMeshes[0].vertices[id][0] / 3, sum[1] - board.presentationMeshes[0].vertices[id][2] / 3], [0, 0]); assert.ok (!(centre[0] > 30 + 1e-6 && centre[0] < 50 - 1e-6 && centre[1] > 30 + 1e-6 && centre[1] < 50 - 1e-6)); }
    });
    it ('Validates persistent controls and restores exact rigid display when disabled', () => {
        for (const input of [{ panelBow : -1 }, { enabled : 1 }, { unknown : true }, { constructor : true }, { foldSoftness : 3 }]) { assert.throws (() => ValidateBoardAppearance (input)); }
        const profile = { ...FefcoProfile ({}), appearance : { enabled : false } }; const parsed = ValidatePackaging (profile); assert.equal (parsed.appearance.enabled, false);
        const rig = CreateFefcoFoldRig ({}, parsed); assert.deepEqual (rig.presentationMeshes, rig.meshes);
    });
    it ('Provides independent seamless outer/inner/closed liners and a horizontally tileable flute edge', () => {
        const textures = ['liner', 'inner', 'closed', 'edge'].map (role => BoardTexturePixels (role));
        for (const texture of textures) { const { width, height, pixels } = texture; for (let y = 0; y < height; y++) { assert.deepEqual (pixels.slice (y * width * 3, y * width * 3 + 3), pixels.slice ((y * width + width - 1) * 3, (y * width + width) * 3)); } }
        assert.notDeepEqual (textures[0].pixels, textures[1].pixels); assert.equal (BoardMaterials ().length, 4);
        for (const texture of textures.slice (0, 3)) { assert.deepEqual (texture.pixels.slice (0, texture.width * 3), texture.pixels.slice (-texture.width * 3)); }
    });
});
