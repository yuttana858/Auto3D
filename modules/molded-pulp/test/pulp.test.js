import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { MoldedPulpVersion, DefaultPulpDraft, UpdatePulpDraft, PulpTypes, PulpTypeList } from '../src/state.js';
import { SenseBounds, SheetRect, FormGrid, BottomHeightfield } from '../src/surface.js';
import { PlanSheet, PlanTray } from '../src/plan.js';
import { PulpDefinition, ValidatePulpDefinition } from '../src/definition.js';

// Closed cylinder (a can) standing on y = base, centred at (cx, cz). Returns packed world-mm triangles.
function Cylinder (cx, cz, radius, height, base = 0, segments = 48, out = [])
{
    for (let s = 0; s < segments; s++) {
        const a = s / segments * Math.PI * 2, b = (s + 1) / segments * Math.PI * 2;
        const p = [cx + Math.cos (a) * radius, cz + Math.sin (a) * radius], q = [cx + Math.cos (b) * radius, cz + Math.sin (b) * radius];
        out.push (cx, base, cz, q[0], base, q[1], p[0], base, p[1]);
        out.push (cx, base + height, cz, p[0], base + height, p[1], q[0], base + height, q[1]);
        out.push (p[0], base, p[1], q[0], base, q[1], q[0], base + height, q[1], p[0], base, p[1], q[0], base + height, q[1], p[0], base + height, p[1]);
    }
    return out;
}
// Six 66 mm cans in a 2 × 3 pack with the given gap between cans.
function SixPack (gap = 20)
{
    const out = [], pitch = 66 + gap;
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 2; j++) { Cylinder (i * pitch, j * pitch, 33, 122, 0, 48, out); } }
    return Float32Array.from (out);
}
// Bowl-like underside (toilet base proxy): a downward dome whose lowest point is the base.
function Dome (radius = 60, sag = 20, rings = 24, segments = 48)
{
    const out = [], point = (r, a) => [Math.cos (a) * r, sag * (r / radius) ** 2, Math.sin (a) * r];
    for (let k = 0; k < rings; k++) {
        const r0 = radius * k / rings, r1 = radius * (k + 1) / rings;
        for (let s = 0; s < segments; s++) {
            const a = s / segments * Math.PI * 2, b = (s + 1) / segments * Math.PI * 2;
            out.push (...point (r0, a), ...point (r1, b), ...point (r1, a), ...point (r0, a), ...point (r0, b), ...point (r1, b));
        }
    }
    for (let s = 0; s < segments; s++) { const a = s / segments * Math.PI * 2, b = (s + 1) / segments * Math.PI * 2; out.push (...point (radius, a), ...point (radius, b), radius * Math.cos (b), 150, radius * Math.sin (b)); }
    return Float32Array.from (out);
}

function MeshChecks (component)
{
    const { positions, indices } = component, key = i => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]].map (v => v.toFixed (4)).join (',');
    const edges = new Map (); let volume = 0;
    for (let t = 0; t < indices.length; t += 3) {
        const ids = [indices[t], indices[t + 1], indices[t + 2]], k = ids.map (key);
        for (let e = 0; e < 3; e++) { const a = k[e], b = k[(e + 1) % 3]; if (a === b) { continue; } const name = a + '>' + b; edges.set (name, (edges.get (name) || 0) + 1); }
        const [a, b, c] = ids.map (i => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
        volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    let open = 0;
    for (const [name, count] of edges) { const [a, b] = name.split ('>'); if (count !== 1 || edges.get (b + '>' + a) !== 1) { open++; } }
    return { open, volume };
}

describe ('Molded Pulp draft state', () => {
    it ('keeps the module and package versions aligned', () => { assert.equal (MoldedPulpVersion, JSON.parse (readFileSync (new URL ('../package.json', import.meta.url))).version); });
    it ('offers Type 1, Type 2 and Type 3 wet/dry presets from the knowledge base ranges', () => {
        assert.deepEqual (PulpTypeList ().map (t => t.id), ['type1', 'type2', 'type3wet', 'type3dry']);
        assert.deepEqual (PulpTypes.type1.rangeMm, [5, 10]); assert.deepEqual (PulpTypes.type3wet.rangeMm, [0.7, 1.2]); assert.deepEqual (PulpTypes.type3dry.rangeMm, [1.5, 3]);
        for (const t of PulpTypeList ()) { assert.ok (t.thicknessMm >= t.rangeMm[0] && t.thicknessMm <= t.rangeMm[1]); }
    });
    it ('resets thickness, draft and colour to the new type unless set in the same change', () => {
        const draft = UpdatePulpDraft (DefaultPulpDraft (), { formDepthMm : 45, extraLengthMm : 30 });
        const type1 = UpdatePulpDraft (draft, { pulpType : 'type1' }); assert.equal (type1.thicknessMm, 6); assert.equal (type1.draftDeg, 5); assert.equal (type1.formDepthMm, 45); assert.equal (type1.extraLengthMm, 30);
        assert.equal (UpdatePulpDraft (draft, { pulpType : 'type1', thicknessMm : 8 }).thicknessMm, 8);
    });
    it ('rejects malformed drafts before mutation', () => {
        const draft = DefaultPulpDraft (), original = structuredClone (draft);
        for (const bad of [{ pulpType : 'type9' }, { thicknessMm : 0.1 }, { thicknessMm : NaN }, { formDepthMm : 0 }, { extraLengthMm : -1 }, { draftDeg : 30 }, { clearanceMm : '1' }, { color : 'red' }, { injected : 1 }, null, [1]]) {
            assert.throws (() => UpdatePulpDraft (draft, bad)); assert.deepEqual (draft, original);
        }
    });
    it ('round-trips the stored definition and rejects unknown fields', () => {
        const value = PulpDefinition (DefaultPulpDraft ('type3dry'), 'tray', ['a', 'b']);
        assert.deepEqual (ValidatePulpDefinition (JSON.parse (JSON.stringify (value))), value);
        assert.throws (() => ValidatePulpDefinition ({ ...value, extra : 1 })); assert.throws (() => PulpDefinition (DefaultPulpDraft (), 'cup'));
    });
});

describe ('Molded Pulp surface sensing and sheet', () => {
    it ('senses the grouped footprint of six cans', () => {
        const bounds = SenseBounds (SixPack ());
        assert.ok (Math.abs (bounds.size[0] - (2 * 86 + 66)) < 0.2); assert.ok (Math.abs (bounds.size[2] - (86 + 66)) < 0.2); assert.ok (Math.abs (bounds.size[1] - 122) < 1e-6); assert.equal (bounds.min[1], 0);
    });
    it ('sizes the sheet to the exact footprint plus the additional material, directly under the products', () => {
        const draft = UpdatePulpDraft (DefaultPulpDraft (), { extraLengthMm : 0, extraWidthMm : 0 }), plan = PlanSheet (SixPack (), draft);
        assert.equal (plan.metrics.lengthMm, plan.metrics.footprintLengthMm); assert.equal (plan.metrics.widthMm, plan.metrics.footprintWidthMm);
        const grown = PlanSheet (SixPack (), UpdatePulpDraft (draft, { extraLengthMm : 40, extraWidthMm : 24 }));
        assert.ok (Math.abs (grown.rect.lengthMm - plan.rect.lengthMm - 40) < 1e-6); assert.ok (Math.abs (grown.rect.widthMm - plan.rect.widthMm - 24) < 1e-6);
        assert.equal (grown.origin[1], 0); assert.ok (Math.abs (grown.origin[0] - (plan.bounds.min[0] + plan.bounds.max[0]) / 2) < 1e-6);
        const ys = grown.components[0].positions.filter ((v, i) => i % 3 === 1); assert.equal (Math.max (...ys), 0); assert.equal (Math.min (...ys), -draft.thicknessMm);
        const check = MeshChecks (grown.components[0]); assert.equal (check.open, 0); assert.ok (Math.abs (check.volume - grown.rect.lengthMm * grown.rect.widthMm * draft.thicknessMm) < 1);
    });
    it ('rasterizes the lowest product surface, including a curved underside', () => {
        const triangles = Dome (), bounds = SenseBounds (triangles), rect = SheetRect (bounds, { extraLengthMm : 20, extraWidthMm : 20 });
        const grid = FormGrid (rect, { resolutionMm : 2, thicknessMm : 2 }), field = BottomHeightfield (triangles, grid, rect.baseY);
        const at = (x, z) => field[Math.round ((z - grid.z0) / grid.dz) * grid.nx + Math.round ((x - grid.x0) / grid.dx)];
        assert.ok (Math.abs (at (0, 0)) < 0.2); assert.ok (Math.abs (at (30, 0) - 5) < 0.6); assert.equal (at (-69, -69), Infinity);
    });
    it ('rejects empty or invalid geometry', () => {
        assert.throws (() => SenseBounds (new Float32Array ())); assert.throws (() => SenseBounds (Float32Array.from ([0, 0, 0, 1, 0, 0, NaN, 0, 1])));
        assert.throws (() => SenseBounds (Float32Array.from ([0, 0, 0, 0, 1, 0, 0, 2, 0])), /footprint/);
    });
});

describe ('Molded Pulp tray forming', function () {
    this.timeout (30000);
    const draft = UpdatePulpDraft (DefaultPulpDraft ('type2'), { formDepthMm : 30, extraLengthMm : 40, extraWidthMm : 40, resolutionMm : 1 });
    const plan = PlanTray (SixPack (), draft), top = plan.components[0];
    it ('forms one pocket per can, pulled up to the form depth', () => {
        assert.equal (plan.metrics.pocketCount, 6); assert.equal (plan.metrics.productIslands, 6); assert.equal (plan.metrics.achievedDepthMm, 30); assert.equal (plan.metrics.overallHeightMm, 33);
        const ys = top.positions.filter ((v, i) => i % 3 === 1); assert.ok (Math.abs (Math.max (...ys) - 30) < 1e-4); assert.ok (Math.abs (Math.min (...ys) + 3) < 1e-4);
    });
    it ('keeps the pocket floor on the product base and opens pockets with draft', () => {
        const { positions } = top, origin = plan.origin, n = plan.metrics.gridNodes; let floor = 0, maxSlope = 0;
        const grid = FormGrid (plan.rect, draft), heights = new Float64Array (n);
        for (let k = 0; k < n; k++) { heights[k] = positions[k * 3 + 1]; }
        const at = (x, z) => heights[Math.round ((z - grid.z0) / grid.dz) * grid.nx + Math.round ((x - grid.x0) / grid.dx)];
        floor = at (0, 0); assert.ok (Math.abs (floor) < 1e-6, 'can centre rests on the pocket floor');
        assert.ok (at (33 + 0.6, 0) < 0.6, 'clearance keeps the pocket wider than the can');
        for (let j = 1; j < grid.nz - 1; j++) { for (let i = 1; i < grid.nx - 1; i++) { const k = j * grid.nx + i; maxSlope = Math.max (maxSlope, Math.abs (heights[k + 1] - heights[k]) / grid.dx, Math.abs (heights[k + grid.nx] - heights[k]) / grid.dz); } }
        assert.ok (maxSlope <= 1 / Math.tan (draft.draftDeg * Math.PI / 180) + 1e-6, 'no wall is steeper than the draft allows');
        assert.ok (Math.abs (origin[1]) < 1e-9);
    });
    it ('produces a closed, outward-facing shell whose volume matches the estimate', () => {
        const check = MeshChecks (top); assert.equal (check.open, 0); assert.ok (check.volume > 0);
        assert.ok (Math.abs (check.volume / 1000 - plan.metrics.volumeCm3) / plan.metrics.volumeCm3 < 0.02);
        assert.ok (plan.metrics.estimatedMassG > 0);
    });
    it ('keeps full wall thickness on steep walls (normal offset, not vertical)', () => {
        const thick = PlanTray (SixPack (), UpdatePulpDraft (draft, { draftDeg : 3, thicknessMm : 3 })), grid = FormGrid (thick.rect, thick.draft), p = thick.components[0].positions, n = grid.nx * grid.nz;
        let thinnest = Infinity, steep = 0; const w = 6;
        for (let j = w; j < grid.nz - w; j += 3) {
            for (let i = w; i < grid.nx - w; i += 3) {
                const k = j * grid.nx + i, x = p[k * 3], y = p[k * 3 + 1], z = p[k * 3 + 2]; let best = Infinity;
                if (Math.abs (p[(k + 1) * 3 + 1] - y) > grid.dx * 2) { steep++; }
                for (let b = -w; b <= w; b++) { for (let a = -w; a <= w; a++) { const q = n + k + b * grid.nx + a, d = Math.hypot (p[q * 3] - x, p[q * 3 + 1] - y, p[q * 3 + 2] - z); if (d < best) { best = d; } } }
                thinnest = Math.min (thinnest, best);
            }
        }
        assert.ok (steep > 20, 'the sample includes steep pocket walls');
        assert.ok (thinnest > 3 * 0.8, 'nearest outer-surface node stays near the nominal 3 mm thickness: ' + thinnest);
    });
    it ('flags DFM issues from the knowledge-base rules', () => {
        const ids = plan => plan.checks.map (c => c.id);
        assert.ok (!ids (plan).includes ('MP-R1'), '20 mm gaps leave ribs wider than 8 mm');
        const tight = PlanTray (SixPack (10), draft); assert.ok (ids (tight).includes ('MP-R1'), '10 mm gaps leave ribs under 8 mm');
        const merged = PlanTray (SixPack (2), draft); assert.ok (ids (merged).includes ('MP-R2'), 'touching pockets are reported'); assert.equal (merged.metrics.productIslands, 6);
        const shallow = PlanTray (SixPack (), UpdatePulpDraft (draft, { extraLengthMm : 2, extraWidthMm : 2 })); assert.ok (ids (shallow).includes ('MP-M1'));
        const deep = PlanTray (SixPack (), UpdatePulpDraft (draft, { formDepthMm : 100, extraLengthMm : 60, extraWidthMm : 60 })); assert.ok (ids (deep).includes ('MP-H1')); assert.ok (ids (deep).includes ('MP-H2'));
        const thin = PlanTray (SixPack (), UpdatePulpDraft (draft, { thicknessMm : 0.8 })); assert.ok (ids (thin).includes ('MP-T1'));
        const nodraft = PlanTray (SixPack (), UpdatePulpDraft (draft, { draftDeg : 0 })); assert.ok (ids (nodraft).includes ('MP-D0'));
    });
    it ('conforms to a curved underside and stays bounded in size', () => {
        const toilet = PlanTray (Dome (), UpdatePulpDraft (DefaultPulpDraft ('type1'), { formDepthMm : 25, extraLengthMm : 60, extraWidthMm : 60 }));
        assert.equal (toilet.metrics.pocketCount, 1); assert.equal (toilet.metrics.achievedDepthMm, 25); assert.ok (toilet.metrics.gridNodes <= 360000);
        assert.equal (MeshChecks (toilet.components[0]).open, 0);
    });
});
