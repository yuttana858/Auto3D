import { SetExternalLibraryUrl } from '../engine/import/importerutils.js';

// Resolved while the bundle script runs, when document.currentScript is still available.
const BundleUrl = import.meta.url;

// Libraries the Auto3D site ships beside its bundle instead of loading from a CDN; see THIRD_PARTY_NOTICES.md.
// occt is a directory: the worker script and wasm are resolved inside it.
export const BundledLibraries = Object.freeze ({
    draco3d : 'draco/draco_decoder.js',
    rhino3dm : 'libs/rhino3dm/rhino3dm.min.js',
    webifc : 'libs/web-ifc/web-ifc-api-iife.js',
    occt : 'libs/occt-import-js/'
});

export function UseBundledLibraries (base = BundleUrl)
{
    const urls = {};
    for (const [name, path] of Object.entries (BundledLibraries)) {
        urls[name] = new URL (path, base).href;
        SetExternalLibraryUrl (name, urls[name]);
    }
    return urls;
}
