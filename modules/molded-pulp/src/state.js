// Molded Pulp draft state: pulp process presets and strict, canonical-mm draft validation.
// Preset ranges come from the MP knowledge base (kb/molded-pulp/04-design/01-dfm-rules-by-process-type.md):
// review figures put Type 1 at 5–10 mm, Type 2 at 3–5 mm (1.5–3 mm common in practice), wet-pressed Type 3 at
// 0.7–1.2 mm and dry-pressed Type 3 at 1.5–3.0 mm. Drafts of 1–7° are published; 3–5° is the common default.
// Densities are indicative presentation values for mass estimates, not certified material data.
export const MoldedPulpVersion = '0.3.0';
export const PulpTypes = Object.freeze ({
    type1 : Object.freeze ({ name : 'Type 1 · Thick-wall', short : 'Type 1', thicknessMm : 6, rangeMm : [5, 10], draftDeg : 5, minDraftDeg : 3, toleranceMm : 2, densityGcm3 : 0.3, color : '#9a8f7e', roughness : 0.97, surface : 'One smooth side, one rough side', use : 'Dunnage, end caps and heavy industrial supports; oven dried in a single open mold.' }),
    type2 : Object.freeze ({ name : 'Type 2 · Transfer-molded', short : 'Type 2', thicknessMm : 3, rangeMm : [1.5, 5], draftDeg : 4, minDraftDeg : 3, toleranceMm : 1.25, densityGcm3 : 0.45, color : '#a79c89', roughness : 0.92, surface : 'Both sides moderately smooth', use : 'Egg cartons, trays, cup carriers and protective inserts; formed, transferred and oven dried.' }),
    type3wet : Object.freeze ({ name : 'Type 3 · Thermoformed (wet-pressed)', short : 'Type 3 wet', thicknessMm : 1, rangeMm : [0.7, 1.2], draftDeg : 3, minDraftDeg : 1, toleranceMm : 0.5, densityGcm3 : 0.9, color : '#e7e1d3', roughness : 0.78, surface : 'Smooth on both sides', use : 'Premium electronics and cosmetics inserts, food-service ware; cured in heated matched tools.' }),
    type3dry : Object.freeze ({ name : 'Type 3 · Dry-pressed', short : 'Type 3 dry', thicknessMm : 2, rangeMm : [1.5, 3], draftDeg : 3, minDraftDeg : 2, toleranceMm : 0.5, densityGcm3 : 0.8, color : '#d8cfbd', roughness : 0.85, surface : 'Smooth top, rougher bottom', use : 'Formed, oven dried, then hot-pressed; rigid inserts with good surface.' })
});
export const PulpLimits = Object.freeze ({ thicknessMm : [0.5, 12], extraMm : [0, 1000], formDepthMm : [1, 300], clearanceMm : [0, 20], draftDeg : [0, 15], resolutionMm : [0.1, 10], ribDepthMm : [1, 30], ribWidthMm : [2, 60], lugStandoffMm : [0.5, 5], partingFraction : [0.1, 0.9] });
// Detail tiers: target sensing cell (mm), largest square grid (2^k + 1 nodes per side) and the adaptive-mesh tolerance (mm).
// Heavier tiers are computed off the main thread and shown progressively (draft first, then the requested tier).
export const PulpDetail = Object.freeze ({
    draft : Object.freeze ({ name : 'Draft', cellMm : 2, maxSide : 257, toleranceMm : 0.15 }),
    standard : Object.freeze ({ name : 'Standard', cellMm : 1, maxSide : 513, toleranceMm : 0.06 }),
    fine : Object.freeze ({ name : 'Fine', cellMm : 0.5, maxSide : 1025, toleranceMm : 0.05 }),
    ultra : Object.freeze ({ name : 'Ultra', cellMm : 0.25, maxSide : 2049, toleranceMm : 0.04 })
});
// Clamshell modes: none (single tray), top-bottom (base formed from below, lid from above) or side-to-side halves split
// across the X or Z axis. Each shell is formed toward a parting plane at partingFraction of the product extent.
export const PulpClamshellModes = Object.freeze ({ none : 'Single tray', 'top-bottom' : 'Clamshell · top and bottom', 'side-x' : 'Clamshell · side to side (X)', 'side-z' : 'Clamshell · side to side (Z)' });
const fields = ['pulpType', 'thicknessMm', 'extraLengthMm', 'extraWidthMm', 'formDepthMm', 'clearanceMm', 'draftDeg', 'resolutionMm', 'color', 'detail', 'ribs', 'lugs', 'ribDepthMm', 'ribWidthMm', 'lugStandoffMm', 'clamshell', 'partingFraction', 'hinge'];

export function DefaultPulpDraft (pulpType = 'type2')
{
    if (!Object.hasOwn (PulpTypes, pulpType)) { throw new Error ('Choose Type 1, Type 2, Type 3 wet-pressed or Type 3 dry-pressed pulp.'); }
    const preset = PulpTypes[pulpType];
    return { pulpType, thicknessMm : preset.thicknessMm, extraLengthMm : 20, extraWidthMm : 20, formDepthMm : 30, clearanceMm : 1, draftDeg : preset.draftDeg, resolutionMm : null, color : preset.color, detail : 'standard', ribs : 'auto', lugs : 'auto', ribDepthMm : null, ribWidthMm : null, lugStandoffMm : 1.5, clamshell : 'none', partingFraction : 0.5, hinge : true };
}

function Range (value, [min, max], message)
{
    if (typeof value !== 'number' || !Number.isFinite (value) || value < min || value > max) { throw new Error (message); }
    return Math.round (value * 1000) / 1000;
}

// Validates every field together and returns a new draft; the current draft is never mutated. Changing the pulp type
// resets thickness, draft and colour to that type's preset unless the same change sets them explicitly.
export function UpdatePulpDraft (current, changes)
{
    if (!changes || typeof changes !== 'object' || Array.isArray (changes) || Object.keys (changes).some (key => !fields.includes (key))) { throw new Error ('Invalid molded pulp draft fields.'); }
    if (changes.pulpType !== undefined && !Object.hasOwn (PulpTypes, changes.pulpType)) { throw new Error ('Choose Type 1, Type 2, Type 3 wet-pressed or Type 3 dry-pressed pulp.'); }
    const kept = Object.fromEntries (Object.entries (current).filter (([key]) => !['pulpType', 'thicknessMm', 'draftDeg', 'color'].includes (key)));
    const base = changes.pulpType && changes.pulpType !== current.pulpType ? { ...DefaultPulpDraft (changes.pulpType), ...kept } : current;
    // Drafts saved by 0.1.0 have no detail/feature/clamshell fields; they take the defaults.
    const next = { ...DefaultPulpDraft (base.pulpType), ...base, ...changes };
    next.thicknessMm = Range (next.thicknessMm, PulpLimits.thicknessMm, 'Pulp thickness must be 0.5–12 mm.');
    next.extraLengthMm = Range (next.extraLengthMm, PulpLimits.extraMm, 'Additional length must be 0–1000 mm.');
    next.extraWidthMm = Range (next.extraWidthMm, PulpLimits.extraMm, 'Additional width must be 0–1000 mm.');
    next.formDepthMm = Range (next.formDepthMm, PulpLimits.formDepthMm, 'Form depth must be 1–300 mm.');
    next.clearanceMm = Range (next.clearanceMm, PulpLimits.clearanceMm, 'Product clearance must be 0–20 mm.');
    next.draftDeg = Range (next.draftDeg, PulpLimits.draftDeg, 'Draft angle must be 0–15°.');
    if (next.resolutionMm !== null) { next.resolutionMm = Range (next.resolutionMm, PulpLimits.resolutionMm, 'Sensing resolution must be 0.1–10 mm, or automatic.'); }
    if (typeof next.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test (next.color)) { throw new Error ('Pulp colour must be a #RRGGBB value.'); }
    if (!Object.hasOwn (PulpDetail, next.detail)) { throw new Error ('Detail must be draft, standard, fine or ultra.'); }
    if (!['auto', 'off'].includes (next.ribs) || !['auto', 'off'].includes (next.lugs)) { throw new Error ('Ribs and denest lugs must be auto or off.'); }
    if (next.ribDepthMm !== null) { next.ribDepthMm = Range (next.ribDepthMm, PulpLimits.ribDepthMm, 'Rib depth must be 1–30 mm, or automatic.'); }
    if (next.ribWidthMm !== null) { next.ribWidthMm = Range (next.ribWidthMm, PulpLimits.ribWidthMm, 'Rib width must be 2–60 mm, or automatic.'); }
    next.lugStandoffMm = Range (next.lugStandoffMm, PulpLimits.lugStandoffMm, 'Denest lug stand-off must be 0.5–5 mm.');
    if (!Object.hasOwn (PulpClamshellModes, next.clamshell)) { throw new Error ('Clamshell must be none, top-bottom, side-x or side-z.'); }
    next.partingFraction = Range (next.partingFraction, PulpLimits.partingFraction, 'Parting plane must be 10–90% of the product extent.');
    if (typeof next.hinge !== 'boolean') { throw new Error ('Hinge must be true or false.'); }
    return next;
}

export function PulpTypeList ()
{
    return Object.entries (PulpTypes).map (([id, t]) => ({ id, name : t.name, thicknessMm : t.thicknessMm, rangeMm : [...t.rangeMm], draftDeg : t.draftDeg, minDraftDeg : t.minDraftDeg, toleranceMm : t.toleranceMm, densityGcm3 : t.densityGcm3, surface : t.surface, use : t.use }));
}

export function PulpName (draft) { return 'Molded pulp tray · ' + PulpTypes[draft.pulpType].short + ' · ' + draft.thicknessMm + ' mm'; }
