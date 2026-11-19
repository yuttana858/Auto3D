import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Isolated host-service integration: real CAD, import, rasterization and archive
// validation; scene generation is a fixture callback and is covered separately.
const root = process.cwd (), browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox'] });
try {
    const page = await browser.newPage (); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('https://label-cad.test/**', async route => {
        const pathname = new URL (route.request ().url ()).pathname;
        if (pathname === '/') { return route.fulfill ({ contentType : 'text/html', body : '<!doctype html><title>Label CAD integration</title><script type="importmap">{"imports":{"fflate":"/node_modules/fflate/esm/browser.js"}}</script>' }); }
        const file = path.resolve (root, '.' + pathname); assert.ok (file.startsWith (root + path.sep));
        return route.fulfill ({ contentType : 'text/javascript', body : await readFile (file) });
    });
    await page.goto ('https://label-cad.test/');
    const results = await page.evaluate (async () => {
        const [{ PrimaryLabelCAD }, { PrimaryProductsArtwork }, { DefaultProductDraft }, { GetArtworkZones }, { ProductDefinition, ValidateProductDefinition }, { NewLabelCAD, LabelCADSVG }, { RenderLabelSVG }] = await Promise.all ([
            import ('/source/website/primarylabelcad.js'), import ('/source/website/primaryproductsartwork.js'), import ('/modules/primary-products/src/state.js'), import ('/modules/primary-products/src/zones.js'), import ('/modules/primary-products/src/definition.js'), import ('/modules/primary-products/src/labelcad.js'), import ('/source/website/primarylabelrenderer.js')
        ]);
        const require = (condition, message) => { if (!condition) { throw new Error (message); } };
        const rejects = async (action, pattern) => { try { await action (); } catch (error) { require (pattern.test (error.message), 'Unexpected error: ' + error.message); return error.message; } throw new Error ('Expected operation to reject.'); };
        const fixture = () => {
            const history = [], editor = { document : {}, selected : { id : 'bottle-1' }, readOnly : false, busy : false, history : { Push : step => history.push (step) } };
            editor.packaging = { OpenExternal : adapter => { editor.adapter = adapter; editor.packaging.externalProfile = adapter; return { opened : true, interactive : true }; }, Refresh : () => {} };
            const panel = { website : { sessionEditor : editor, auth : { user : { id : 'label-owner' } }, accountReady : true }, draft : DefaultProductDraft (), artworkTarget : 'bottle-1', profileEditor : { open : false }, Refresh : () => {}, applyCount : 0 };
            panel.Blocked = () => editor.readOnly || editor.busy || !panel.website.auth?.user || panel.website.accountReady === false;
            panel.artwork = new PrimaryProductsArtwork (panel); panel.cad = new PrimaryLabelCAD (panel);
            // Mirror the host transaction boundary without importing UI/Three.js.
            panel.ChangeArtwork = async action => {
                const entries = panel.artwork.entries, resources = new Map (panel.artwork.resources), document = editor.document, owner = panel.website.auth.user?.id, selected = editor.selected?.id;
                try { const result = await action (); if (panel.artworkTarget === editor.selected?.id) { await panel.ApplyArtwork (); } return result; }
                catch (error) { if (document === editor.document && owner === panel.website.auth.user?.id && selected === editor.selected?.id) { panel.artwork.entries = entries; panel.artwork.resources = resources; } throw error; }
            };
            panel.ApplyArtwork = async () => { if (panel.failApply) { throw new Error ('Fixture scene generation failed.'); } panel.applyCount++; panel.saved = ProductDefinition (panel.draft, panel.artwork.entries); };
            return { panel, editor, history };
        };
        const pixels = async buffer => {
            const bitmap = await createImageBitmap (new Blob ([buffer], { type : 'image/png' }));
            try {
                const canvas = document.createElement ('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext ('2d'); context.drawImage (bitmap, 0, 0);
                const at = (u, v) => [...context.getImageData (Math.floor ((bitmap.width - 1) * u), Math.floor ((bitmap.height - 1) * v), 1, 1).data];
                return { width : bitmap.width, height : bitmap.height, center : at (.5, .5), corner : at (.01, .01), middleTop : at (.5, .05), middleLeft : at (.1, .5) };
            } finally { bitmap.close (); }
        };

        const blank = fixture (), cap = GetArtworkZones (blank.panel.draft).find (zone => zone.id === 'cap-top');
        const opened = await blank.panel.cad.Open ({ zone : 'cap-top' });
        require (opened.zone === 'cap-top' && opened.profile.paths[0].points.length === 64, 'Cap CAD must start with a circular cut outline.');
        require (blank.panel.artwork.entries.length === 0 && blank.panel.applyCount === 0, 'Opening label CAD must leave 3D artwork untouched.');
        const design = blank.editor.adapter.design (); design.paths.find (item => item.type === 'artwork').fill = '#ee2233'; blank.editor.adapter.change (design);
        require (blank.history.length === 1, 'A CAD change must create one history entry.');
        blank.history[0].undo (); require (blank.panel.cad.Inspect ().profile.paths[1].fill === '#ffffff', 'CAD Undo must restore the previous paint.');
        blank.history[0].redo (); require (blank.panel.cad.Inspect ().profile.paths[1].fill === '#ee2233', 'CAD Redo must restore the edit.');
        const applied = await blank.editor.adapter.apply (), entry = blank.panel.artwork.entries[0], resource = blank.panel.artwork.resources.get (entry.resourceId), image = await pixels (resource.buffer);
        require (applied.applied && blank.panel.applyCount === 1 && entry.zone === 'cap-top' && blank.panel.draft.labelZone === 'cap-top', 'Applying cap CAD must target its own zone and invoke scene application once.');
        require (entry.widthMm === cap.widthMm * .8 && entry.heightMm === cap.heightMm * .8 && entry.cad.widthMm === entry.widthMm, 'CAD physical dimensions must survive raster import unchanged.');
        require (entry.source === undefined && entry.cad.paths[1].fill === '#ee2233' && blank.panel.cad.Inspect ().applied, 'The saved label must retain editable CAD and its applied state.');
        require (image.corner[3] === 0 && image.center[3] === 255 && image.center[0] === 238, 'The rendered cap PNG must clip the corners and retain center artwork.');
        const saved = ValidateProductDefinition (JSON.parse (JSON.stringify (blank.panel.saved))), reopened = fixture ();
        reopened.panel.draft = saved.draft; reopened.panel.artwork.Load (saved, { materials : [{ diffuseMap : { name : entry.resourceId + '.png', buffer : resource.buffer } }] });
        const reopenedResult = await reopened.panel.cad.Open ({ zone : 'cap-top' });
        require (reopenedResult.conversion.kind === 'saved-cad' && JSON.stringify (reopenedResult.profile) === JSON.stringify (entry.cad), 'Saved CAD must reopen without tracing or changing paths.');

        const hole = NewLabelCAD (40, 40); hole.paths.push ({ id : 'hole', type : 'cut', closed : true, points : [[-5, -5], [5, -5], [5, 5], [-5, 5]] }, { id : 'ink', type : 'artwork', closed : true, points : hole.paths[0].points, fill : '#2244ee', stroke : 'none', strokeWidth : 0 });
        const holeImage = await pixels ((await RenderLabelSVG (LabelCADSVG (hole))).buffer);
        require (holeImage.center[3] === 0 && holeImage.middleLeft[3] === 255, 'Even-odd cut contours must create an actual transparent hole.');

        const vector = fixture (); await vector.panel.artwork.SVG ({ svg : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#336699"/></svg>' });
        const priorVector = JSON.stringify (vector.panel.artwork.entries), vectorOpen = await vector.panel.cad.Open ({ zone : 'front' });
        require (vectorOpen.conversion.kind === 'svg-paths' && !vectorOpen.conversion.approximate && vectorOpen.profile.paths[1].fill === '#336699', 'Solid SVG shapes must become editable native vectors.');
        require (JSON.stringify (vector.panel.artwork.entries) === priorVector, 'Preparing vectors must leave source artwork unchanged until Apply.');
        vector.panel.failApply = true; const priorResources = [...vector.panel.artwork.resources.keys ()];
        await rejects (() => vector.panel.cad.Apply (), /scene generation failed/);
        require (JSON.stringify (vector.panel.artwork.entries) === priorVector && JSON.stringify ([...vector.panel.artwork.resources.keys ()]) === JSON.stringify (priorResources), 'Failed scene application must restore the original label and resources through the host transaction.');

        const text = fixture (); await text.panel.artwork.Text ({ text : 'CAP', fontSize : 72 });
        const textOpen = await text.panel.cad.Open ({ zone : 'front' });
        require (textOpen.conversion.kind === 'traced-image' && textOpen.conversion.approximate && textOpen.profile.paths.length <= 81 && /approximation/i.test (text.editor.adapter.description), 'Text tracing must disclose its bounded approximation before Apply.');
        const raster = fixture (); await raster.panel.artwork.Import (new File ([resource.buffer], 'Artwork.png', { type : 'image/png' }));
        const rasterOpen = await raster.panel.cad.Open ({ zone : 'front' });
        require (rasterOpen.conversion.kind === 'traced-image' && rasterOpen.conversion.approximate, 'Raster artwork must use the disclosed tracing path.');

        const guarded = fixture (); await guarded.panel.cad.Open ({ zone : 'front' });
        guarded.editor.readOnly = true; await rejects (() => guarded.panel.cad.Apply (), /target, account or session changed/); guarded.editor.readOnly = false;
        guarded.editor.selected = { id : 'other-bottle' }; await rejects (() => guarded.panel.cad.Apply (), /target, account or session changed/); guarded.editor.selected = { id : 'bottle-1' };
        guarded.panel.website.auth.user = { id : 'another-owner' }; await rejects (() => guarded.panel.cad.Apply (), /target, account or session changed/); guarded.panel.website.auth.user = { id : 'label-owner' };
        guarded.panel.draft = { ...guarded.panel.draft, heightMm : 220 }; await rejects (() => guarded.panel.cad.Apply (), /product changed/);

        // Pause a real decoder to change the document while image tracing awaits.
        const delayed = fixture (); await delayed.panel.artwork.Text ({ text : 'Pending' });
        const nativeBitmap = globalThis.createImageBitmap; let resume, started;
        const began = new Promise (resolve => { started = resolve; });
        globalThis.createImageBitmap = async (...args) => { const bitmap = await nativeBitmap (...args); await new Promise (resolve => { resume = resolve; started (); }); return bitmap; };
        let delayedError;
        try { const pending = delayed.panel.cad.Open ({ zone : 'front' }); await began; delayed.editor.document = {}; resume (); delayedError = await rejects (() => pending, /target, account or session changed/); }
        finally { globalThis.createImageBitmap = nativeBitmap; }
        require (!delayed.editor.adapter && !delayed.panel.cad.Inspect ().available, 'Stale asynchronous conversion must not open or replace the CAD target.');
        for (const change of [target => { target.editor.readOnly = true; }, target => { target.editor.selected = { id : 'other-target' }; }]) {
            const pendingTarget = fixture (); await pendingTarget.panel.cad.Open ({ zone : 'cap-top' });
            let release, entered; const enteredDecoder = new Promise (resolve => { entered = resolve; });
            globalThis.createImageBitmap = async (...args) => { const bitmap = await nativeBitmap (...args); await new Promise (resolve => { release = resolve; entered (); }); return bitmap; };
            try {
                const pendingApply = pendingTarget.panel.cad.Apply (); await enteredDecoder; change (pendingTarget); release ();
                await rejects (() => pendingApply, /product, account or session changed/);
            } finally { globalThis.createImageBitmap = nativeBitmap; }
            require (pendingTarget.panel.artwork.entries.length === 0 && pendingTarget.panel.artwork.resources.size === 0 && pendingTarget.panel.applyCount === 0, 'Read-only or selection changes during rasterization must prevent label and scene mutation.');
        }
        for (const clear of [false, true]) {
            const racing = fixture (); await racing.panel.artwork.Text ({ text : 'Earlier conversion' }); await racing.panel.cad.Open ({ zone : 'cap-top' });
            let release, entered; const decoding = new Promise (resolve => { entered = resolve; });
            globalThis.createImageBitmap = async (...args) => { const bitmap = await nativeBitmap (...args); await new Promise (resolve => { release = resolve; entered (); }); return bitmap; };
            try {
                const earlier = racing.panel.cad.Open ({ zone : 'front' }); await decoding;
                if (clear) { racing.panel.cad.Clear (); require (!racing.panel.cad.Inspect ().available, 'Clear must immediately hide the active CAD profile.'); }
                else { await racing.panel.cad.Open ({ zone : 'back' }); }
                release (); await rejects (() => earlier, /newer label CAD request/);
            } finally { globalThis.createImageBitmap = nativeBitmap; }
            if (clear) { require (!racing.panel.cad.Inspect ().available && racing.editor.packaging.externalProfile === null, 'Clear must invalidate an older conversion and release its matching workspace binding.'); }
            else { require (racing.panel.cad.Inspect ().zone === 'back' && racing.editor.adapter.title === 'Label CAD · back', 'A late earlier conversion must preserve the newer CAD target and adapter.'); }
        }
        const synchronized = fixture (); let syncs = 0;
        synchronized.panel.SyncSelected = () => { syncs++; synchronized.panel.draft = { ...synchronized.panel.draft, labelZone : 'cap-top' }; };
        require ((await synchronized.panel.cad.Open ()).zone === 'cap-top' && syncs === 1, 'Opening the default zone must synchronize the selected product first.');
        return { capPixels : image, holePixels : holeImage, vectorKind : vectorOpen.conversion.kind, textKind : textOpen.conversion.kind, rasterKind : rasterOpen.conversion.kind, savedPaths : reopenedResult.profile.paths.length, guard : delayedError };
    });
    assert.equal (results.capPixels.corner[3], 0); assert.equal (results.holePixels.center[3], 0); assert.equal (results.savedPaths, 2); assert.deepEqual (errors, []);
    console.log ('Primary label CAD services, raster clipping, persistence and guards: pass');
} finally { await browser.close (); }
