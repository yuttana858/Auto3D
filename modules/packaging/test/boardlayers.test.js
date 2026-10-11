import * as assert from 'node:assert/strict';
import { ValidateBoardStack, ReferenceSingleWallStack, FluteWaveAt, ScoreSurfaceAt, SampleConnectedScore, SheetArtworkUV, CreateCorrugatedSample } from '../src/index.js';

describe ('Corrugated layered CAD foundation', () => {
    it ('requires physically ordered liner and medium layers', () => {
        const board = ReferenceSingleWallStack (3, { pitchMm : 8 });
        assert.equal (board.layers.map (l => l.type).join (','), 'liner,medium,liner');
        assert.ok (Math.abs (board.totalCaliperMm - 3) < 1e-9);
        assert.throws (() => ValidateBoardStack ({ layers : [], flute : {} }), /alternating/);
    });
    it ('keeps flute phase continuous and directional in global sheet coordinates', () => {
        const board = ReferenceSingleWallStack (3, { pitchMm : 8 });
        assert.ok (Math.abs (FluteWaveAt (board, 0, 0).phase - FluteWaveAt (board, 100, 0).phase) < 1e-9);
        assert.ok (Math.abs (FluteWaveAt (board, 0, 0).phase - FluteWaveAt (board, 0, 8).phase + 2 * Math.PI) < 1e-9);
    });
    it ('preserves shared sheet art UV registration across a connected crease', () => {
        const a = SheetArtworkUV (50, 20, { sizeMm : [200, 100] });
        const b = SheetArtworkUV (50, 20, { sizeMm : [200, 100] });
        assert.deepEqual (a, b); assert.equal (a.repeat, false);
        const board = ReferenceSingleWallStack (2.5);
        const fold = SampleConnectedScore (board, { widthMm : 10, angleRadians : Math.PI / 2, sheetYmm : 20 });
        assert.equal (fold.samples.length, 33);
        assert.equal (fold.artwork.repeat, false);
        assert.ok (fold.samples.every (sample => sample.layers.length === 3 && sample.sheetUV[0] === sample.x));
    });
    it ('produces joined, tangent-continuous curve at score boundaries', () => {
        const score = { widthMm : 10, angleRadians : Math.PI / 2 };
        const eps = 1e-6;
        const left = ScoreSurfaceAt (-5, score), before = ScoreSurfaceAt (-5 - eps, score);
        const right = ScoreSurfaceAt (5, score), after = ScoreSurfaceAt (5 + eps, score);
        assert.ok (Math.hypot (...left.positionMm.map ((v,i) => v - before.positionMm[i])) < eps * 1.1);
        assert.ok (Math.hypot (...right.positionMm.map ((v,i) => v - after.positionMm[i])) < eps * 1.1);
        assert.ok (Math.abs (left.tangent[0] - 1) < 1e-9);
        assert.ok (Math.abs (right.tangent[1] - 1) < 1e-9);
        assert.throws (() => ScoreSurfaceAt (0, { widthMm : 0, angleRadians : 0 }), /width/);
    });
});

describe ('Corrugated cutaway CAD specimen', () => {
    it ('creates separate, closed outside/medium/inside solids with directional wave', () => {
        const model = CreateCorrugatedSample ({ widthMm : 48, lengthMm : 40, caliperMm : 3, flutePitchMm : 8, samplesAcross : 32, samplesAlong : 8 });
        assert.equal (model.meshes.length, 3);
        assert.deepEqual (model.materials.map (item => item.role), ['outside-liner', 'fluted-medium', 'inside-liner']);
        assert.equal (model.artworkMapping.repeat, false);
        for (const mesh of model.meshes) {
            assert.ok (mesh.triangles.length > 100);
            assert.ok (mesh.triangles.every (t => t.vertices.length === 3 && t.vertices.every (i => i < mesh.vertices.length) && t.normals.every (i => i < mesh.normals.length)));
        }
        const medium = model.meshes[1];
        const ys = medium.vertices.map (p => p[1]);
        assert.ok (Math.max (...ys) - Math.min (...ys) > 1);
        assert.ok (medium.vertices.every (p => p[1] > 0.24 && p[1] < 2.76));
    });
    it ('rejects impossible board stack thickness', () => {
        assert.throws (() => CreateCorrugatedSample ({ caliperMm : 1, insideLinerMm : 0.5, outsideLinerMm : 0.5 }), /calipers/);
    });
});
