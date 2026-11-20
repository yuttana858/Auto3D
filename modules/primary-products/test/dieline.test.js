import assert from 'node:assert/strict';
import { LabelDieline, DielineSvg, DielineDxf, ProductDesign, GetArtworkZones, CreateLabelMesh, ValidateProductArtwork, DefaultProductDraft } from '../src/index.js';

const art = (zone, extra = {}) => ({ resourceId : 'a'.repeat (64), name : 'Art', mime : 'image/png', zone, widthMm : 40, heightMm : 30, ...extra });

describe ('Primary Products label dielines', () => {
    it ('sizes wraps to the real label: circumference plus glue overlap, none on printed beverage cans', () => {
        const food = LabelDieline (ProductDesign ('food-can'), { zone : 'wrap' }), zone = GetArtworkZones (ProductDesign ('food-can')).find (z => z.id === 'wrap');
        // A 300 × 407 can's paper label is about 9 3/8 × 4 1/16 in (238 × 103 mm): the body circumference plus 6 mm overlap.
        assert.equal (food.overlapMm, 6); assert.ok (Math.abs (food.trim.widthMm - (2 * Math.PI * zone.radiusMm + 6)) < 1e-9);
        assert.ok (Math.abs (food.trim.widthMm - 238.2) < 0.5 && Math.abs (food.trim.heightMm - 103.3) < 0.5, JSON.stringify (food.trim));
        assert.equal (food.placement.bottomMm, zone.bottomMm); assert.equal (food.product.construction, 'food');
        const can = LabelDieline (ProductDesign ('standard-beverage'), { zone : 'wrap' });
        assert.equal (can.overlapMm, 0); assert.ok (Math.abs (can.trim.widthMm - Math.PI * 66.2) < 1e-9); assert.equal (can.layers.OVERLAP.length, 0);
        const front = LabelDieline (ProductDesign ('boston-inspired'), { zone : 'front', bleedMm : 2, safeMm : 4 });
        assert.equal (front.overlapMm, 0); assert.equal (front.bleedMm, 2); assert.deepEqual (front.layers.SAFE[0].points[0], [4, 4]);
        assert.deepEqual (front.layers.BLEED[0].points[0], [-2, -2]); assert.deepEqual (front.layers.TRIM[0].points[2], [front.trim.widthMm, front.trim.heightMm]);
        assert.throws (() => LabelDieline (ProductDesign ('food-can'), { zone : 'side' }), /label zone/);
        assert.throws (() => LabelDieline (ProductDesign ('food-can'), { bleedMm : 30 }), /Bleed must be 0–20 mm/);
        assert.throws (() => LabelDieline (ProductDesign ('food-can'), { zone : 'front', safeMm : 40 }), /no printable area/);
    });
    it ('writes layered SVG and DXF at physical scale in millimetres', () => {
        const d = LabelDieline (ProductDesign ('food-can'), { zone : 'wrap' }), svg = DielineSvg (d, { name : 'Soup' }), dxf = DielineDxf (d, { name : 'Soup' });
        assert.match (svg, /width="244\.\d+mm"/); for (const layer of ['BLEED', 'TRIM', 'SAFE', 'OVERLAP', 'GUIDES', 'NOTES']) { assert.match (svg, new RegExp ('<g id="' + layer + '"')); }
        assert.match (svg, /Soup — wrap label dieline/); assert.match (svg, /238\.\d+ × 103\.3 mm/);
        assert.match (dxf, /\$INSUNITS\r\n70\r\n4/); for (const layer of ['BLEED', 'TRIM', 'SAFE', 'OVERLAP', 'GUIDES', 'NOTES']) { assert.match (dxf, new RegExp ('\r\n2\r\n' + layer + '\r\n')); }
        assert.equal ((dxf.match (/LWPOLYLINE/g) || []).length, 6); assert.match (dxf, /\r\nEOF\r\n$/); assert.ok (/^[\x00-\x7f]*$/.test (dxf), 'ASCII DXF');
    });
    it ('crops artwork bleed so the trim fills the label, on the printed body radius', () => {
        const draft = ProductDesign ('food-can'), zone = GetArtworkZones (draft).find (z => z.id === 'front');
        const plain = CreateLabelMesh (draft, art ('front')), bled = CreateLabelMesh (draft, art ('front', { bleedMm : 3 }));
        assert.equal (Math.min (...plain.uvs.filter ((_, i) => i % 2 === 0)), 0);
        assert.ok (Math.abs (Math.min (...bled.uvs.filter ((_, i) => i % 2 === 0)) - 3 / 46) < 1e-12 && Math.abs (Math.max (...bled.uvs.filter ((_, i) => i % 2 === 1)) - 33 / 36) < 1e-12);
        // Three-piece cans: the label sits on the body inside the seams (plus the 0.15 mm label offset).
        const r = Math.hypot (plain.positions[0], plain.positions[2]); assert.ok (Math.abs (r - (zone.radiusMm + 0.15)) < 1e-9 && zone.radiusMm < draft.diameterMm / 2);
        assert.throws (() => ValidateProductArtwork (draft, [art ('front', { bleedMm : 25 })]), /bleed must be 0–20 mm/);
        assert.equal (ValidateProductArtwork (draft, [art ('front', { bleedMm : 3 })])[0].bleedMm, 3);
        assert.ok (LabelDieline (DefaultProductDraft ('pouch'), { zone : 'front' }).trim.widthMm > 0);
    });
});
