import assert from 'node:assert/strict';
import { BoardTexturePixels, BoardMaterials } from '../src/material.js';
import { FlutePhaseAt, ExposedEdgeUV } from '../src/flutemapping.js';
import { CreateCorrugatedSample, FluteWaveAt } from '../src/boardlayers.js';
import { CreateFefcoFoldRig, FefcoFoldPose } from '../src/folding.js';
import { CreaseVisualMeshes } from '../src/creasevisuals.js';
describe ('Sheet-continuous corrugate textures', () => {
    it ('Distinguishes multiwall constructions and keeps their edge tiles periodic', () => {
        const board = { caliperMm : 7, outsideLinerMm : .3, insideLinerMm : .3, mediumPaperMm : .15 };
        const single = BoardTexturePixels ('edge', 0, false, .12, { ...board, flute : 'C' });
        for (const flute of ['EB', 'BC', 'ACA', 'BCB']) {
            const image = BoardTexturePixels ('edge', 0, false, .12, { ...board, flute });
            assert.notDeepEqual (image.pixels, single.pixels);
            let bands = 0, inBand = false;
            for (let y = 0; y < image.height; y++) { const liner = Array.from ({ length : image.width }, (_, x) => image.pixels[(y * image.width + x) * 3]).every (value => value > 160); if (liner && !inBand) { bands++; } inBand = liner; }
            assert.equal (bands, flute.length + 1, flute + ' outside, intermediate and inside liners');
            for (let y = 0; y < image.height; y++) { for (let c = 0; c < 3; c++) { assert.equal (image.pixels[y * image.width * 3 + c], image.pixels[(y * image.width + image.width - 1) * 3 + c]); } }
        }
    });
    it ('shares medium phase with edge UVs for cross, along and angled cuts', () => {
        for (const directionDegrees of [0, 30, 90]) {
            const angle = directionDegrees * Math.PI / 180; const board = { pitchMm : 6, caliperMm : 3, directionDegrees };
            for (const [x, y] of [[0, 0], [7, 3], [-12, 11]]) {
                const [u] = ExposedEdgeUV (x, y, 1.5, board);
                assert.ok (Math.abs (FlutePhaseAt (x, y, 6, angle) - u * 8 * Math.PI) < 1e-10);
                assert.ok (Math.abs (FluteWaveAt ({ flute : { pitchMm : 6, axisRadians : angle, phaseRadians : 0 } }, x, y).normalizedHeight - Math.cos (u * 8 * Math.PI)) < 1e-10);
            }
            const along = ExposedEdgeUV (10 * Math.cos (angle), 10 * Math.sin (angle), 1.5, board);
            assert.ok (Math.abs (along[0]) < 1e-10);
        }
    });
    it ('uses selected paper calipers and puts the medium crest at the shared zero phase', () => {
        const board = { caliperMm : 3, outsideLinerMm : .3, insideLinerMm : .15, mediumPaperMm : .18 };
        const data = BoardTexturePixels ('edge', 0, false, .12, board);
        const at = (u, depth) => data.pixels[(Math.round ((1 - depth) * (data.height - 1)) * data.width + Math.round (u * (data.width - 1))) * 3];
        assert.ok (at (0, .87) > at (0, .5) + 50);
        assert.ok (at (0, .87) - at (0, .5) >= 130, 'paper remains visibly distinct from the medium void');
        assert.ok (at (.125, .08) > at (.125, .5) + 50);
        assert.ok (at (.025, .94) > at (.025, .5) + 50);
        assert.notDeepEqual (BoardMaterials (board)[1].diffuseMap.buffer, BoardMaterials ({ ...board, outsideLinerMm : .45 })[1].diffuseMap.buffer);
    });
    it ('keeps wrapped-liner mapping independently editable despite shared texture buffers', () => {
        const materials = BoardMaterials ({ pitchMm : 6, directionDegrees : 30 });
        materials[3].normalMap.scale.x = 99; materials[3].color[0] = 12;
        assert.notEqual (materials[0].normalMap.scale.x, 99); assert.equal (materials[0].color[0], 255);
    });
    it ('maps the exposed thickness of the medium without collapsed UV triangles', () => {
        const medium = CreateCorrugatedSample ({ samplesAcross : 8, samplesAlong : 4 }).meshes[1];
        const caps = medium.triangles.filter (t => Math.abs (medium.normals[t.normals[0]][1]) < 1e-9);
        assert.ok (caps.length > 0);
        for (const t of caps) {
            const [a, b, c] = t.uvs.map (id => medium.uvs[id]);
            assert.ok (Math.abs ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > 1e-10);
        }
    });
    it ('keeps both fold liners on their adjoining materials and gives rounded folds a nonzero UV band', () => {
        const rig = CreateFefcoFoldRig ({ length : 100, width : 80, height : 60, thickness : 3 });
        const canonical = JSON.stringify (rig.meshes);
        const mesh = CreaseVisualMeshes (rig, FefcoFoldPose (rig, .72))[0];
        assert.deepEqual ([...new Set (mesh.triangles.map (t => t.material))], [0, 1, 2]);
        assert.ok (Math.abs (mesh.uvs[1][0] - mesh.uvs[mesh.segments * 4 + 1][0]) > 1e-6);
        assert.equal (JSON.stringify (rig.meshes), canonical);
    });
});
