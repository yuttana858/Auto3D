import assert from 'node:assert/strict';
import { CreatePrimaryProduct, GetArtworkZones, DefaultProductDraft } from '../src/index.js';

describe ('Primary Products neutral geometry', function () {
    for (const family of ['bottle', 'can']) {
        it (`builds bounded, closed, outward-facing ${family} components at supported extremes`, function () {
            for (const [heightMm, diameterMm] of [[20, 10], [190, 65], [1000, 500]]) {
                const product = CreatePrimaryProduct ({ ...DefaultProductDraft (family), heightMm, diameterMm });
                const all = [[], [], []];
                assert.equal (product.units, 'mm');
                for (const mesh of product.components) {
                    const edges = new Map (); let volume = 0;
                    const key = index => mesh.positions.slice (index * 3, index * 3 + 3).map (n => Math.round (n * 1e7)).join (',');
                    for (let i = 0; i < mesh.positions.length; i++) { assert.ok (Number.isFinite (mesh.positions[i])); all[i % 3].push (mesh.positions[i]); }
                    for (let i = 0; i < mesh.indices.length; i += 3) {
                        const ids = mesh.indices.slice (i, i + 3);
                        const [a, b, c] = ids.map (n => mesh.positions.slice (n * 3, n * 3 + 3));
                        const ab = b.map ((n, j) => n - a[j]); const ac = c.map ((n, j) => n - a[j]);
                        const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
                        assert.ok (Math.hypot (...cross) > 1e-8);
                        const normal = mesh.normals.slice (ids[0] * 3, ids[0] * 3 + 3);
                        assert.ok (cross.reduce ((sum, n, j) => sum + n * normal[j], 0) > 0);
                        volume += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
                        for (let j = 0; j < 3; j++) { const edge = [key (ids[j]), key (ids[(j + 1) % 3])].sort ().join ('/'); edges.set (edge, (edges.get (edge) || 0) + 1); }
                    }
                    assert.ok (volume > 0); assert.ok ([...edges.values ()].every (n => n === 2));
                    assert.equal (mesh.normals.length, mesh.positions.length); assert.equal (mesh.uvs.length, mesh.positions.length / 3 * 2);
                    assert.ok (mesh.indices.length / 3 < 20000);
                }
                all.forEach ((values, axis) => { assert.ok (Math.abs (Math.min (...values) - product.bounds.min[axis]) < 0.01); assert.ok (Math.abs (Math.max (...values) - product.bounds.max[axis]) < 0.01); });
            }
        });
    }
    it ('returns stable physical label zones on the straight body and independent results', function () {
        for (const family of ['bottle', 'can']) {
            const draft = DefaultProductDraft (family); const original = structuredClone (draft);
            const zones = GetArtworkZones (draft);
            assert.deepEqual (zones.map (z => z.id), ['front', 'back', 'wrap']);
            assert.equal (zones[2].widthMm, Math.PI * draft.diameterMm);
            assert.ok (zones.every (z => z.bottomMm + z.heightMm <= draft.heightMm * (family === 'bottle' ? 0.65 : 0.975)));
            const result = CreatePrimaryProduct (draft); result.definition.heightMm = 999;
            assert.deepEqual (draft, original); assert.equal (CreatePrimaryProduct (draft).definition.heightMm, original.heightMm);
        }
    });
    it ('builds custom shoulder/neck/cap geometry with closed components and safe straight label zones', function () {
        const draft = { ...DefaultProductDraft (),bottleShape : { neckDiameterMm : 24,shoulderHeightMm : 30,neckHeightMm : 20,capHeightMm : 20 } }, product = CreatePrimaryProduct (draft);
        const body = product.components[0], cap = product.components[1]; assert.ok (body.positions.some ((v,i) => i%3===1 && Math.abs(v-120)<1e-8));
        assert.equal (Math.min (...cap.positions.filter ((v,i) => i%3===1)),170); assert.equal (Math.max (...cap.positions.filter ((v,i) => i%3===1)),190);
        for (const mesh of product.components) { const edges = new Map (), key = id => mesh.positions.slice (id*3,id*3+3).map (v => Math.round(v*1e7)).join(','); for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3);for(let j=0;j<3;j++){const edge=[key(ids[j]),key(ids[(j+1)%3])].sort().join('/');edges.set(edge,(edges.get(edge)||0)+1);}} assert.ok ([...edges.values ()].every (v => v===2)); }
        assert.ok (product.artworkZones.every (z => z.bottomMm+z.heightMm<=120));
        const shorter = GetArtworkZones ({ ...draft,bottleShape : { ...draft.bottleShape,shoulderHeightMm : 105 } }); assert.ok (shorter[0].heightMm<product.artworkZones[0].heightMm);
    });
    it ('rejects malformed definitions and unbounded tessellation', function () {
        for (const segments of [0, 17, 129, Infinity, '64']) { assert.throws (() => CreatePrimaryProduct (DefaultProductDraft (), { segments })); }
        assert.throws (() => CreatePrimaryProduct ({ ...DefaultProductDraft (), heightMm : NaN }));
        assert.throws (() => CreatePrimaryProduct (DefaultProductDraft (), { extra : true }));
    });
});

describe ('Pillow pouch geometry', function () {
    it ('builds a closed filled envelope with valid normals and stable bounds', function () {
        for (const [widthMm, heightMm, depthMm] of [[10, 20, 2], [140, 200, 40], [500, 1000, 200]]) {
            const product = CreatePrimaryProduct ({ ...DefaultProductDraft ('pouch'), widthMm, heightMm, depthMm }); const mesh = product.components[0]; const edges = new Map (); let volume = 0;
            const vertex = i => mesh.positions.slice (3 * i, 3 * i + 3);
            const key = i => vertex (i).map (v => Math.round (v * 1e7)).join (',');
            for (let i = 0; i < mesh.indices.length; i += 3) {
                const ids = mesh.indices.slice (i, i + 3), [a, b, c] = ids.map (vertex);
                const ab = b.map ((n, j) => n - a[j]), ac = c.map ((n, j) => n - a[j]);
                const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
                assert.ok (Math.hypot (...cross) > 1e-8); const normal = mesh.normals.slice (ids[0] * 3, ids[0] * 3 + 3);
                assert.ok (cross.reduce ((sum, n, j) => sum + n * normal[j], 0) > 0);
                volume += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
                for (let j = 0; j < 3; j++) { const e = [key (ids[j]), key (ids[(j + 1) % 3])].sort ().join ('/'); edges.set (e, (edges.get (e) || 0) + 1); }
            }
            assert.ok (volume > 0); assert.ok ([...edges.values ()].every (n => n === 2));
            for (let axis = 0; axis < 3; axis++) { const values = mesh.positions.filter ((_, i) => i % 3 === axis); assert.ok (Math.abs (Math.min (...values) - product.bounds.min[axis]) < 0.01); assert.ok (Math.abs (Math.max (...values) - product.bounds.max[axis]) < 0.01); }
            assert.deepEqual (product.artworkZones.map (z => z.id), ['front', 'back']); assert.equal (product.quality.simulatedFill, false);
        }
    });
    it ('validates filled dimensions and keeps family switching atomic', function () {
        const pouch = DefaultProductDraft ('pouch'); assert.throws (() => CreatePrimaryProduct ({ ...pouch, depthMm : 150 }));
        assert.throws (() => CreatePrimaryProduct ({ ...pouch, material : 'glass' }));
        assert.throws (() => CreatePrimaryProduct ({ ...pouch, labelZone : 'wrap' }));
    });
});
