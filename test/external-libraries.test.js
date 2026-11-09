import assert from 'node:assert/strict';
import { GetExternalLibraryUrl, SetExternalLibraryUrl } from '../source/engine/import/importerutils.js';
import { BundledLibraries, UseBundledLibraries } from '../source/website/externallibraries.js';

describe ('Self-hosted format libraries', () => {
    const defaults = Object.fromEntries (['rhino3dm', 'webifc', 'draco3d', 'occt'].map (name => [name, GetExternalLibraryUrl (name)]));
    afterEach (() => { for (const [name, url] of Object.entries (defaults)) { SetExternalLibraryUrl (name, url); } });
    it ('keeps CDN defaults for the published engine', () => {
        for (const url of Object.values (defaults)) { assert.match (url, /^https:\/\/cdn\.jsdelivr\.net\/npm\//); }
    });
    it ('points the site at its own Draco and rhino3dm copies beside the bundle', () => {
        const urls = UseBundledLibraries ('https://auto3d.test/o3dv/o3dv.website.min.js?v=abc');
        assert.deepEqual (urls, { draco3d : 'https://auto3d.test/o3dv/draco/draco_decoder.js', rhino3dm : 'https://auto3d.test/o3dv/libs/rhino3dm/rhino3dm.min.js' });
        assert.equal (GetExternalLibraryUrl ('rhino3dm'), urls.rhino3dm); assert.equal (GetExternalLibraryUrl ('draco3d'), urls.draco3d);
        assert.equal (GetExternalLibraryUrl ('occt'), defaults.occt); assert.equal (GetExternalLibraryUrl ('webifc'), defaults.webifc);
        assert.deepEqual (Object.keys (BundledLibraries).sort (), ['draco3d', 'rhino3dm']);
    });
    it ('rejects unknown libraries', () => {
        assert.throws (() => SetExternalLibraryUrl ('evil', 'https://x.test/a.js')); assert.throws (() => SetExternalLibraryUrl ('rhino3dm', ''));
    });
});
