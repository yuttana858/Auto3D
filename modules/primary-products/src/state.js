import { ProductMaterials } from './materials.js';
export const PrimaryProductsVersion = '0.6.0';
export const PrimaryFamilies = Object.freeze ({ bottle : { name : 'Round bottle', material : 'plastic', heightMm : 190, diameterMm : 65, color : '#e8eceb', roughness : 0.45, labelZone : 'front' }, can : { name : 'Standard can', material : 'aluminum', heightMm : 122, diameterMm : 66, color : '#c9d2d4', roughness : 0.3, labelZone : 'wrap' }, pouch : { name : 'Pillow pouch', material : 'plastic', heightMm : 200, widthMm : 140, depthMm : 40, color : '#e8eceb', roughness : 0.5, labelZone : 'front' } });
const fields = ['family', 'heightMm', 'diameterMm', 'widthMm', 'depthMm', 'material', 'color', 'roughness', 'labelZone', 'bottleShape'];
export function DefaultProductDraft (family = 'bottle')
{
    if (!Object.hasOwn (PrimaryFamilies, family)) { throw new Error ('Choose bottles, cans or pouches.'); }
    const { name, ...values } = PrimaryFamilies[family]; return { family, ...values };
}
export function UpdateProductDraft (current, changes)
{
    if (!changes || typeof changes !== 'object' || Array.isArray (changes) || Object.keys (changes).some (key => !fields.includes (key))) { throw new Error ('Invalid product draft fields.'); }
    if (changes.family !== undefined && !Object.hasOwn (PrimaryFamilies, changes.family)) { throw new Error ('Choose bottles, cans or pouches.'); }
    const next = { ...(changes.family && changes.family !== current.family ? DefaultProductDraft (changes.family) : current), ...changes };
    if (!Number.isFinite (next.heightMm) || next.heightMm < 20 || next.heightMm > 1000) { throw new Error ('Height must be 20–1000 mm.'); }
    if (next.family === 'pouch') {
        if (Object.hasOwn (next, 'diameterMm') || !Number.isFinite (next.widthMm) || next.widthMm < 10 || next.widthMm > 500 || !Number.isFinite (next.depthMm) || next.depthMm < 2 || next.depthMm > 200 || next.depthMm > next.widthMm) { throw new Error ('Pouch width must be 10–500 mm and filled depth 2–200 mm, no greater than width.'); }
    } else if (Object.hasOwn (next, 'widthMm') || Object.hasOwn (next, 'depthMm') || !Number.isFinite (next.diameterMm) || next.diameterMm < 10 || next.diameterMm > 500) { throw new Error ('Diameter must be 10–500 mm.'); }
    if (!Object.hasOwn (ProductMaterials, next.material) || !ProductMaterials[next.material].families.includes (next.family)) { throw new Error ('Choose a surface available for this product.'); }
    if (changes.material && changes.material !== current.material && changes.roughness === undefined) { next.roughness = ProductMaterials[changes.material].roughness; }
    if (typeof next.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test (next.color) || !Number.isFinite (next.roughness) || next.roughness < 0 || next.roughness > 1 || !(next.family === 'pouch' ? ['front', 'back'] : ['front', 'wrap', 'back']).includes (next.labelZone)) { throw new Error ('Invalid surface or label settings.'); }
    if (next.bottleShape !== undefined) {
        if (next.family !== 'bottle') { throw new Error ('Bottle shape controls apply only to bottles.'); }
        next.bottleShape = ValidateBottleShape (next, next.bottleShape);
    }
    return { ...next, color : next.color.toLowerCase () };
}

export function BottleShape (draft)
{
    return { neckDiameterMm : draft.diameterMm * .42, shoulderHeightMm : draft.heightMm * .17, neckHeightMm : draft.heightMm * .08, capHeightMm : draft.heightMm * .1, ...draft.bottleShape };
}
function ValidateBottleShape (draft, input)
{
    const defaults = BottleShape ({ ...draft, bottleShape : undefined });
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).length !== 4 || Object.keys (input).some (key => !Object.hasOwn (defaults, key)) || Object.values (input).some (v => !Number.isFinite (v) || v < .5 || v > 1000)) { throw new Error ('Enter all four bottle shape dimensions in millimeters (0.5–1000).'); }
    if (input.neckDiameterMm * 1.08 > draft.diameterMm || input.neckDiameterMm >= draft.diameterMm) { throw new Error ('The neck and cap must fit within the body diameter.'); }
    if (input.shoulderHeightMm + input.neckHeightMm + input.capHeightMm > draft.heightMm * .8) { throw new Error ('Keep at least 20% of the overall height for the straight bottle body.'); }
    return { ...input };
}
