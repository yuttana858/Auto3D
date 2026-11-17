// Molded pulp feature rule base: a small declarative "logic base" that turns knowledge-base design guidance into rib and
// denest-lug placements. Each rule has an id, a kind (parameter, placement or check), its knowledge-base basis and a run
// function that reads the shared context, writes decisions into the plan and records a trace entry explaining what it
// decided and why. Values marked "typical industry value" in the knowledge base are defaults, never hard limits; user
// overrides on the draft (ribDepthMm, ribWidthMm, lugStandoffMm, ribs/lugs off) always win and are traced as such.
const KB = {
    ribs : 'MP knowledge base · mp-des-structural-features (ribs and gussets)',
    nesting : 'MP knowledge base · mp-des-structural-features (nesting and denesting)',
    dfm : 'MP knowledge base · mp-des-dfm-rules-by-process-type',
    hinge : 'MP knowledge base · mp-des-structural-features (hinges and clamshells)'
};
const r1 = v => Math.round (v * 10) / 10;
const LandMm = 8;          // minimum land between features (KB: features ≥ 8 mm apart; rib walls ≥ 8 mm apart)
const PanelMm = 100;       // break up flat areas larger than about 100 × 100 mm
const LugLengthMm = 10;    // tangential lug length (typical industry value)

// Groups pocket boxes into columns (along X) or rows (along Z) by overlap of their extents.
function Bands (pockets, lo, hi)
{
    const sorted = [...pockets].sort ((a, b) => a[lo] - b[lo]), bands = [];
    for (const p of sorted) {
        const band = bands.find (b => p[lo] < b[hi] && p[hi] > b[lo]);
        if (band) { band[lo] = Math.min (band[lo], p[lo]); band[hi] = Math.max (band[hi], p[hi]); band.items.push (p); } else { bands.push ({ [lo] : p[lo], [hi] : p[hi], items : [p] }); }
    }
    return bands.sort ((a, b) => a[lo] - b[lo]);
}

export const PulpRuleBase = Object.freeze ([
    { id : 'RIB-ENABLE', kind : 'parameter', title : 'Ribs requested', basis : KB.ribs, run (c, plan) {
        plan.ribsEnabled = c.draft.ribs !== 'off';
        return plan.ribsEnabled ? 'Automatic rib placement is on.' : 'Ribs are off for this draft.';
    } },
    { id : 'RIB-PROFILE', kind : 'parameter', title : 'Rib profile (U corrugation)', basis : KB.ribs, run (c, plan) {
        if (!plan.ribsEnabled) { return 'Skipped: ribs off.'; }
        const t = c.draft.thicknessMm, width = c.draft.ribWidthMm ?? Math.max (3 * t, 6), autoDepth = Math.min (15, Math.max (3, Math.round (c.depthMm * 0.3)));
        const depth = Math.min (c.draft.ribDepthMm ?? autoDepth, c.depthMm - 2 * t);
        if (depth < 1) { plan.ribsEnabled = false; return `Skipped: form depth ${r1 (c.depthMm)} mm leaves no room for a rib below the plateau.`; }
        plan.rib = { floorWidthMm : width, depthMm : depth, openingMm : width + 2 * depth / c.slope };
        return `Floor width ${r1 (width)} mm (${c.draft.ribWidthMm ? 'user' : 'KB: base width ≥ 2–3× wall'}), depth ${r1 (depth)} mm (${c.draft.ribDepthMm ? 'user' : 'KB: 3–15 mm, ~30% of form depth'}), opening ${r1 (plan.rib.openingMm)} mm at ${c.draft.draftDeg}° draft.`;
    } },
    { id : 'RIB-BETWEEN', kind : 'placement', title : 'Ribs in the land between pocket columns and rows', basis : KB.ribs, run (c, plan) {
        if (!plan.ribsEnabled) { return 'Skipped: ribs off.'; }
        const notes = [], need = plan.rib.openingMm + 2 * LandMm;
        for (const [lo, hi, along, alongHi, axis] of [['x0', 'x1', 'z0', 'z1', 'x'], ['z0', 'z1', 'x0', 'x1', 'z']]) {
            const bands = Bands (c.pockets, lo, hi);
            for (let b = 0; b + 1 < bands.length; b++) {
                const gap = bands[b + 1][lo] - bands[b][hi], mid = (bands[b + 1][lo] + bands[b][hi]) / 2;
                if (gap < need) { notes.push (`${axis.toUpperCase ()} gap ${r1 (gap)} mm < ${r1 (need)} mm needed (rib opening + 2 × ${LandMm} mm land): no rib`); continue; }
                const items = [...bands[b].items, ...bands[b + 1].items], from = Math.min (...items.map (p => p[along])), to = Math.max (...items.map (p => p[alongHi]));
                plan.ribs.push (axis === 'x' ? { x0 : mid, z0 : from, x1 : mid, z1 : to, rule : 'RIB-BETWEEN' } : { x0 : from, z0 : mid, x1 : to, z1 : mid, rule : 'RIB-BETWEEN' });
                notes.push (`${axis.toUpperCase ()} gap ${r1 (gap)} mm: rib at ${axis} = ${r1 (mid)} mm`);
            }
        }
        return notes.length ? notes.join ('; ') + '.' : 'Single pocket column and row: no land between pockets.';
    } },
    { id : 'RIB-PANEL', kind : 'placement', title : 'Break up flat margins longer than ~100 mm', basis : KB.ribs, run (c, plan) {
        if (!plan.ribsEnabled) { return 'Skipped: ribs off.'; }
        const notes = [], need = plan.rib.openingMm + 2 * LandMm, run = c.skirtRunMm, rect = c.rect;
        const px0 = c.pockets.length ? Math.min (...c.pockets.map (p => p.x0)) : (rect.x0 + rect.x1) / 2, px1 = c.pockets.length ? Math.max (...c.pockets.map (p => p.x1)) : px0;
        const pz0 = c.pockets.length ? Math.min (...c.pockets.map (p => p.z0)) : (rect.z0 + rect.z1) / 2, pz1 = c.pockets.length ? Math.max (...c.pockets.map (p => p.z1)) : pz0;
        // Margin bands: plateau between the drafted outer wall and the pocket field on each side.
        const bands = [
            { side : '−Z', a : rect.z0 + run, b : pz0, from : rect.x0 + run, to : rect.x1 - run, axis : 'z' }, { side : '+Z', a : pz1, b : rect.z1 - run, from : rect.x0 + run, to : rect.x1 - run, axis : 'z' },
            { side : '−X', a : rect.x0 + run, b : px0, from : rect.z0 + run, to : rect.z1 - run, axis : 'x' }, { side : '+X', a : px1, b : rect.x1 - run, from : rect.z0 + run, to : rect.z1 - run, axis : 'x' }
        ];
        for (const band of bands) {
            const width = band.b - band.a, span = band.to - band.from;
            if (width < need) { continue; }
            if (span <= PanelMm && width <= PanelMm) { notes.push (`${band.side} margin ${r1 (width)} × ${r1 (span)} mm is within ${PanelMm} × ${PanelMm} mm: no rib`); continue; }
            // Ribs run across the band (perpendicular to its bending axis) at ≤ 100 mm pitch, centred so they stay symmetric.
            const count = Math.max (1, Math.ceil (span / PanelMm) - 1), pitch = span / (count + 1), inset = LandMm;
            for (let k = 1; k <= count; k++) {
                const at = band.from + pitch * k;
                plan.ribs.push (band.axis === 'z' ? { x0 : at, z0 : band.a + inset, x1 : at, z1 : band.b - inset, rule : 'RIB-PANEL' } : { x0 : band.a + inset, z0 : at, x1 : band.b - inset, z1 : at, rule : 'RIB-PANEL' });
            }
            notes.push (`${band.side} margin ${r1 (width)} × ${r1 (span)} mm: ${count} cross rib${count === 1 ? '' : 's'} at ${r1 (pitch)} mm pitch`);
        }
        return notes.length ? notes.join ('; ') + '.' : 'No flat margin wide enough for a rib with 8 mm land on both sides.';
    } },
    { id : 'RIB-LENGTH', kind : 'check', title : 'Drop ribs too short to stiffen anything', basis : KB.ribs, run (c, plan) {
        const before = plan.ribs.length, min = 2 * LandMm;
        plan.ribs = plan.ribs.filter (r => Math.hypot (r.x1 - r.x0, r.z1 - r.z0) >= min);
        return before === plan.ribs.length ? `${plan.ribs.length} rib${plan.ribs.length === 1 ? '' : 's'} kept.` : `Removed ${before - plan.ribs.length} rib(s) shorter than ${min} mm; ${plan.ribs.length} kept.`;
    } },
    { id : 'LUG-ENABLE', kind : 'parameter', title : 'Denest lugs requested', basis : KB.nesting, run (c, plan) {
        plan.lugsEnabled = c.draft.lugs !== 'off';
        return plan.lugsEnabled ? `Stand-off ${c.draft.lugStandoffMm} mm (KB: 1–3 mm).` : 'Denest lugs are off for this draft.';
    } },
    { id : 'LUG-PLACE', kind : 'placement', title : 'Four symmetric lugs on the drafted outer wall', basis : KB.nesting, run (c, plan) {
        if (!plan.lugsEnabled) { return 'Skipped: lugs off.'; }
        const rect = c.rect, sides = [['−Z', (rect.x0 + rect.x1) / 2, rect.z0, rect.lengthMm], ['+Z', (rect.x0 + rect.x1) / 2, rect.z1, rect.lengthMm], ['−X', rect.x0, (rect.z0 + rect.z1) / 2, rect.widthMm], ['+X', rect.x1, (rect.z0 + rect.z1) / 2, rect.widthMm]];
        const placed = [];
        for (const [side, x, z, length] of sides) {
            if (length < LugLengthMm + 2 * LandMm) { continue; }
            plan.lugs.push ({ side, x, z, lengthMm : LugLengthMm, standoffMm : c.draft.lugStandoffMm }); placed.push (side);
        }
        return placed.length >= 3 ? `${placed.length} lugs at the middle of sides ${placed.join (', ')} (KB: at least 3–4, symmetric).` : `Only ${placed.length} side(s) are long enough; KB asks for at least 3–4 lugs.`;
    } },
    { id : 'NEST-PITCH', kind : 'check', title : 'Nesting pitch and ratio', basis : KB.nesting, run (c, plan) {
        const t = c.draft.thicknessMm, standoff = plan.lugsEnabled ? c.draft.lugStandoffMm : 0, tan = Math.tan (c.draft.draftDeg * Math.PI / 180);
        const pitch = tan > 0 ? (t + standoff) / tan : Infinity, height = c.depthMm + t, ratio = Number.isFinite (pitch) ? height / pitch : 0;
        plan.nesting = { pitchMm : Number.isFinite (pitch) ? r1 (pitch) : null, ratio : r1 (ratio) };
        if (c.draft.draftDeg < 3) { plan.warnings.push ({ id : 'MP-N1', message : `Draft ${c.draft.draftDeg}° is below the 3° KB minimum for nesting walls; stacks may wedge.` }); }
        if (Number.isFinite (pitch) && (ratio < 5 || ratio > 15)) { plan.warnings.push ({ id : 'MP-N2', severity : 'note', message : `Estimated nesting ratio ${r1 (ratio)}:1 (pitch ${r1 (pitch)} mm) is outside the 5:1–15:1 range common for trays${ratio < 5 ? '; more draft or a thinner wall nests tighter' : ''}.` }); }
        return Number.isFinite (pitch) ? `Estimated pitch ${r1 (pitch)} mm = (wall + lug stand-off) / tan(draft); nesting ratio ${r1 (ratio)}:1.` : 'No draft: parts will not nest predictably.';
    } },
    { id : 'HINGE', kind : 'placement', title : 'Living hinge in the flange plane', basis : KB.hinge, run (c, plan) {
        if (!c.clamshell || c.clamshell === 'none') { return 'Single tray: no hinge.'; }
        if (!c.draft.hinge) { return 'Hinge off: two separate shells.'; }
        plan.hinge = { grooves : 2, edge : c.hingeEdge || 'long' };
        return 'Hinge on the long flange edge, in the parting plane, with 2 score grooves for 180° folding (KB: 2–3 grooves).';
    } }
]);

// Runs the rule base over a context: { draft, depthMm, slope, rect, pockets[{x0,x1,z0,z1}], skirtRunMm, clamshell }.
export function PlanFeatures (context)
{
    const plan = { ribs : [], lugs : [], warnings : [], trace : [], rib : null, nesting : null, hinge : null };
    for (const rule of PulpRuleBase) {
        let decision;
        try { decision = rule.run (context, plan); } catch (error) { decision = 'Rule failed: ' + error.message; }
        plan.trace.push ({ rule : rule.id, kind : rule.kind, title : rule.title, decision, basis : rule.basis });
    }
    for (const rib of plan.ribs) { rib.floorWidthMm = plan.rib.floorWidthMm; rib.depthMm = plan.rib.depthMm; }
    return plan;
}

export function PulpRuleList () { return PulpRuleBase.map (({ id, kind, title, basis }) => ({ id, kind, title, basis })); }
