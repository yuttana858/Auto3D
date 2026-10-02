import * as assert from 'node:assert/strict';
import * as THREE from 'three';
import { GetAssignedTextureSlots, DrawTextureThumbnail } from '../source/website/materialpanel.js';
import { ImporterThreeDae } from '../source/engine/import/importerthree.js';
import { SceneDocument } from '../source/website/scenedocument.js';
import { Model } from '../source/engine/model/model.js';

describe ('Material texture previews', () => {
    it ('associates each image with its own property and filename', () => {
        const base = new THREE.Texture ({ width : 128, height : 64 });
        const bump = new THREE.Texture ({ width : 64, height : 64 });
        const entry = { material : { map : base, bumpMap : bump, normalMap : null }, original : {
            diffuseMap : { name : 'label.jpg' }, bumpMap : { name : 'label_bump.jpg' }
        } };
        assert.deepEqual (GetAssignedTextureSlots (entry).map ((map) => [map.key, map.name, map.texture]), [
            ['map', 'label.jpg', base], ['bumpMap', 'label_bump.jpg', bump]
        ]);
        entry.material.map = null;
        assert.deepEqual (GetAssignedTextureSlots (entry).map ((map) => map.key), ['bumpMap']);
    });
    it ('fits rectangular images in thumbnails without stretching', () => {
        let drawing;
        const image = { width : 200, height : 100 };
        DrawTextureThumbnail ({ width : 64, height : 64, getContext : () => ({ drawImage : (...args) => { drawing = args; } }) }, image);
        assert.deepEqual (drawing, [image, 0, 16, 64, 32]);
    });
    it ('retains imported specular and emission images alongside base and bump maps', () => {
        const getDataURL = THREE.ImageUtils.getDataURL;
        THREE.ImageUtils.getDataURL = () => 'data:image/png;base64,AQID';
        try {
            const importer = new ImporterThreeDae ();
            importer.ResetContent ();
            const material = new THREE.MeshPhongMaterial ({ name : 'Bottle' });
            for (const key of ['map', 'bumpMap', 'specularMap', 'emissiveMap']) {
                material[key] = new THREE.Texture ({ src : key + '.jpg' });
                importer.objectUrlToFileName.set (key + '.jpg', key + '.jpg');
            }
            material.bumpScale = 0.4;
            const original = importer.ConvertThreeMaterial (material);
            assert.deepEqual (['diffuseMap', 'bumpMap', 'specularMap', 'emissiveMap'].map ((key) => original[key].name), ['map.jpg', 'bumpMap.jpg', 'specularMap.jpg', 'emissiveMap.jpg']);
            assert.equal (original.bumpScale, 0.4);
            const model = new Model (); model.AddMaterial (original);
            const session = new SceneDocument (); session.AddImported (model, 'Bottle');
            assert.equal (session.model.GetMaterial (0).specularMap.name, 'specularMap.jpg');
        } finally { THREE.ImageUtils.getDataURL = getDataURL; }
    });
});
