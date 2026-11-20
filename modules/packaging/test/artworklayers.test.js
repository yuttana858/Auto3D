import assert from 'node:assert/strict';
import { ValidatePackaging, ExportPackagingSVG, ExportPackagingDXF, ExportPackagingEPS, PackagingContours } from '../src/profile.js';
import { CreateBoard } from '../src/geometry.js';
import { CreateFefcoFoldRig } from '../src/folding.js';
import { DefaultFefco, FefcoProfile } from '../src/fefco.js';

const profile = { version : 1, name : 'Label', grade : 'Paper', thickness : .1, paths : [
    { id : 'cut', type : 'cut', closed : true, points : [[0, 0], [30, 0], [30, 20], [0, 20]] },
    { id : 'ink', type : 'artwork', closed : true, points : [[5, 5], [25, 5], [25, 15], [5, 15]], fill : '#cc2211', stroke : '#123456', strokeWidth : .2 }
] };
describe ('CAD artwork layer', function () {
    it ('retains safe editable artwork independently from cuts and scores in every export', function () {
        assert.deepEqual (ValidatePackaging (profile), profile);
        assert.match (ExportPackagingSVG (profile), /id="ARTWORK"/); assert.match (ExportPackagingSVG (profile), /fill="#cc2211"/);
        assert.match (ExportPackagingDXF (profile), /ARTWORK/); assert.match (ExportPackagingEPS (profile), /BeginAuto3DProcess: ARTWORK/); assert.match (ExportPackagingEPS (profile), /fill\ngrestore/);
        assert.throws (() => ValidatePackaging ({ ...profile, paths : [{ ...profile.paths[1], fill : 'url(#foreign)' }] }));
    });
    it ('keeps generated fold rigs when artwork paths are added', function () {
        const parameters = { ...DefaultFefco }, generated = FefcoProfile (parameters); generated.paths.push (profile.paths[1]);
        assert.doesNotThrow (() => CreateFefcoFoldRig (parameters, generated));
    });
    it ('excludes artwork from extrusion contours and 3D crease guides', function () {
        assert.equal (PackagingContours (profile).length, 1); assert.equal (PackagingContours (profile)[0].holes.length, 0);
        const board = CreateBoard (profile, { guides : true });
        assert.equal (board.meshes.find (mesh => mesh.name.startsWith ('SCORE')).lines.length, 0);
        const plain = CreateBoard ({ ...profile, paths : profile.paths.slice (0, 1) }, { guides : true });
        assert.deepEqual (board.meshes[0].vertices, plain.meshes[0].vertices);
    });
});
