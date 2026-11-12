import { ValidateContents, ValidateOptics } from './contents.js';
import { ValidateProductDetails } from './details.js';
import { ProductMaterials } from './materials.js';
export const PrimaryProductsVersion = '0.15.0';
export const PrimaryFamilies = Object.freeze ({ clamshell : { name : 'Closed clamshell', material : 'pp', heightMm : 60, widthMm : 180, depthMm : 130, color : '#eee9dd', roughness : .35, labelZone : 'front' }, bottle : { name : 'Round bottle', material : 'plastic', heightMm : 190, diameterMm : 65, color : '#e8eceb', roughness : 0.45, labelZone : 'front' }, can : { name : 'Standard can', material : 'aluminum', heightMm : 122, diameterMm : 66, color : '#c9d2d4', roughness : 0.3, labelZone : 'wrap' }, pouch : { name : 'Pillow pouch', material : 'plastic', heightMm : 200, widthMm : 140, depthMm : 40, color : '#e8eceb', roughness : 0.5, labelZone : 'front' } });
const fields = ['family', 'heightMm', 'diameterMm', 'widthMm', 'depthMm', 'material', 'color', 'roughness', 'labelZone', 'bottleShape', 'bottleSection', 'pouchShape', 'details', 'contents', 'optics'];
export function DefaultProductDraft (family = 'bottle')
{
    if (!Object.hasOwn (PrimaryFamilies, family)) { throw new Error ('Choose bottles, cans, pouches or clamshells.'); }
    const { name, ...values } = PrimaryFamilies[family]; return { family, ...values };
}
export function UpdateProductDraft (current, changes)
{
    if (!changes || typeof changes !== 'object' || Array.isArray (changes) || Object.keys (changes).some (key => !fields.includes (key))) { throw new Error ('Invalid product draft fields.'); }
    if (changes.family !== undefined && !Object.hasOwn (PrimaryFamilies, changes.family)) { throw new Error ('Choose bottles, cans, pouches or clamshells.'); }
    const next = { ...(changes.family && changes.family !== current.family ? DefaultProductDraft (changes.family) : current), ...changes };
    if (!Number.isFinite (next.heightMm) || next.heightMm < 20 || next.heightMm > 1000) { throw new Error ('Height must be 20–1000 mm.'); }
    if (['pouch', 'clamshell'].includes (next.family)) {
        if (Object.hasOwn (next, 'diameterMm') || !Number.isFinite (next.widthMm) || next.widthMm < 10 || next.widthMm > 500 || !Number.isFinite (next.depthMm) || next.depthMm < 2 || next.depthMm > 200 || next.depthMm > next.widthMm) { throw new Error ('Pack width must be 10–500 mm and filled depth 2–200 mm, no greater than width.'); }
    } else if (Object.hasOwn (next, 'widthMm') || Object.hasOwn (next, 'depthMm') || !Number.isFinite (next.diameterMm) || next.diameterMm < 10 || next.diameterMm > 500) { throw new Error ('Diameter must be 10–500 mm.'); }
    if (!Object.hasOwn (ProductMaterials, next.material) || !ProductMaterials[next.material].families.includes (next.family)) { throw new Error ('Choose a surface available for this product.'); }
    if (changes.material && changes.material !== current.material && changes.roughness === undefined) { next.roughness = ProductMaterials[changes.material].roughness; }
    if (changes.material && changes.color === undefined && ProductMaterials[changes.material].color) { next.color = ProductMaterials[changes.material].color; }
    if (typeof next.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test (next.color) || !Number.isFinite (next.roughness) || next.roughness < 0 || next.roughness > 1 || !(['pouch', 'clamshell'].includes (next.family) ? ['front', 'back'] : ['front', 'wrap', 'back']).includes (next.labelZone)) { throw new Error ('Invalid surface or label settings.'); }
    if (next.bottleSection !== undefined) {
        if (next.family !== 'bottle') { throw new Error ('Cross-section controls apply only to bottles.'); }
        next.bottleSection = ValidateBottleSection (next, next.bottleSection);
        if (next.bottleSection === null) { delete next.bottleSection; }
    }
    if (next.pouchShape !== undefined) {
        if (next.family !== 'pouch') { throw new Error ('Pouch style controls apply only to pouches.'); }
        next.pouchShape = ValidatePouchShape (next, next.pouchShape, changes.pouchShape !== undefined);
        if (next.pouchShape === null) { delete next.pouchShape; }
    }
    if (next.bottleShape !== undefined) {
        if (next.family !== 'bottle') { throw new Error ('Bottle shape controls apply only to bottles.'); }
        next.bottleShape = ValidateBottleShape (next, next.bottleShape);
    }
    if (next.details !== undefined) { next.details = ValidateProductDetails (next, next.details, changes.details !== undefined); if (next.details === null) { delete next.details; } }
    if (changes.material !== undefined && changes.material !== current.material && changes.optics === undefined) { delete next.optics; }
    if (changes.color !== undefined && next.optics && changes.optics === undefined) { next.optics = { ...next.optics, color : changes.color }; }
    if (next.optics !== undefined) {
        if (next.family !== 'bottle' || !ProductMaterials[next.material].transmission) { throw new Error ('Glass appearance requires a clear or translucent bottle material.'); }
        next.optics = ValidateOptics (next.optics); if (next.optics === null) { delete next.optics; }
    }
    if (next.contents !== undefined) {
        if (next.family !== 'bottle') { throw new Error ('Contents currently apply to bottles.'); }
        next.contents = ValidateContents (next.contents); if (next.contents === null) { delete next.contents; }
        else if (!next.details) { next.details = ValidateProductDetails (next, {}, false); }
    }
    return { ...next, color : next.color.toLowerCase () };
}

// Pouch construction. Pillow pouches bulge from four seals; stand-up pouches open into a bottom gusset (gussetMm is
// the fold height on the front panel and filled depth L is the opened gusset depth); flat-bottom (box) pouches have a
// rectangular W × L base with full-depth side gussets. Any style can add a reclosable zipper; stand-up and flat-bottom
// pouches can add a spout fitment in the top seal. Overall height H includes the spout and its cap.
export const PouchStyles = Object.freeze (['pillow', 'standup', 'flatbottom']);
export const PouchSpoutPositions = Object.freeze (['center', 'corner']);
export function PouchGussetLimit (draft) { return Math.min (draft.depthMm, draft.heightMm * .35); }
// Spout neck and cap heights follow the bore diameter.
export function PouchSpoutHeight (spout) { return spout ? spout.diameterMm * 1.9 : 0; }
export function PouchSpoutLimit (draft) { return Math.min (draft.depthMm / 1.45, draft.widthMm * .3, draft.heightMm * .2 / 1.9, 40); }
function ValidatePouchShape (draft, input, explicit)
{
    if (input === null) { return null; }
    if (!input || typeof input !== 'object' || Array.isArray (input) || !PouchStyles.includes (input.style) || Object.keys (input).some (key => !['style', 'gussetMm', 'zipper', 'spout'].includes (key))) { throw new Error ('Choose a pillow, stand-up or flat-bottom pouch.'); }
    if (input.zipper !== undefined && typeof input.zipper !== 'boolean') { throw new Error ('Zipper must be true or false.'); }
    const result = { style : input.style };
    if (input.style === 'standup') {
        if (draft.depthMm < 10) { throw new Error ('Stand-up pouches need a filled depth of at least 10 mm.'); }
        const limit = PouchGussetLimit (draft); let gusset = input.gussetMm ?? Math.round (Math.min (draft.depthMm * .5, limit) * 100) / 100;
        // Resizing an existing stand-up pouch keeps the gusset within the new limits instead of rejecting the resize.
        if (!explicit && Number.isFinite (gusset)) { gusset = Math.min (gusset, limit); }
        if (!Number.isFinite (gusset) || gusset < 3 || gusset > limit) { throw new Error ('Gusset height must be 3 mm to the filled depth, and at most 35% of the height.'); }
        result.gussetMm = gusset;
    } else if (input.gussetMm !== undefined) { throw new Error ('Gusset height applies only to stand-up pouches.'); }
    if (input.style === 'flatbottom' && draft.depthMm < 20) { throw new Error ('Flat-bottom pouches need a filled depth of at least 20 mm.'); }
    if (input.zipper) { if (draft.heightMm < 60) { throw new Error ('Zipper pouches need a height of at least 60 mm.'); } result.zipper = true; }
    if (input.spout !== undefined && input.spout !== null) {
        const spout = input.spout;
        if (input.style === 'pillow') { throw new Error ('Spouts apply to stand-up and flat-bottom pouches.'); }
        if (!spout || typeof spout !== 'object' || Array.isArray (spout) || !PouchSpoutPositions.includes (spout.position) || Object.keys (spout).some (key => !['position', 'diameterMm'].includes (key))) { throw new Error ('Choose a center or corner spout.'); }
        const limit = PouchSpoutLimit (draft); let diameter = spout.diameterMm ?? Math.round (Math.min (12, limit) * 100) / 100;
        if (!explicit && Number.isFinite (diameter)) { diameter = Math.min (diameter, limit); }
        if (!Number.isFinite (diameter) || diameter < 5 || diameter > limit) { throw new Error ('Spout diameter must be 5 mm to ' + Math.max (5, Math.floor (limit * 10) / 10) + ' mm for this pouch size.'); }
        result.spout = { position : spout.position, diameterMm : diameter };
    }
    // A plain pillow pouch is the default construction and is stored without pouchShape.
    return result.style === 'pillow' && !result.zipper ? null : result;
}
// The narrower side of the body governs the default neck and the neck fit for oval and rectangular bottles.
export function BodyMinimum (draft) { return Math.min (draft.diameterMm, draft.bottleSection?.depthMm ?? draft.diameterMm); }
// Oval and rounded-rectangle bottles keep diameterMm as the body width (W) and add the front-to-back depth (L).
function ValidateBottleSection (draft, input)
{
    if (input === null || input?.shape === 'round') { return null; }
    if (!input || typeof input !== 'object' || Array.isArray (input) || !['oval', 'rectangle'].includes (input.shape) || Object.keys (input).some (key => !['shape', 'depthMm', 'cornerRadiusMm'].includes (key))) { throw new Error ('Choose a round, oval or rounded-rectangle bottle section.'); }
    if (!Number.isFinite (input.depthMm) || input.depthMm < 10 || input.depthMm > 500) { throw new Error ('Bottle depth must be 10–500 mm.'); }
    const result = { shape : input.shape, depthMm : input.depthMm };
    if (input.shape === 'rectangle') {
        const limit = Math.min (draft.diameterMm, input.depthMm) / 2, radius = input.cornerRadiusMm ?? Math.round (limit * .35 * 100) / 100;
        if (!Number.isFinite (radius) || radius < 1 || radius > limit) { throw new Error ('Corner radius must be 1 mm to half the narrower side.'); }
        result.cornerRadiusMm = radius;
    } else if (input.cornerRadiusMm !== undefined) { throw new Error ('Corner radius applies only to rounded-rectangle bottles.'); }
    return result;
}
export function BottleShape (draft)
{
    return { neckDiameterMm : BodyMinimum (draft) * .42, shoulderHeightMm : draft.heightMm * .17, neckHeightMm : draft.heightMm * .08, capHeightMm : draft.heightMm * .1, ...draft.bottleShape };
}
function ValidateBottleShape (draft, input)
{
    const defaults = BottleShape ({ ...draft, bottleShape : undefined });
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).length !== 4 || Object.keys (input).some (key => !Object.hasOwn (defaults, key)) || Object.values (input).some (v => !Number.isFinite (v) || v < .5 || v > 1000)) { throw new Error ('Enter all four bottle shape dimensions in millimeters (0.5–1000).'); }
    if (input.neckDiameterMm * 1.08 > BodyMinimum (draft) || input.neckDiameterMm >= BodyMinimum (draft)) { throw new Error ('The neck and cap must fit within the body width and depth.'); }
    if (input.shoulderHeightMm + input.neckHeightMm + input.capHeightMm > draft.heightMm * .8) { throw new Error ('Keep at least 20% of the overall height for the straight bottle body.'); }
    return { ...input };
}

// Display name for a generated object: the family name, refined by bottle section or pouch construction.
export function ProductName (draft)
{
    if (draft.pouchShape) { return { pillow : 'Pillow pouch', standup : 'Stand-up pouch', flatbottom : 'Flat-bottom pouch' }[draft.pouchShape.style] + (draft.pouchShape.spout ? ' with spout' : draft.pouchShape.zipper ? ' with zipper' : ''); }
    if (draft.bottleSection) { return { oval : 'Oval bottle', rectangle : 'Rounded-rectangle bottle' }[draft.bottleSection.shape]; }
    return PrimaryFamilies[draft.family].name;
}
// Overall size as W × L × H: round products use their diameter for both width and length; pouches and clamshells use
// width and front-to-back depth.
export function ProductSize (draft)
{
    const round = !['pouch', 'clamshell'].includes (draft.family);
    return { widthMm : round ? draft.diameterMm : draft.widthMm, lengthMm : round ? draft.bottleSection?.depthMm ?? draft.diameterMm : draft.depthMm, heightMm : draft.heightMm };
}
export function DimensionChanges (draft, dimensions)
{
    if (!dimensions || typeof dimensions !== 'object' || Array.isArray (dimensions) || !Object.keys (dimensions).length || Object.keys (dimensions).some (key => !['widthMm', 'lengthMm', 'heightMm'].includes (key)) || Object.values (dimensions).some (value => !Number.isFinite (value))) { throw new Error ('Enter width, length or height in millimeters.'); }
    const changes = {}; if (dimensions.heightMm !== undefined) { changes.heightMm = dimensions.heightMm; }
    if (['pouch', 'clamshell'].includes (draft.family)) {
        if (dimensions.widthMm !== undefined) { changes.widthMm = dimensions.widthMm; }
        if (dimensions.lengthMm !== undefined) { changes.depthMm = dimensions.lengthMm; }
    } else if (draft.bottleSection) {
        if (dimensions.widthMm !== undefined) { changes.diameterMm = dimensions.widthMm; }
        if (dimensions.lengthMm !== undefined) { changes.bottleSection = { ...draft.bottleSection, depthMm : dimensions.lengthMm }; }
    } else {
        if (dimensions.widthMm !== undefined && dimensions.lengthMm !== undefined && Math.abs (dimensions.widthMm - dimensions.lengthMm) > 1e-9) { throw new Error ('Round products use one diameter; width and length must match.'); }
        const diameter = dimensions.widthMm ?? dimensions.lengthMm; if (diameter !== undefined) { changes.diameterMm = diameter; }
    }
    return changes;
}
