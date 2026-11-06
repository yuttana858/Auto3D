export const PrimaryProductsVersion = '0.4.0';
export const PrimaryFamilies = Object.freeze ({ bottle : { name : 'Round bottle', material : 'plastic', heightMm : 190, diameterMm : 65, color : '#e8eceb', roughness : 0.45, labelZone : 'front' }, can : { name : 'Standard can', material : 'aluminum', heightMm : 122, diameterMm : 66, color : '#c9d2d4', roughness : 0.3, labelZone : 'wrap' }, pouch : { name : 'Pillow pouch', material : 'plastic', heightMm : 200, widthMm : 140, depthMm : 40, color : '#e8eceb', roughness : 0.5, labelZone : 'front' } });
const fields = ['family', 'heightMm', 'diameterMm', 'widthMm', 'depthMm', 'material', 'color', 'roughness', 'labelZone'];
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
    const materials = next.family === 'bottle' ? ['plastic', 'glass'] : next.family === 'pouch' ? ['plastic'] : ['aluminum', 'steel'];
    if (!materials.includes (next.material)) { throw new Error ('Choose a surface available for this product.'); }
    if (typeof next.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test (next.color) || !Number.isFinite (next.roughness) || next.roughness < 0 || next.roughness > 1 || !(next.family === 'pouch' ? ['front', 'back'] : ['front', 'wrap']).includes (next.labelZone)) { throw new Error ('Invalid surface or label settings.'); }
    return { ...next, color : next.color.toLowerCase () };
}
