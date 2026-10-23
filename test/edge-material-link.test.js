import assert from 'node:assert/strict';
import { PackagingModel } from '../source/website/packagingadapter.js';
import { EncodeRGBTexture } from '../modules/packaging/src/surfacetextures.js';
const data = value => ({ materials : [{ role : 'edge', name : 'Exposed edge', color : [255, 255, 255], diffuseMap : EncodeRGBTexture ('corrugated-edge.png', 4, 4, new Uint8Array (48).fill (value)) }], meshes : [] });
describe ('Material-linked corrugate edge refresh', () => {
    it ('refreshes default pixels on rebuild while retaining manual UV transforms', () => {
        const edge = PackagingModel (data (100)).materials[0]; edge.diffuseMap.scale.x = 2; edge.diffuseMap.offset.y = .3; edge.diffuseMap.rotation = .7;
        const rebuilt = PackagingModel (data (180), undefined, { edge }).materials[0];
        assert.notDeepEqual (rebuilt.diffuseMap.buffer, edge.diffuseMap.buffer);
        assert.equal (rebuilt.diffuseMap.scale.x, 2); assert.equal (rebuilt.diffuseMap.offset.y, .3); assert.equal (rebuilt.diffuseMap.rotation, .7);
    });
    it ('keeps an authored edge map intact', () => {
        const edge = PackagingModel (data (100)).materials[0]; edge.diffuseMap.name = 'custom-edge.png';
        const rebuilt = PackagingModel (data (180), undefined, { edge }).materials[0];
        assert.equal (rebuilt.diffuseMap.name, 'custom-edge.png'); assert.deepEqual (rebuilt.diffuseMap.buffer, edge.diffuseMap.buffer);
    });
});
