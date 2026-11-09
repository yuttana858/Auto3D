import { SetExternalLibraryUrl } from '../engine/import/importerutils.js';

// Resolved while the bundle script runs, when document.currentScript is still available.
const BundleUrl = import.meta.url;

// Libraries the Auto3D site ships beside its bundle instead of loading from a CDN.
// STEP/IGES/BREP (occt-import-js, LGPL-2.1) and IFC (web-ifc, MPL-2.0) stay on the CDN until their
// redistribution is approved; see THIRD_PARTY_NOTICES.md.
export const BundledLibraries = Object.freeze ({
    draco3d : 'draco/draco_decoder.js',
    rhino3dm : 'libs/rhino3dm/rhino3dm.min.js'
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
