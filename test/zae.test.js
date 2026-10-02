import * as assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { Importer } from '../source/engine/import/importer.js';
import { ImporterFile, ImporterFileList } from '../source/engine/import/importerfiles.js';
import { FileSource } from '../source/engine/io/fileutils.js';
import * as THREE from 'three';
import { ConvertThreeGeometryToMesh } from '../source/engine/threejs/threeutils.js';
import { PreserveTextureMapping } from '../source/website/materialpanel.js';
import { TextureMap } from '../source/engine/model/material.js';

function unpack (entries, extension = 'zae') {
    const importer = new Importer ();
    const files = new ImporterFileList ();
    const archive = new ImporterFile ('model.' + extension, FileSource.Decompressed, null);
    archive.SetContent (zipSync (entries).buffer);
    files.AddFile (archive);
    importer.DecompressArchives (files, () => {});
    return { importer, files };
}

describe ('ZAE archives', () => {
    it ('preserves authored UV seams and coordinates outside the unit tile', () => {
        const geometry = new THREE.BufferGeometry ();
        geometry.setAttribute ('position', new THREE.Float32BufferAttribute ([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -1, 0, 0], 3));
        const coordinates = [-0.5, 0, 2, 0, 0, 1, 1, 0, 1, 1, 0, 0];
        geometry.setAttribute ('uv', new THREE.Float32BufferAttribute (coordinates, 2));
        const mesh = ConvertThreeGeometryToMesh (geometry, 0, null);
        assert.equal (mesh.TextureUVCount (), 6);
        for (let i = 0; i < 6; i++) {
            assert.deepEqual ([mesh.GetTextureUV (i).x, mesh.GetTextureUV (i).y], coordinates.slice (i * 2, i * 2 + 2));
        }
        assert.deepEqual ([mesh.GetTriangle (1).u0, mesh.GetTriangle (1).u1, mesh.GetTriangle (1).u2], [3, 4, 5]);
    });
    it ('keeps texture placement when replacing an image', () => {
        const previous = new THREE.Texture ();
        previous.offset.set (0.25, -0.5); previous.repeat.set (2, 3);
        previous.center.set (0.5, 0.5); previous.rotation = 0.75;
        previous.wrapS = THREE.MirroredRepeatWrapping; previous.flipY = false;
        previous.updateMatrix ();
        const replacement = new THREE.Texture ();
        const original = new TextureMap ();
        PreserveTextureMapping (previous, replacement, original);
        assert.deepEqual (replacement.matrix.elements, previous.matrix.elements);
        assert.deepEqual (replacement.offset.toArray (), previous.offset.toArray ());
        assert.deepEqual (replacement.repeat.toArray (), previous.repeat.toArray ());
        assert.equal (replacement.flipY, false);
        assert.equal (replacement.wrapS, previous.wrapS);
        assert.deepEqual ([original.scale.x, original.scale.y, original.rotation], [2, 3, 0.75]);
    });
    it ('selects the manifest model and exposes bundled textures', () => {
        const { importer, files } = unpack ({
            'manifest.xml' : strToU8 ('<?xml version="1.0"?><dae_root>models/bottle &amp; cap.dae</dae_root>'),
            'models/bottle & cap.dae' : strToU8 ('model'),
            'preview.dae' : strToU8 ('preview'),
            'extra.obj' : strToU8 ('extra'),
            'textures/label.jpg' : new Uint8Array ([1, 2, 3])
        });
        assert.deepEqual (importer.GetImportableFiles (files).map (entry => entry.file.name), ['bottle & cap.dae']);
        assert.deepEqual (new Uint8Array (files.FindFileByPath ('label.jpg').content), new Uint8Array ([1, 2, 3]));
    });
    it ('supports archives without a manifest', () => {
        const { importer, files } = unpack ({ 'bottle.dae' : strToU8 ('model') });
        assert.equal (importer.GetImportableFiles (files)[0].file.name, 'bottle.dae');
    });
    it ('rejects a manifest pointing at a missing model', () => {
        assert.throws (() => unpack ({ 'manifest.xml' : strToU8 ('<dae_root>missing.dae</dae_root>') }), /missing/);
    });
    it ('keeps ordinary ZIP model selection', () => {
        const { importer, files } = unpack ({ 'a.dae' : strToU8 ('a'), 'b.obj' : strToU8 ('b') }, 'zip');
        assert.equal (importer.GetImportableFiles (files).length, 2);
    });
    it ('reports corrupt archives through the error callback', () => {
        const importer = new Importer ();
        const files = new ImporterFileList ();
        const archive = new ImporterFile ('broken.zae', FileSource.Decompressed, null);
        archive.SetContent (new Uint8Array ([1, 2, 3]).buffer);
        files.AddFile (archive);
        let failed = false;
        importer.DecompressArchives (files, () => assert.fail ('Unexpected success'), (file, message) => {
            failed = true;
            assert.equal (file.name, 'broken.zae');
            assert.ok (message);
        });
        assert.ok (failed);
    });
});
