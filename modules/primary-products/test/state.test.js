import { readFileSync } from 'node:fs';
import { PrimaryProductsVersion } from '../src/state.js';
import assert from 'node:assert/strict';
import { DefaultProductDraft, UpdateProductDraft, ProductSize, DimensionChanges } from '../src/state.js';
describe ('Primary Products draft state', () => {
    it ('keeps the module and package versions aligned', () => { assert.equal (PrimaryProductsVersion, JSON.parse (readFileSync (new URL ('../package.json', import.meta.url))).version); });
    it ('maps W × L × H to round diameters and pack width/depth', () => {
        const bottle = DefaultProductDraft ('bottle'), pouch = DefaultProductDraft ('pouch');
        assert.deepEqual (ProductSize (bottle), { widthMm : 65, lengthMm : 65, heightMm : 190 }); assert.deepEqual (ProductSize (pouch), { widthMm : 140, lengthMm : 40, heightMm : 200 });
        assert.deepEqual (DimensionChanges (bottle, { lengthMm : 70, heightMm : 210 }), { diameterMm : 70, heightMm : 210 }); assert.deepEqual (DimensionChanges (bottle, { widthMm : 72, lengthMm : 72 }), { diameterMm : 72 });
        assert.throws (() => DimensionChanges (bottle, { widthMm : 70, lengthMm : 80 }), /one diameter/);
        assert.deepEqual (DimensionChanges (pouch, { widthMm : 150, lengthMm : 30 }), { widthMm : 150, depthMm : 30 });
        for (const bad of [{}, { depthMm : 3 }, { widthMm : NaN }, null, [1]]) { assert.throws (() => DimensionChanges (pouch, bad), /width, length or height/); }
        assert.deepEqual (ProductSize (UpdateProductDraft (pouch, DimensionChanges (pouch, { lengthMm : 25 }))), { widthMm : 140, lengthMm : 25, heightMm : 200 });
    });
    it ('switches families atomically and resets incompatible surface defaults', () => {
        const bottle = UpdateProductDraft (DefaultProductDraft (), { material : 'glass', heightMm : 254 });
        const can = UpdateProductDraft (bottle, { family : 'can' }); assert.equal (can.material, 'aluminum'); assert.equal (can.heightMm, 122); assert.equal (bottle.material, 'glass');
        assert.throws (() => UpdateProductDraft (can, { material : 'glass' })); assert.equal (can.material, 'aluminum');
    });
    it ('rejects malformed drafts before mutation and retains canonical mm values', () => {
        const draft = DefaultProductDraft (); const original = structuredClone (draft);
        for (const changes of [{ family : 'unknown' }, { heightMm : NaN }, { diameterMm : 0 }, { color : '<svg>' }, { roughness : 2 }, { injected : true }, { labelZone : 'unknown' }]) { assert.throws (() => UpdateProductDraft (draft, changes)); assert.deepEqual (draft, original); }
        assert.equal (UpdateProductDraft (draft, { heightMm : 10 * 25.4 }).heightMm, 254);
    });
    it ('validates explicit bottle shapes, isolates nested data and preserves legacy defaults', () => {
        const legacy = DefaultProductDraft (), shape = { neckDiameterMm : 24,shoulderHeightMm : 28,neckHeightMm : 16,capHeightMm : 20 };
        const next = UpdateProductDraft (legacy,{ bottleShape : shape }); shape.neckDiameterMm = 999; assert.equal (next.bottleShape.neckDiameterMm,24); assert.equal (legacy.bottleShape,undefined);
        for (const changes of [{ bottleShape : {} },{ bottleShape : { ...next.bottleShape,extra : 1 } },{ bottleShape : { ...next.bottleShape,neckDiameterMm : 65 } },{ bottleShape : { ...next.bottleShape,shoulderHeightMm : 180 } },{ heightMm : 20 }]) { assert.throws (() => UpdateProductDraft (next,changes)); }
        assert.equal (UpdateProductDraft (next,{ family : 'can' }).bottleShape,undefined); assert.throws (() => UpdateProductDraft (DefaultProductDraft ('can'),{ bottleShape : next.bottleShape }));
    });

});
