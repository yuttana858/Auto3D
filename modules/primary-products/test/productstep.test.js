import assert from 'node:assert/strict';
import { ProductStep, CanOutline, LabelRegions, ProductDesign, GetArtworkZones, DefaultProductDraft } from '../src/index.js';

const closed = solid => { const uses = solid.edges.map (() => [0, 0]); for (const f of solid.faces) { for (const b of f.bounds) { for (const [e, forward] of b.loop) { uses[e][forward ? 0 : 1]++; } } } return uses.every (([a, b]) => a === 1 && b === 1); };

describe ('Primary Products exact CAD with label regions', () => {
    it ('writes real cans as closed solids of revolution with label zones as named, coloured faces', () => {
        for (const [id, zones] of [['standard-beverage', ['wrap']], ['food-can', ['front', 'back']], ['low-tin', []]]) {
            const { solid, labels, text } = ProductStep (ProductDesign (id), { zones, name : id });
            assert.ok (closed (solid), id + ' is closed'); assert.deepEqual (labels, zones);
            assert.match (text, /MANIFOLD_SOLID_BREP/); assert.match (text, /SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
            for (const zone of zones) { assert.match (text, new RegExp ("STYLED_ITEM\\('Label " + zone + "'")); assert.match (text, new RegExp ("ADVANCED_FACE\\('Label " + zone + "'")); }
            const outline = CanOutline (ProductDesign (id)); assert.equal (outline[0][0], 0); assert.equal (outline.at (-1)[0], 0);
            assert.ok (Math.max (...outline.map (p => p[0])) <= ProductDesign (id).diameterMm / 2 + 1e-9);
        }
    });
    it ('splits the label band exactly at the zone heights and angles', () => {
        const draft = ProductDesign ('food-can'), zone = GetArtworkZones (draft).find (z => z.id === 'front'), { solid } = ProductStep (draft, { zones : ['front'] });
        const faces = solid.faces.filter (f => f.label === 'front');
        assert.ok (faces.length >= 1 && faces.every (f => f.kind === 'cylinder' && Math.abs (f.radius - zone.radiusMm) < 1e-9));
        // Label face area = arc length × height of the zone.
        const vertex = i => solid.vertices[i].point, area = faces.reduce ((sum, f) => {
            const arcs = f.bounds[0].loop.map (([e]) => solid.edges[e]).filter (e => e.kind === 'circle'), ys = arcs.map (e => e.centre[1]);
            const span = arcs[0].t1 - arcs[0].t0; void vertex; return sum + f.radius * span * (Math.max (...ys) - Math.min (...ys));
        }, 0);
        assert.ok (Math.abs (area - zone.widthMm * zone.heightMm) < 1e-6 * area, area + ' vs ' + zone.widthMm * zone.heightMm);
        const [region] = LabelRegions (draft, ['front']); assert.ok (Math.abs (region.ranges[0][1] - region.ranges[0][0] - zone.widthMm / zone.radiusMm) < 1e-12);
    });
    it ('covers cans only for now', () => {
        assert.throws (() => ProductStep (DefaultProductDraft ('bottle')), /currently covers cans/);
    });
});
