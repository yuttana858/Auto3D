import { ValidateMacroName, ValidateMacroShape } from './macroshape.js';

// Shared macro library (account API) plus macros saved earlier only in this browser.
// Every signed-in account sees every shared macro; the server lets only the account that
// saved a macro, or an administrator, replace or delete it. Browser-only macros stay listed
// (location 'browser') until someone moves them to the shared library with UploadBrowser.
// Saves never fall back to browser storage when the account API fails.
export const BrowserMacroKey = 'auto3d-macros-v1';

export function BrowserMacros ()
{
    let macros; try { macros = JSON.parse (globalThis.localStorage?.getItem (BrowserMacroKey) || '[]'); } catch { throw new Error ('Invalid macro storage in this browser.'); }
    if (!Array.isArray (macros)) { throw new Error ('Invalid macro storage in this browser.'); }
    return macros.filter (item => item && typeof item.name === 'string' && item.macro);
}
function StoreBrowserMacros (macros) { globalThis.localStorage?.setItem (BrowserMacroKey, JSON.stringify (macros)); }
const Same = (a, b) => a.trim ().toLowerCase () === b.trim ().toLowerCase ();

export class MacroLibrary
{
    constructor (website) { this.website = website; }
    async Request (method, body)
    {
        const owner = this.website.auth?.user?.id; if (!owner || this.website.accountReady === false) { throw new Error ('Sign in to use shared macros.'); }
        let response; try {
            response = await fetch ('/api/macros', { method, credentials : 'same-origin', headers : { 'X-Auto3D-Account' : owner, ...(body ? { 'Content-Type' : 'application/json' } : {}) }, ...(body ? { body : JSON.stringify (body) } : {}) });
        } catch { throw new Error ('Shared macro library unavailable. Check the connection and retry.'); }
        if (this.website.auth?.user?.id !== owner) { throw new Error ('Account changed during the macro request.'); }
        let result = null; try { result = await response.json (); } catch { /* Handled below. */ }
        if (!response.ok) { throw Object.assign (new Error (result?.error || 'Shared macro library unavailable.'), { status : response.status }); }
        if (!result) { throw new Error ('Shared macro library unavailable.'); }
        return result;
    }
    // Shared macros first (by name), then browser-only macros whose names are not shared.
    async List ()
    {
        let shared = [], isAdmin = false, available = true, error = null;
        try { const result = await this.Request ('GET'); shared = result.macros; isAdmin = result.isAdmin === true; }
        catch (failure) { if (/Sign in|Account changed/.test (failure.message)) { throw failure; } available = false; error = failure.message; }
        const local = BrowserMacros ().filter (item => !shared.some (entry => Same (entry.name, item.name)));
        const macros = [
            ...shared.map (item => ({ ...item, location : 'shared' })),
            ...local.map (item => ({ name : item.name, macro : item.macro, location : 'browser', savedBy : 'This browser', mine : true, canEdit : true, revision : null, updatedAt : null }))
        ];
        return { available, isAdmin, error, macros };
    }
    async Find (name)
    {
        const library = await this.List (), item = library.macros.find (entry => Same (entry.name, name));
        if (!item) { throw new Error ('No saved macro named “' + name.trim () + '”.' + (library.available ? '' : ' ' + library.error)); }
        return item;
    }
    async Save (name, macro, revision = null)
    {
        ValidateMacroName (name); ValidateMacroShape (macro);
        const saved = await this.Request ('PUT', { name, macro, ...(revision ? { revision } : {}) });
        // A shared copy replaces any browser-only copy with the same name.
        StoreBrowserMacros (BrowserMacros ().filter (item => !Same (item.name, name)));
        return saved;
    }
    async Delete (name)
    {
        const item = await this.Find (name);
        if (item.location === 'browser') { StoreBrowserMacros (BrowserMacros ().filter (entry => !Same (entry.name, item.name))); return { deleted : item.name, location : 'browser' }; }
        if (!item.canEdit) { throw new Error ('Only ' + item.savedBy + ', who saved “' + item.name + '”, or an administrator can delete it.'); }
        const result = await this.Request ('DELETE', { name : item.name });
        return { deleted : result.deleted, location : 'shared' };
    }
    // Explicit user action: copy browser-only macros to the shared library. Names that already
    // exist in the library are skipped, never overwritten; uploaded ones leave browser storage.
    async UploadBrowser ()
    {
        const library = await this.List ();
        if (!library.available) { throw new Error (library.error || 'Shared macro library unavailable.'); }
        const uploaded = [], skipped = [];
        for (const item of library.macros.filter (entry => entry.location === 'browser')) {
            try { await this.Save (item.name, item.macro); uploaded.push (item.name); }
            catch (error) { skipped.push ({ name : item.name, reason : error.message }); }
        }
        const shadowed = BrowserMacros ().filter (item => library.macros.some (entry => entry.location === 'shared' && Same (entry.name, item.name))).map (item => ({ name : item.name, reason : 'A shared macro already uses this name; the browser copy was kept.' }));
        return { uploaded, skipped : [...skipped, ...shadowed], remainingInBrowser : BrowserMacros ().length };
    }
}
