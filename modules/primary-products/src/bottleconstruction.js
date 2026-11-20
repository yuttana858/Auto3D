// Presentation dimensions in millimeters. Presets are nominal glass construction,
// not supplier specifications or a manufacturing wall-thickness certification.
export const GlassThicknessPresets = Object.freeze ({
    lightweight : Object.freeze ({ name : 'Lightweight', wallMm : 1.2, baseMm : 2.4 }),
    standard : Object.freeze ({ name : 'Standard', wallMm : 2, baseMm : 4 }),
    heavy : Object.freeze ({ name : 'Heavy base', wallMm : 3, baseMm : 6 })
});
export const CapMaterials = Object.freeze ({
    pp : { name : 'Polypropylene', metalness : 0, roughness : .32 },
    hdpe : { name : 'HDPE', metalness : 0, roughness : .52 },
    aluminum : { name : 'Aluminum', metalness : 1, roughness : .26 },
    steel : { name : 'Steel', metalness : 1, roughness : .38 }
});
export function GlassBottle (draft) { return draft.family === 'bottle' && /glass/i.test (draft.material); }
export function BottleCornerLimit (draft)
{
    if (draft.bottleSection?.shape === 'rectangle') { return draft.bottleSection.cornerRadiusMm; }
    const width = draft.diameterMm, depth = draft.bottleSection?.depthMm ?? width;
    return Math.min (width, depth) ** 2 / (2 * Math.max (width, depth));
}
export function BottleGlassWallLimit (draft)
{
    const width = Math.min (draft.diameterMm, draft.bottleSection?.depthMm ?? draft.diameterMm), height = draft.heightMm;
    const neck = (draft.bottleShape?.neckDiameterMm ?? width * .42) / 2, shoulder = draft.bottleShape?.shoulderHeightMm ?? height * .17;
    const a = draft.diameterMm / 2, b = (draft.bottleSection?.depthMm ?? draft.diameterMm) / 2, corner = draft.bottleSection?.cornerRadiusMm ?? 0;
    const radius = draft.bottleSection?.shape === 'rectangle' ? Math.hypot (a - corner, b - corner) + corner : Math.max (a, b);
    // The eased shoulder has its smallest curvature radius at the straight-body
    // and neck transitions. Keeping the offset inside that radius prevents a
    // short, wide bottle from folding its inner shoulder back through itself.
    const shoulderLimit = draft.details?.shoulder === 'sloped' ? Infinity : .8 * 2 * shoulder ** 2 / (Math.PI ** 2 * Math.max (.001, radius - neck));
    return Math.min (10, Math.min (width, height) * .08, neck * .4, (draft.bottleShape?.neckHeightMm ?? height * .08) * .45, shoulder * .35, BottleCornerLimit (draft) * .8, shoulderLimit);
}
export function BottleBaseLimit (draft)
{
    const shape = draft.bottleShape, height = draft.heightMm;
    const body = height - (shape?.shoulderHeightMm ?? height * .17) - (shape?.neckHeightMm ?? height * .08) - (shape?.capHeightMm ?? height * .1);
    return Math.min (25, body * .25, Math.min (draft.diameterMm, draft.bottleSection?.depthMm ?? draft.diameterMm) * .2);
}
export function BottleWall (draft)
{
    const wallMm = Math.min (draft.details?.wallMm ?? 2, BottleGlassWallLimit (draft));
    return { wallMm, baseMm : Math.min (draft.details?.baseMm ?? wallMm * 2, BottleBaseLimit (draft)) };
}
export function BottleCapWallLimit (draft)
{
    const width = Math.min (draft.diameterMm, draft.bottleSection?.depthMm ?? draft.diameterMm), neck = (draft.bottleShape?.neckDiameterMm ?? width * .42) / 2, radius = neck * 1.08;
    return Math.min (5, radius * .3, (draft.bottleShape?.capHeightMm ?? draft.heightMm * .1) * .35, width / 2 - neck - Math.min (.2, neck * .015));
}
export function BottleCap (draft)
{
    const width = Math.min (draft.diameterMm, draft.bottleSection?.depthMm ?? draft.diameterMm), neck = (draft.bottleShape?.neckDiameterMm ?? width * .42) / 2;
    const heightMm = draft.bottleShape?.capHeightMm ?? draft.heightMm * .1, detail = draft.details;
    const formed = GlassBottle (draft) || ['capWallMm', 'capMaterial', 'capColor'].some (key => detail?.[key] !== undefined);
    const wallMm = Math.min (detail?.capWallMm ?? 1.2, BottleCapWallLimit (draft)), radiusMm = formed ? Math.max (neck * 1.08, neck + wallMm + Math.min (.2, neck * .015)) : neck * 1.08;
    const bevelMm = Math.min (heightMm * .12, radiusMm * .06);
    return { radiusMm, topRadiusMm : formed ? radiusMm - bevelMm : detail ? radiusMm * .94 : radiusMm,
        heightMm, bottomMm : draft.heightMm - heightMm, wallMm,
        material : detail?.capMaterial ?? 'pp', color : detail?.capColor ?? '#ebece5', style : detail?.closure ?? (formed ? 'ribbed' : 'smooth'), formed };
}
