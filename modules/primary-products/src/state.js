export const PrimaryProductsVersion = '0.1.0';
export const PrimaryFamilies = Object.freeze ({ bottle : { name : 'Round bottle', material : 'plastic', heightMm : 190, diameterMm : 65, color : '#e8eceb', roughness : 0.45, labelZone : 'front' }, can : { name : 'Standard can', material : 'aluminum', heightMm : 122, diameterMm : 66, color : '#c9d2d4', roughness : 0.3, labelZone : 'wrap' } });
const fields = ['family', 'heightMm', 'diameterMm', 'material', 'color', 'roughness', 'labelZone'];
export function DefaultProductDraft (family = 'bottle')
{
    if (!Object.hasOwn (PrimaryFamilies, family)) { throw new Error ('Choose bottles or cans.'); }
    const { name, ...values } = PrimaryFamilies[family]; return { family, ...values };
}
export function UpdateProductDraft (current, changes)
{
    if (!changes || typeof changes !== 'object' || Array.isArray (changes) || Object.keys (changes).some (key => !fields.includes (key))) { throw new Error ('Invalid product draft fields.'); }
    if (changes.family !== undefined && !Object.hasOwn (PrimaryFamilies, changes.family)) { throw new Error ('Choose bottles or cans.'); }
    const next = { ...(changes.family && changes.family !== current.family ? DefaultProductDraft (changes.family) : current), ...changes };
    if (!Number.isFinite (next.heightMm) || next.heightMm < 20 || next.heightMm > 1000 || !Number.isFinite (next.diameterMm) || next.diameterMm < 10 || next.diameterMm > 500) { throw new Error ('Height must be 20–1000 mm and diameter 10–500 mm.'); }
    if (!(next.family === 'bottle' ? ['plastic', 'glass'] : ['aluminum', 'steel']).includes (next.material)) { throw new Error ('Choose a surface available for this product.'); }
    if (typeof next.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test (next.color) || !Number.isFinite (next.roughness) || next.roughness < 0 || next.roughness > 1 || !['front', 'wrap'].includes (next.labelZone)) { throw new Error ('Invalid surface or label settings.'); }
    return { ...next, color : next.color.toLowerCase () };
}
