import assert from 'node:assert/strict';
import { NewLabelCAD, ValidateLabelCAD, ScaleLabelCAD, LabelCADSVG } from '../src/labelcad.js';
import { DefaultProductDraft } from '../src/state.js';
import { GetArtworkZones } from '../src/zones.js';
import { CreateLabelMesh, ValidateProductArtwork } from '../src/artwork.js';
import { ProductDefinition, ValidateProductDefinition } from '../src/definition.js';

const art = { resourceId : 'a'.repeat (64), name : 'CAD label', mime : 'image/png', zone : 'front', widthMm : 20, heightMm : 30 };
describe ('Portable label CAD and circular cap labels', function () {
    it ('preserves independently editable cut and artwork paths through definitions and physical scaling', function () {
        const cad = NewLabelCAD (20, 30); cad.paths.push ({ id : 'ink', type : 'artwork', closed : true, points : [[-5, -5], [5, -5], [0, 5]], fill : '#123456', stroke : 'none', strokeWidth : 0 });
        const definition = ValidateProductDefinition (JSON.parse (JSON.stringify (ProductDefinition (DefaultProductDraft (), [{ ...art, cad }]))));
        assert.deepEqual (definition.artwork[0].cad, cad); cad.paths[0].points[0][0] = 0; assert.equal (definition.artwork[0].cad.paths[0].points[0][0], -10);
        const scaled = ScaleLabelCAD (definition.artwork[0].cad, 40, 60); assert.deepEqual (scaled.paths[1].points, [[-10, -10], [10, -10], [0, 10]]);
        assert.match (LabelCADSVG (scaled), /clip-rule="evenodd"/); assert.match (LabelCADSVG (scaled), /fill="#123456"/);
    });
    it ('rejects invalid or unbounded archived label geometry and executable paints', function () {
        const cad = NewLabelCAD (20, 30);
        for (const changes of [{ widthMm : Infinity }, { paths : [] }, { surprise : true }, { paths : [{ ...cad.paths[0], closed : false }] }, { paths : [{ ...cad.paths[0], points : [[0, 0], [11, 0], [0, 1]] }] }]) { assert.throws (() => ValidateLabelCAD ({ ...cad, ...changes })); }
        assert.throws (() => ValidateLabelCAD ({ ...cad, paths : [...cad.paths, { id : 'bad', type : 'artwork', closed : true, points : [[0, 0], [1, 0], [0, 1]], fill : 'url(https://example.com/ink)' }] }));
        assert.throws (() => ValidateProductArtwork (DefaultProductDraft (), [{ ...art, cad : NewLabelCAD (25, 30) }]));
    });
    it ('rejects combined CAD metadata beyond the portable archive budget before generation', function () {
        const cad = NewLabelCAD (10, 10); cad.paths.push ({ id : 'dense', type : 'artwork', closed : false, points : Array.from ({ length : 1996 }, (_, index) => [Math.sin (index) * 4, Math.cos (index * Math.SQRT2) * 4]), fill : 'none', stroke : '#123456', strokeWidth : .1 });
        const entries = ['front', 'back', 'cap-top'].map (zone => ({ ...art, zone, widthMm : 10, heightMm : 10, cad }));
        assert.ok (JSON.stringify (entries).length > 240000); assert.throws (() => ValidateProductArtwork (DefaultProductDraft (), entries), /portable product metadata limit/);
    });
    it ('allows a cap label alongside front/back or wrap and rejects circular overflow', function () {
        const draft = DefaultProductDraft (), zone = GetArtworkZones (draft).find (item => item.id === 'cap-top');
        const cap = { ...art, zone : 'cap-top', widthMm : zone.widthMm, heightMm : zone.heightMm };
        assert.equal (ValidateProductArtwork (draft, [art, { ...art, zone : 'back' }, cap]).length, 3);
        assert.equal (ValidateProductArtwork (draft, [{ ...art, zone : 'wrap' }, cap]).length, 2);
        assert.throws (() => ValidateProductArtwork (draft, [{ ...cap, offsetXmm : .1 }]));
        assert.throws (() => ValidateProductArtwork (DefaultProductDraft ('can'), [cap]));
        const mesh = CreateLabelMesh (draft, cap); assert.equal (mesh.indices.length / 3, 64); assert.ok (mesh.positions.every (Number.isFinite));
        for (let i = 0; i < mesh.positions.length; i += 3) { assert.ok (Math.hypot (mesh.positions[i], mesh.positions[i + 2]) <= zone.radiusMm + 1e-7); assert.equal (mesh.positions[i + 1], draft.heightMm + .08); }
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const [a, b, c] = mesh.indices.slice (i, i + 3).map (id => mesh.positions.slice (id * 3, id * 3 + 3));
            assert.ok ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0);
        }
    });
});
