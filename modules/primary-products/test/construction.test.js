import assert from 'node:assert/strict';
import * as primary from '../src/index.js';

const near = (a, b, message) => assert.ok (Math.abs (a - b) < 1e-5, message || `${a} differs from ${b}`);
const vertex = (mesh, index) => mesh.positions.slice (index * 3, index * 3 + 3);
const weldKey = point => point.map (value => Math.round (value * 1e6)).join (',');

// Welding is only for topology inspection: render meshes retain their UV seams and hard edges.
function inspectShell (mesh)
{
    const edges = new Map (), graph = new Map (); let volume = 0;
    assert.equal (mesh.positions.length, mesh.normals.length);
    assert.equal (mesh.uvs.length, mesh.positions.length / 3 * 2);
    assert.ok ([...mesh.positions, ...mesh.normals, ...mesh.uvs].every (Number.isFinite));
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const ids = mesh.indices.slice (i, i + 3), points = ids.map (id => vertex (mesh, id)), [a, b, c] = points;
        const ab = b.map ((value, axis) => value - a[axis]), ac = c.map ((value, axis) => value - a[axis]);
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        assert.ok (Math.hypot (...normal) > 1e-8, mesh.id + ' has a degenerate face');
        for (const id of ids) {
            const rendered = mesh.normals.slice (id * 3, id * 3 + 3);
            assert.ok (normal.reduce ((sum, value, axis) => sum + value * rendered[axis], 0) > 0, mesh.id + ' has a reversed render normal');
        }
        volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
        const keys = points.map (weldKey);
        for (let j = 0; j < 3; j++) {
            const from = keys[j], to = keys[(j + 1) % 3], edge = [from, to].sort ().join ('/');
            const values = edges.get (edge) || []; values.push ([from, to]); edges.set (edge, values);
            if (!graph.has (from)) { graph.set (from, new Set ()); }
            graph.get (from).add (to);
        }
    }
    assert.ok (volume > 0, mesh.id + ' must bound positive solid volume');
    for (const values of edges.values ()) {
        assert.equal (values.length, 2, mesh.id + ' must be watertight');
        assert.deepEqual (values[0], [...values[1]].reverse (), mesh.id + ' must have coherent winding');
    }
    const pending = [graph.keys ().next ().value], seen = new Set ();
    while (pending.length) { const key = pending.pop (); if (!seen.has (key)) { seen.add (key); pending.push (...graph.get (key)); } }
    assert.equal (seen.size, graph.size, mesh.id + ' outer and inner walls must join into one shell');
    return volume;
}

function radiiAtHeight (mesh, height)
{
    const radii = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const points = mesh.indices.slice (i, i + 3).map (id => vertex (mesh, id));
        for (let j = 0; j < 3; j++) {
            const a = points[j], b = points[(j + 1) % 3];
            if ((a[1] < height && b[1] >= height) || (b[1] < height && a[1] >= height)) {
                const t = (height - a[1]) / (b[1] - a[1]), x = a[0] + t * (b[0] - a[0]), z = a[2] + t * (b[2] - a[2]);
                // Polygon cross sections interpolate inside the circumscribed circle. Vertices on +X give exact radii.
                if (Math.abs (z) < 1e-7 && x > 0) { radii.push (x); }
            }
        }
    }
    return radii;
}

describe ('Glass bottle construction', () => {
    it ('defaults new bottles to glass and preserves explicit legacy materials and dimensions', () => {
        const fresh = primary.DefaultProductDraft ('bottle');
        assert.equal (fresh.material, 'glass');
        assert.equal (fresh.color, '#ffffff');
        assert.equal (primary.ProductMaterials[fresh.material].transmission, 1);
        const legacy = { family : 'bottle', material : 'plastic', heightMm : 190, diameterMm : 65, color : '#e8eceb', roughness : .45, labelZone : 'front' };
        const saved = { schemaVersion : 1, generatorVersion : 1, units : 'mm', draft : legacy };
        assert.deepEqual (primary.ValidateProductDefinition (saved).draft, legacy);
        assert.equal (primary.CreatePrimaryProduct (legacy).definition.material, 'plastic');
        assert.deepEqual (saved.draft, legacy);
    });

    it ('makes preset wall and base dimensions measurable while preserving the outside envelope', () => {
        const volumes = [];
        for (const id of ['lightweight', 'standard', 'heavy']) {
            const preset = primary.GlassThicknessPresets[id];
            const draft = primary.ProfileChanges (primary.DefaultProductDraft (), { glassPreset : id });
            const product = primary.CreatePrimaryProduct (draft), body = product.components.find (mesh => mesh.id === 'body');
            assert.equal (draft.details.glassPreset, id);
            near (product.quality.wallMm, preset.wallMm);
            near (product.quality.baseMm, preset.baseMm);
            assert.equal (product.quality.cavity, 'open-mouth-shell');
            assert.equal (product.quality.construction, 'formed-glass-presentation');
            volumes.push (inspectShell (body));
            const radii = radiiAtHeight (body, draft.heightMm * .4);
            assert.ok (radii.length >= 2);
            near (Math.max (...radii), draft.diameterMm / 2);
            near (Math.max (...radii) - Math.min (...radii), preset.wallMm);
            const centers = [];
            for (let i = 0; i < body.positions.length; i += 3) { if (Math.hypot (body.positions[i], body.positions[i + 2]) < 1e-7) { centers.push (body.positions[i + 1]); } }
            near (Math.min (...centers), 0);
            near (Math.max (...centers), preset.baseMm, 'The interior floor must follow the selected base thickness');
            assert.deepEqual (product.bounds, { min : [-32.5, 0, -32.5], max : [32.5, 190, 32.5] });
        }
        assert.ok (volumes[0] < volumes[1] && volumes[1] < volumes[2], 'Thicker walls must add actual solid volume');
    });

    it ('joins the mouth lip to physical inner neck walls without a glass disk across the opening', () => {
        const draft = primary.ProfileChanges (primary.DefaultProductDraft (), { glassPreset : 'standard' });
        const product = primary.CreatePrimaryProduct (draft), body = product.components.find (mesh => mesh.id === 'body');
        const cap = primary.BottleCap (draft), shape = primary.BottleShape (draft);
        const mouthHeight = Math.max (...body.positions.filter ((value, i) => i % 3 === 1));
        assert.ok (mouthHeight > cap.bottomMm && mouthHeight < draft.heightMm, 'The neck must extend inside the closure');
        const neck = radiiAtHeight (body, cap.bottomMm - shape.neckHeightMm * .4);
        near (Math.max (...neck), shape.neckDiameterMm / 2);
        near (Math.max (...neck) - Math.min (...neck), product.quality.wallMm);
        for (let i = 0; i < body.indices.length; i += 3) {
            const triangle = body.indices.slice (i, i + 3).map (id => vertex (body, id));
            if (triangle.every (point => Math.abs (point[1] - mouthHeight) < 1e-7)) {
                assert.ok (triangle.every (point => Math.hypot (point[0], point[2]) > shape.neckDiameterMm / 2 - product.quality.wallMm - 1e-5));
            }
        }
    });

    it ('keeps non-round glass shells closed, connected and inside the requested body dimensions', () => {
        for (const bottleSection of [{ shape : 'oval', depthMm : 45 }, { shape : 'rectangle', depthMm : 50, cornerRadiusMm : 10 }]) {
            const draft = primary.UpdateProductDraft (primary.DefaultProductDraft (), { diameterMm : 80, bottleSection, details : { glassPreset : 'standard' } });
            const product = primary.CreatePrimaryProduct (draft), body = product.components.find (mesh => mesh.id === 'body');
            inspectShell (body);
            for (let i = 0; i < body.positions.length; i++) { assert.ok (body.positions[i] >= product.bounds.min[i % 3] - 1e-7 && body.positions[i] <= product.bounds.max[i % 3] + 1e-7); }
            const xs = body.positions.filter ((value, i) => i % 3 === 0), zs = body.positions.filter ((value, i) => i % 3 === 2);
            near (Math.max (...xs) - Math.min (...xs), 80);
            near (Math.max (...zs) - Math.min (...zs), bottleSection.depthMm);
        }
    });

    it ('keeps tight rectangle corners and slender oval floors convex rather than folding their offsets', () => {
        for (const [diameterMm, bottleSection] of [[80, { shape : 'rectangle', depthMm : 50, cornerRadiusMm : 1 }], [500, { shape : 'oval', depthMm : 10 }]]) {
            const draft = primary.ProfileChanges (primary.UpdateProductDraft (primary.DefaultProductDraft (), { diameterMm, bottleSection }), { glassPreset : 'heavy' });
            const product = primary.CreatePrimaryProduct (draft, { segments : 128 }), body = product.components.find (mesh => mesh.id === 'body');
            inspectShell (body);
            for (const height of [0, product.quality.baseMm]) {
                const points = new Map ();
                for (let i = 0; i < body.positions.length; i += 3) {
                    const [x, y, z] = body.positions.slice (i, i + 3);
                    if (Math.abs (y - height) < 1e-7 && Math.hypot (x, z) > 1e-7) { points.set (weldKey ([x, y, z]), [x, z]); }
                }
                const ring = [...points.values ()].sort ((a, b) => Math.atan2 (a[1], a[0]) - Math.atan2 (b[1], b[0]));
                assert.ok (ring.length > 8);
                for (let i = 0; i < ring.length; i++) {
                    const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
                    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
                    assert.ok (cross >= -1e-6, 'A convex bottle section must retain a convex floor after wall and heel offsets');
                }
            }
        }
    });

    it ('keeps very short rounded shoulders from folding the inner profile back into itself', () => {
        for (const diameterMm of [65, 500]) {
            const draft = primary.ProfileChanges (primary.UpdateProductDraft (primary.DefaultProductDraft (), { heightMm : 20, diameterMm }), { glassPreset : 'heavy' });
            const product = primary.CreatePrimaryProduct (draft), body = product.components.find (mesh => mesh.id === 'body');
            inspectShell (body);
            const profile = [], seen = new Set ();
            for (let i = 0; i < body.cavity.positions.length; i += 3) {
                const point = body.cavity.positions.slice (i, i + 3), key = weldKey (point);
                if (point[0] >= 0 && Math.abs (point[2]) < 1e-7 && !seen.has (key)) { seen.add (key); profile.push (point); }
            }
            assert.ok (profile.length > 8);
            for (let i = 1; i < profile.length; i++) { assert.ok (profile[i][1] >= profile[i - 1][1] - 1e-7, 'The inner shoulder must rise continuously toward the mouth'); }
            assert.ok (product.quality.wallMm > 0);
        }
    });

    it ('fills the new physical cavities without crossing the base or mouth', () => {
        for (const bottleSection of [null, { shape : 'oval', depthMm : 45 }, { shape : 'rectangle', depthMm : 50, cornerRadiusMm : 10 }]) {
            const draft = primary.ProfileChanges (primary.UpdateProductDraft (primary.DefaultProductDraft (), { diameterMm : 80, bottleSection }), { glassPreset : 'standard' });
            let previousVolume = 0;
            for (const fillPercent of [0, 50, 100]) {
                const product = primary.CreatePrimaryProduct (primary.UpdateProductDraft (draft, { contents : { type : 'oil', fillPercent } }));
                const fill = product.components.find (mesh => mesh.id === 'contents');
                if (fillPercent === 0) { assert.equal (fill, undefined); continue; }
                const volume = inspectShell (fill), body = product.components.find (mesh => mesh.id === 'body');
                assert.ok (volume > previousVolume); previousVolume = volume;
                const ys = fill.positions.filter ((value, i) => i % 3 === 1), mouth = Math.max (...body.positions.filter ((value, i) => i % 3 === 1));
                assert.ok (Math.min (...ys) >= product.quality.baseMm, 'Contents must sit above the interior floor');
                assert.ok (Math.max (...ys) < mouth, 'Contents must remain below the mouth lip');
                for (const radius of radiiAtHeight (fill, draft.heightMm * .35)) {
                    assert.ok (radius < draft.diameterMm / 2 - product.quality.wallMm, 'Contents must remain inside the glass walls');
                }
            }
        }
    });

    it ('rejects invalid glass and cap fields without mutating the source draft', () => {
        const draft = primary.ProfileChanges (primary.DefaultProductDraft (), { glassPreset : 'standard' }), before = structuredClone (draft);
        for (const changes of [{ glassPreset : 'invalid' }, { wallMm : Infinity }, { baseMm : 0 }, { capWallMm : 0 }, { capWallMm : 1000 }, { capMaterial : 'glass' }, { capColor : 'red' }, { closure : 'invalid' }]) {
            assert.throws (() => primary.ProfileChanges (draft, changes));
            assert.throws (() => primary.UpdateProductDraft (draft, { details : { ...draft.details, ...changes } }));
            assert.deepEqual (draft, before);
        }
        for (const changes of [{ glassPreset : 'standard' }, { baseMm : 4 }, { capWallMm : 1 }, { capMaterial : 'pp' }, { capColor : '#123456' }, { closure : 'smooth' }]) {
            assert.throws (() => primary.ProfileChanges (primary.DefaultProductDraft ('can'), changes));
        }
    });

    it ('turns manual thickness edits into custom construction and retains them on save', () => {
        const presets = structuredClone (primary.GlassThicknessPresets);
        const standard = primary.ProfileChanges (primary.DefaultProductDraft (), { glassPreset : 'standard' });
        const custom = primary.ProfileChanges (standard, { wallMm : 2.5, baseMm : 5.5 });
        assert.equal (custom.details.glassPreset, 'custom');
        assert.equal (custom.details.wallMm, 2.5);
        assert.equal (custom.details.baseMm, 5.5);
        const restored = primary.ValidateProductDefinition (JSON.parse (JSON.stringify (primary.ProductDefinition (custom)))).draft;
        assert.deepEqual (restored, custom);
        assert.deepEqual (primary.GlassThicknessPresets, presets);
        assert.equal (standard.details.wallMm, presets.standard.wallMm);
    });
});

describe ('Adjustable bottle closures', () => {
    it ('changes cap appearance without changing the glass body construction', () => {
        const draft = primary.DefaultProductDraft (), before = primary.CreatePrimaryProduct (draft);
        const next = primary.ProfileChanges (draft, { capMaterial : 'steel', capColor : '#334455' });
        const after = primary.CreatePrimaryProduct (next);
        near (after.quality.wallMm, before.quality.wallMm);
        near (after.quality.baseMm, before.quality.baseMm);
        assert.deepEqual (after.components.find (mesh => mesh.id === 'body').positions, before.components.find (mesh => mesh.id === 'body').positions);
    });

    it ('keeps the cap bore clear of the glass neck when cap thickness changes', () => {
        for (const capWallMm of [.3, 1.2, 3]) {
            const draft = primary.ProfileChanges (primary.DefaultProductDraft (), { capWallMm });
            const product = primary.CreatePrimaryProduct (draft), settings = primary.BottleCap (draft);
            const body = product.components.find (mesh => mesh.id === 'body'), cap = product.components.find (mesh => mesh.id === 'cap');
            const overlapHeight = settings.bottomMm + settings.heightMm * .2;
            const neckRadii = radiiAtHeight (body, overlapHeight), capRadii = radiiAtHeight (cap, overlapHeight);
            assert.ok (neckRadii.length >= 2 && capRadii.length >= 2);
            assert.ok (Math.min (...capRadii) > Math.max (...neckRadii), 'The cap wall must not penetrate the glass neck');
            for (let i = 0; i < cap.positions.length; i++) { assert.ok (cap.positions[i] >= product.bounds.min[i % 3] - 1e-7 && cap.positions[i] <= product.bounds.max[i % 3] + 1e-7); }
        }
    });

    it ('builds hollow beveled caps with a printable flat top and planar top UVs', () => {
        for (const closure of ['smooth', 'ribbed', 'fliptop']) {
            const draft = primary.ProfileChanges (primary.DefaultProductDraft (), { closure, capHeightMm : 24, capWallMm : 1.2, capMaterial : 'aluminum', capColor : '#ab3490' });
            const settings = primary.BottleCap (draft), product = primary.CreatePrimaryProduct (draft), cap = product.components.find (mesh => mesh.id === 'cap');
            inspectShell (cap);
            assert.equal (cap.materialRole, 'closure');
            assert.equal (settings.heightMm, 24);
            assert.equal (settings.wallMm, 1.2);
            assert.equal (settings.material, 'aluminum');
            assert.equal (settings.color, '#ab3490');
            assert.equal (settings.style, closure);
            const ys = cap.positions.filter ((value, i) => i % 3 === 1);
            near (Math.min (...ys), draft.heightMm - 24);
            near (Math.max (...ys), draft.heightMm);
            assert.ok (settings.topRadiusMm > 0 && settings.topRadiusMm < settings.radiusMm);
            let topCount = 0; const centers = [];
            for (let i = 0; i < cap.positions.length; i += 3) {
                const [x, y, z] = cap.positions.slice (i, i + 3);
                if (Math.hypot (x, z) < 1e-7) { centers.push (y); }
                if (Math.abs (y - draft.heightMm) < 1e-7) {
                    const index = i / 3 * 2;
                    near (cap.uvs[index], .5 + x / (2 * settings.topRadiusMm));
                    near (cap.uvs[index + 1], .5 - z / (2 * settings.topRadiusMm));
                    topCount++;
                }
                if (Math.abs (y - settings.bottomMm) < 1e-7) { assert.ok (Math.hypot (x, z) > 0, 'The cap underside must remain open'); }
            }
            assert.ok (topCount > 8, 'The cap must include a flat top surface');
            let topUvArea = 0;
            for (let i = 0; i < cap.indices.length; i += 3) {
                const ids = cap.indices.slice (i, i + 3);
                if (!ids.every (id => Math.abs (cap.positions[id * 3 + 1] - draft.heightMm) < 1e-7)) { continue; }
                const [a, b, c] = ids.map (id => cap.uvs.slice (id * 2, id * 2 + 2));
                const area = Math.abs ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
                assert.ok (area > 1e-8, 'Cap top UV triangles must not collapse into lines');
                topUvArea += area;
            }
            assert.ok (topUvArea > .5, 'Planar UVs must cover the circular cap top');
            near (Math.min (...centers), draft.heightMm - settings.wallMm, 'The cap roof must follow the selected thickness');
            near (Math.max (...centers), draft.heightMm);
        }
    });
});
