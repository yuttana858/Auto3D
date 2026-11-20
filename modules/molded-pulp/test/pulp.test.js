import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { MoldedPulpVersion, DefaultPulpDraft, UpdatePulpDraft, PulpTypes, PulpTypeList } from '../src/state.js';
import { SenseBounds, SheetRect, BottomHeightfield } from '../src/surface.js';
import { DetailGrid } from '../src/field.js';
import { PlanSheet, PlanTray, FormShell } from '../src/plan.js';
import { SlopeLimit, MinFilterOctagon } from '../src/field.js';
import { AdaptiveShellMesh } from '../src/rtin.js';
import { PlanFeatures, PulpRuleList } from '../src/rules.js';
import { HandlePulpJob } from '../src/worker.js';
import { PulpDetail } from '../src/state.js';
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
        const check = MeshChecks (grown.components[0]); assert.equal (check.open, 0); assert.ok (Math.abs (check.volume - (grown.rect.lengthMm * grown.rect.widthMm - (4 - Math.PI) * grown.metrics.cornerRadiusMm ** 2) * draft.thicknessMm) < 1);
    });
    it ('rasterizes the lowest product surface, including a curved underside', () => {
        const triangles = Dome (), bounds = SenseBounds (triangles), rect = SheetRect (bounds, { extraLengthMm : 20, extraWidthMm : 20 });
        const grid = DetailGrid (rect, { resolutionMm : 2, thicknessMm : 2 }), field = BottomHeightfield (triangles, grid, rect.baseY);
        const at = (x, z) => field[Math.round ((z - grid.z0) / grid.dz) * grid.nx + Math.round ((x - grid.x0) / grid.dx)];
        assert.ok (Math.abs (at (0, 0)) < 0.2); assert.ok (Math.abs (at (30, 0) - 5) < 0.6); assert.equal (at (-69, -69), Infinity);
    });
    it ('rejects empty or invalid geometry', () => {
        assert.throws (() => SenseBounds (new Float32Array ())); assert.throws (() => SenseBounds (Float32Array.from ([0, 0, 0, 1, 0, 0, NaN, 0, 1])));
        assert.throws (() => SenseBounds (Float32Array.from ([0, 0, 0, 0, 1, 0, 0, 2, 0])), /footprint/);
    });
});

const at = (shell, values, x, z) => { const g = shell.grid; return values[Math.round ((z - g.z0) / g.dz) * g.nx + Math.round ((x - g.x0) / g.dx)]; };

describe ('Molded Pulp tray forming', function () {
    this.timeout (60000);
    const draft = UpdatePulpDraft (DefaultPulpDraft ('type2'), { formDepthMm : 30, extraLengthMm : 40, extraWidthMm : 40, resolutionMm : 1, ribs : 'off', lugs : 'off' });
    const shell = FormShell (SixPack (), draft, { keepSurfaces : true }), plan = PlanTray (SixPack (), draft), component = plan.components[0];
    it ('forms one pocket per can, pulled up to the form depth', () => {
        assert.equal (plan.metrics.pocketCount, 6); assert.equal (plan.metrics.productIslands, 6); assert.equal (plan.metrics.achievedDepthMm, 30); assert.equal (plan.metrics.overallHeightMm, 33);
        const ys = component.positions.filter ((v, i) => i % 3 === 1); assert.ok (Math.abs (Math.max (...ys) - 30) < 1e-4); assert.ok (Math.abs (Math.min (...ys) + 3) < 1e-3);
    });
    it ('keeps the pocket floor on the product base and opens pockets with draft', () => {
        const top = shell.surfaces.top, g = shell.grid;
        assert.ok (Math.abs (at (shell, top, 0, 0)) < 1e-6, 'can centre rests on the pocket floor'); assert.ok (at (shell, top, 33 + 0.6, 0) < 0.6, 'clearance keeps the pocket wider than the can');
        let maxSlope = 0; for (let j = 1; j < g.nz - 1; j++) { for (let i = 1; i < g.nx - 1; i++) { const k = j * g.nx + i; maxSlope = Math.max (maxSlope, Math.abs (top[k + 1] - top[k]) / g.dx, Math.abs (top[k + g.nx] - top[k]) / g.dz); } }
        assert.ok (maxSlope <= 1 / Math.tan (draft.draftDeg * Math.PI / 180) * 1.02, 'no wall is steeper than the draft allows: ' + maxSlope);
    });
    it ('produces a closed, outward-facing adaptive shell whose volume matches the estimate', () => {
        const check = MeshChecks (component); assert.equal (check.open, 0); assert.ok (check.volume > 0);
        assert.ok (Math.abs (check.volume / 1000 - plan.metrics.volumeCm3) / plan.metrics.volumeCm3 < 0.03, check.volume / 1000 + ' vs ' + plan.metrics.volumeCm3);
        assert.ok (plan.metrics.triangles < plan.metrics.fullGridTriangles / 3, 'flat plateau and floors are simplified: ' + plan.metrics.triangles + ' of ' + plan.metrics.fullGridTriangles);
    });
    it ('keeps full wall thickness on steep walls (normal offset, not vertical)', () => {
        const { top, bottom } = shell.surfaces, g = shell.grid; let thinnest = Infinity, steep = 0;
        for (let j = 6; j < g.nz - 6; j += 3) {
            for (let i = 6; i < g.nx - 6; i += 3) {
                const k = j * g.nx + i; if (Math.abs (top[k + 1] - top[k]) > g.dx * 2) { steep++; }
                let best = Infinity; for (let b = -6; b <= 6; b++) { for (let a = -6; a <= 6; a++) { const q = k + b * g.nx + a; best = Math.min (best, Math.hypot (a * g.dx, bottom[q] - top[k], b * g.dz)); } }
                thinnest = Math.min (thinnest, best);
            }
        }
        assert.ok (steep > 20); assert.ok (thinnest > 3 * 0.8, 'outer surface stays near the nominal 3 mm: ' + thinnest);
    });
    it ('flags DFM issues from the knowledge-base rules', () => {
        const ids = plan => plan.checks.map (c => c.id);
        assert.ok (!ids (plan).includes ('MP-R1'), '20 mm gaps leave ribs wider than 8 mm');
        assert.ok (ids (PlanTray (SixPack (10), draft)).includes ('MP-R1'));
        const merged = PlanTray (SixPack (2), draft); assert.ok (ids (merged).includes ('MP-R2')); assert.equal (merged.metrics.productIslands, 6);
        assert.ok (ids (PlanTray (SixPack (), UpdatePulpDraft (draft, { extraLengthMm : 2, extraWidthMm : 2 }))).includes ('MP-M1'));
        const deep = PlanTray (SixPack (), UpdatePulpDraft (draft, { formDepthMm : 100, extraLengthMm : 60, extraWidthMm : 60 })); assert.ok (ids (deep).includes ('MP-H1')); assert.ok (ids (deep).includes ('MP-H2'));
        assert.ok (ids (PlanTray (SixPack (), UpdatePulpDraft (draft, { thicknessMm : 0.8 }))).includes ('MP-T1'));
        assert.ok (ids (PlanTray (SixPack (), UpdatePulpDraft (draft, { draftDeg : 0 }))).includes ('MP-D0'));
    });
    it ('conforms to a curved underside', () => {
        const toilet = PlanTray (Dome (), UpdatePulpDraft (DefaultPulpDraft ('type1'), { formDepthMm : 25, extraLengthMm : 60, extraWidthMm : 60, ribs : 'off', lugs : 'off' }));
        assert.equal (toilet.metrics.pocketCount, 1); assert.equal (toilet.metrics.achievedDepthMm, 25); assert.equal (MeshChecks (toilet.components[0]).open, 0);
    });
});

describe ('Molded Pulp numerical core', function () {
    this.timeout (60000);
    it ('limits slope isotropically (fast marching, not an octagonal chamfer)', () => {
        const n = 201, grid = { nx : n, nz : n, dx : 0.5, dz : 0.5 }, values = new Float32Array (n * n).fill (100); values[100 * n + 100] = 0;
        const out = SlopeLimit (values, grid, 2);
        for (const angle of [0, 22.5, 45, 67.5]) { const r = 40, a = angle * Math.PI / 180, i = Math.round (100 + Math.cos (a) * r / 0.5), j = Math.round (100 + Math.sin (a) * r / 0.5), d = Math.hypot ((i - 100) * 0.5, (j - 100) * 0.5); assert.ok (Math.abs (out[j * n + i] / (2 * d) - 1) < 0.04, angle + '°: ' + out[j * n + i] / (2 * d)); }
    });
    it ('approximates a disc with the linear-time octagon clearance filter', () => {
        const n = 101, grid = { nx : n, nz : n, dx : 1, dz : 1 }, values = new Float32Array (n * n).fill (10); values[50 * n + 50] = 0;
        const out = MinFilterOctagon (values, grid, 10);
        assert.equal (out[50 * n + 59], 0); assert.equal (out[59 * n + 50], 0); assert.equal (out[50 * n + 62], 10); assert.equal (out[58 * n + 58], 10, 'outside the octagon corner (11.3 mm)'); assert.equal (out[56 * n + 56], 0);
    });
    it ('meshes adaptively within tolerance and stays watertight', () => {
        const n = 129, grid = { nx : n, nz : n, dx : 1, dz : 1, x0 : 0, z0 : 0 }, top = new Float32Array (n * n), bottom = new Float32Array (n * n);
        for (let j = 0; j < n; j++) { for (let i = 0; i < n; i++) { const k = j * n + i, r = Math.hypot (i - 64, j - 64); top[k] = i === 0 || j === 0 || i === n - 1 || j === n - 1 ? 0 : Math.min (20, Math.max (0, r - 20)); bottom[k] = top[k] - 2; } }
        const mesh = AdaptiveShellMesh (grid, { top, bottom }, [64, 0, 64], 'test', 0.05), check = MeshChecks (mesh);
        assert.equal (check.open, 0); assert.ok (check.volume > 0); assert.ok (mesh.triangleCount < mesh.gridTriangles / 2);
    });
    it ('sizes grids by detail tier and keeps ultra bounded', () => {
        const rect = SheetRect (SenseBounds (SixPack ()), DefaultPulpDraft ());
        const sides = Object.keys (PulpDetail).map (d => DetailGrid (rect, { ...DefaultPulpDraft (), detail : d }, d).n);
        assert.deepEqual (sides, [257, 513, 1025, 2049].map ((max, i) => Math.min (max, sides[i]))); assert.ok (sides[3] <= 2049 && sides[0] < sides[2]);
        assert.ok (DetailGrid (rect, DefaultPulpDraft (), 'fine').cell <= 0.5);
    });
});

describe ('Molded Pulp feature rule base', function () {
    this.timeout (60000);
    const base = UpdatePulpDraft (DefaultPulpDraft ('type2'), { formDepthMm : 30, extraLengthMm : 80, extraWidthMm : 80 });
    it ('publishes every rule with its knowledge-base basis', () => {
        const rules = PulpRuleList (); assert.ok (rules.length >= 8); for (const r of rules) { assert.match (r.basis, /MP knowledge base/); assert.ok (['parameter', 'placement', 'check'].includes (r.kind)); }
    });
    it ('places ribs only where the land between pockets allows 8 mm each side, and four symmetric lugs', () => {
        const wide = PlanTray (SixPack (60), base).features, narrow = PlanTray (SixPack (20), base).features;
        assert.ok (wide.ribs.some (r => r.rule === 'RIB-BETWEEN'), 'wide gaps get ribs'); assert.ok (!narrow.ribs.some (r => r.rule === 'RIB-BETWEEN'), '20 mm gaps are too narrow');
        assert.match (narrow.trace.find (t => t.rule === 'RIB-BETWEEN').decision, /no rib/);
        assert.deepEqual (wide.lugs.map (l => l.side).sort (), ['+X', '+Z', '−X', '−Z'].sort ()); assert.ok (wide.lugs.every (l => l.nodes > 0));
        const rib = wide.rib; assert.ok (rib.floorWidthMm >= 3 * base.thicknessMm && rib.depthMm >= 3 && rib.depthMm <= 15);
        assert.ok (wide.nesting.pitchMm > 0 && wide.trace.length === PulpRuleList ().length);
    });
    it ('cuts hollow ribs into the plateau and thickens the wall at lugs, keeping the shell closed', () => {
        const draft = UpdatePulpDraft (base, { resolutionMm : 1 }), plan = FormShell (SixPack (60), draft, { keepSurfaces : true }), rib = plan.features.ribs.find (r => r.rule === 'RIB-BETWEEN');
        const mx = (rib.x0 + rib.x1) / 2, mz = (rib.z0 + rib.z1) / 2, top = plan.surfaces.top, bottom = plan.surfaces.bottom;
        assert.ok (Math.abs (at (plan, top, mx, mz) - (plan.metrics.achievedDepthMm - rib.depthMm)) < 0.6, 'rib floor at plateau − depth');
        assert.ok (at (plan, top, mx, mz) - at (plan, bottom, mx, mz) < draft.thicknessMm + 0.6, 'the rib is a hollow fold, not solid');
        const lug = plan.features.lugs[0]; assert.ok (lug.nodes > 0);
        assert.equal (MeshChecks (plan.component).open, 0); assert.ok (plan.metrics.ribCount >= 1 && plan.metrics.lugCount === 4);
    });
    it ('honours overrides and turns features off', () => {
        const off = PlanTray (SixPack (60), UpdatePulpDraft (base, { ribs : 'off', lugs : 'off' })).features; assert.equal (off.ribs.length + off.lugs.length, 0);
        const custom = PlanTray (SixPack (60), UpdatePulpDraft (base, { ribDepthMm : 5, ribWidthMm : 9 })).features; assert.equal (custom.rib.depthMm, 5); assert.equal (custom.rib.floorWidthMm, 9);
        assert.ok (PlanFeatures ({ draft : UpdatePulpDraft (base, { draftDeg : 2 }), depthMm : 30, slope : 28, rect : { x0 : 0, x1 : 200, z0 : 0, z1 : 150, lengthMm : 200, widthMm : 150 }, pockets : [], skirtRunMm : 1 }).warnings.some (w => w.id === 'MP-N1'));
    });
});

describe ('Molded Pulp clamshells, detail and worker', function () {
    this.timeout (120000);
    const base = UpdatePulpDraft (DefaultPulpDraft ('type3dry'), { extraLengthMm : 40, extraWidthMm : 40, resolutionMm : 1.5, ribs : 'off' });
    it ('encapsulates top and bottom with flanges meeting at the parting plane and a hinge', () => {
        const plan = PlanTray (SixPack (), UpdatePulpDraft (base, { clamshell : 'top-bottom', partingFraction : 0.5 }));
        assert.deepEqual (plan.components.map (c => c.id), ['pulp-shell-a', 'pulp-hinge', 'pulp-shell-b']);
        const ys = id => plan.components.find (c => c.id === id).positions.filter ((v, i) => i % 3 === 1);
        assert.ok (Math.abs (Math.max (...ys ('pulp-shell-a')) - 61) < 0.05, 'base flange at the parting plane'); assert.ok (Math.abs (Math.min (...ys ('pulp-shell-b')) - 61) < 0.05, 'lid flange at the parting plane');
        assert.ok (Math.max (...ys ('pulp-shell-b')) > 122, 'lid covers the can tops');
        for (const c of plan.components) { const check = MeshChecks (c); assert.equal (check.open, 0, c.id); assert.ok (check.volume > 0, c.id + ' faces outward'); }
        assert.equal (plan.metrics.shells.length, 2); assert.equal (plan.metrics.pocketCount, 12);
        const hinge = plan.components.find (c => c.id === 'pulp-hinge'), hx = hinge.positions.filter ((v, i) => i % 3 === 0);
        assert.ok (Math.max (...hx) - Math.min (...hx) > 270, 'the hinge runs along the long (X) flange edge');
    });
    it ('splits side to side across X', () => {
        const plan = PlanTray (SixPack (), UpdatePulpDraft (base, { clamshell : 'side-x', hinge : false }));
        assert.deepEqual (plan.components.map (c => c.id), ['pulp-shell-a', 'pulp-shell-b']);
        const xs = id => plan.components.find (c => c.id === id).positions.filter ((v, i) => i % 3 === 0), mid = (plan.bounds.min[0] + plan.bounds.max[0]) / 2 - plan.origin[0];
        assert.ok (Math.abs (Math.max (...xs ('pulp-shell-a')) - mid) < 0.05); assert.ok (Math.abs (Math.min (...xs ('pulp-shell-b')) - mid) < 0.05);
        for (const c of plan.components) { assert.equal (MeshChecks (c).open, 0, c.id); }
    });
    it ('places a sheet per shell for clamshell sheets', () => {
        const sheet = PlanSheet (SixPack (), UpdatePulpDraft (base, { clamshell : 'top-bottom' })); assert.equal (sheet.components.length, 2);
        const ys = sheet.components[1].positions.filter ((v, i) => i % 3 === 1); assert.ok (Math.min (...ys) >= 122 - 1e-4, 'lid sheet sits on the product tops');
    });
    it ('forms at fine detail within budget and transfers results from the worker handler', () => {
        const started = Date.now (), { message, transfer } = HandlePulpJob ({ id : 7, stage : 'tray', triangles : SixPack (), draft : UpdatePulpDraft (base, { resolutionMm : null, detail : 'fine' }), detail : 'fine' });
        assert.equal (message.id, 7); assert.equal (message.plan.metrics.pocketCount, 6); assert.ok (message.plan.metrics.cellMm <= 0.5); assert.equal (transfer.length, 4 + 6, 'mesh buffers plus the NURBS faces (points and knots of top and bottom)'); assert.ok (transfer.includes (message.plan.nurbs.shells[0].top.points.buffer));
        assert.ok (Date.now () - started < 30000, 'fine detail stays interactive in a worker: ' + (Date.now () - started) + ' ms');
    });
    it ('still validates drafts saved by 0.1.0', () => {
        const legacy = { pulpType : 'type2', thicknessMm : 3, extraLengthMm : 20, extraWidthMm : 20, formDepthMm : 30, clearanceMm : 1, draftDeg : 4, resolutionMm : null, color : '#a79c89' };
        const definition = ValidatePulpDefinition ({ schemaVersion : 1, module : 'molded-pulp', moduleVersion : '0.1.0', stage : 'tray', productIds : ['a'], draft : legacy });
        assert.equal (definition.draft.detail, 'standard'); assert.equal (definition.draft.clamshell, 'none'); assert.equal (definition.moduleVersion, '0.1.0');
    });
});

describe ('Molded Pulp edge and corner radii', () => {
    it ('defaults both radii to 0.25 in, validates them and checks them against the knowledge base', async () => {
        const { DefaultPulpDraft, UpdatePulpDraft, DefaultRadiusMm } = await import ('../src/state.js');
        const { PulpChecks, SmoothSurfaceRadii } = await import ('../src/plan.js');
        const draft = DefaultPulpDraft ('type2');
        assert.equal (DefaultRadiusMm, 6.35); assert.equal (draft.edgeRadiusMm, 6.35); assert.equal (draft.cornerRadiusMm, 6.35);
        assert.equal (UpdatePulpDraft (draft, { edgeRadiusMm : 12.7, cornerRadiusMm : 10 }).edgeRadiusMm, 12.7);
        assert.throws (() => UpdatePulpDraft (draft, { edgeRadiusMm : 0.2 }), /Edge radius must be 0.5–50 mm/);
        assert.throws (() => UpdatePulpDraft (draft, { cornerRadiusMm : 60 }), /Corner radius must be 0.5–50 mm/);
        // Drafts saved before the radii existed take the defaults.
        const { edgeRadiusMm, cornerRadiusMm, ...legacy } = draft; void edgeRadiusMm; void cornerRadiusMm;
        assert.equal (UpdatePulpDraft (legacy, {}).cornerRadiusMm, 6.35);
        const bounds = { size : [200, 100, 120] }, rect = {}, ids = d => PulpChecks (d, bounds, rect).map (c => c.id);
        assert.ok (!ids ({ ...draft, formDepthMm : 35 }).some (id => /^MP-RD/.test (id)), 'the defaults pass');
        assert.ok (ids ({ ...draft, edgeRadiusMm : 2 }).includes ('MP-RD1'), 'edges below 3 mm');
        assert.ok (ids ({ ...draft, pulpType : 'type1', thicknessMm : 6, edgeRadiusMm : 5 }).includes ('MP-RD1'), 'Type 1 edges below the wall');
        assert.ok (ids ({ ...draft, formDepthMm : 35, cornerRadiusMm : 4 }).includes ('MP-RD2') && !ids ({ ...draft, formDepthMm : 25, cornerRadiusMm : 4 }).includes ('MP-RD2'), 'corners below 6 mm only past 30 mm deep');
        assert.ok (ids ({ ...draft, edgeRadiusMm : 3 }).includes ('MP-RD3'), 'tool-side edges sharp when the radius is not above the wall');
        assert.deepEqual (SmoothSurfaceRadii ({ ...draft, edgeRadiusMm : 8, cornerRadiusMm : 12 }), { floorFilletMm : 8, rimFilletMm : 8, skirtCornerMm : 12 });
    });
});

describe ('Molded Pulp rounded sheet corners', () => {
    it ('rounds the flat sheet by the corner radius in the display mesh and as an exact STEP solid', async () => {
        const { WriteSolidStep } = await import ('../src/nurbs/step.js');
        const box = [], add = (x, y, z) => box.push (x, y, z);
        for (const [x, z] of [[0, 0], [100, 0], [100, 60], [0, 60]]) { add (x, 0, z); add (x, 40, z); add (x, 40, z); }
        const triangles = Float32Array.from (box), draft = { ...DefaultPulpDraft ('type2'), cornerRadiusMm : 10 }, plan = PlanSheet (triangles, draft);
        assert.equal (plan.metrics.cornerRadiusMm, 10); assert.equal (plan.nurbs.solids.length, 1);
        const solid = plan.nurbs.solids[0]; assert.equal (solid.faces.length, 10); assert.equal (solid.faces.filter (f => f.name === 'Sheet corner').length, 4);
        // Every edge used once in each direction: a closed solid.
        const uses = solid.edges.map (() => [0, 0]); for (const f of solid.faces) { for (const b of f.bounds) { for (const [e, fw] of b.loop) { uses[e][fw ? 0 : 1]++; } } }
        assert.ok (uses.every (([f, r]) => f === 1 && r === 1));
        const L = plan.metrics.lengthMm, W = plan.metrics.widthMm, area = L * W - (4 - Math.PI) * 100;
        assert.ok (Math.abs (plan.metrics.volumeCm3 - area * 3 / 1000) < 0.06);
        const mesh = plan.components[0]; let volume = 0;
        for (let t = 0; t < mesh.indices.length; t += 3) { const [a, b, c] = [0, 1, 2].map (k => [0, 1, 2].map (x => mesh.positions[mesh.indices[t + k] * 3 + x])); volume += (a[0] * (b[1] * c[2] - c[1] * b[2]) - b[0] * (a[1] * c[2] - c[1] * a[2]) + c[0] * (a[1] * b[2] - b[1] * a[2])) / 6; }
        assert.ok (Math.abs (volume - area * 3) < 0.002 * area * 3, volume + ' vs ' + area * 3);
        const text = WriteSolidStep (plan.nurbs.solids, { name : 'Sheet', timestamp : '2026-11-20T00:00:00' });
        assert.match (text, /MANIFOLD_SOLID_BREP\('Sheet',#\d+\)/); assert.match (text, /CLOSED_SHELL/); assert.equal ((text.match (/ADVANCED_FACE\(/g) || []).length, 10);
        // A very small sheet clamps the radius below half its shorter side.
        assert.ok (PlanSheet (triangles, { ...draft, cornerRadiusMm : 50, extraLengthMm : 0, extraWidthMm : 0 }).metrics.cornerRadiusMm < 30);
    });
});
