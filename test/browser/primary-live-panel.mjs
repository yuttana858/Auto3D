import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
const root = new URL ('../..', import.meta.url).pathname;
const bundle = await build ({ entryPoints : [root + '/modules/primary-products/src/index.js'], bundle : true, format : 'esm', write : false });
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1000, height : 1400 } }); const errors = []; page.on ('pageerror', e => errors.push (e.message));
    await page.route ('https://primary-ui.test/**', async route => { const path = new URL (route.request ().url ()).pathname; if (path === '/module.js') { return route.fulfill ({ contentType : 'text/javascript', body : bundle.outputFiles[0].text }); } if (path === '/style.css') { return route.fulfill ({ contentType : 'text/css', body : await readFile (root + '/modules/primary-products/src/primary-products.css') }); } return route.fulfill ({ contentType : 'text/html', body : '<link rel="stylesheet" href="/style.css"><div id="panel"></div><div id="profile"></div>' }); });
    await page.goto ('https://primary-ui.test/');
    await page.evaluate (async () => {
        const m = await import ('/module.js'); window.module = m; window.draft = m.UpdateProductDraft (m.DefaultProductDraft (), { details : {} }); window.target = 'a'; window.edits = []; window.cad = []; window.created = 0; window.fits = 0;
        const host = window.host = { inspect : () => ({ ...draft, artwork : [], generationAvailable : true, catalogCategory : 'bottles', catalogOpen : false, liveObjectId : target }), units : () => 'metric', blocked : () => false, liveBlocked : () => false, liveConfigure : async changes => { edits.push ({ id : target, changes }); draft = m.UpdateProductDraft (draft, changes); panel.Refresh (); return { message : 'Updated.' }; }, setDetails : async changes => { draft = m.ProfileChanges (draft, changes); panel.Refresh (); }, configure : () => { throw new Error ('Draft-only callback used'); }, generate : () => { created++; }, fitSelected : () => { fits++; }, openLabelCAD : zone => { cad.push (zone); }, artworkPreview : () => null, catalog : () => {}, openProfile : () => {}, reset : () => {}, update : () => {}, loadSelected : () => {}, openMaterials : () => {} };
        window.panel = new m.PrimaryProductsPanel (host, document.getElementById ('panel'));
    });
    const height = page.getByRole ('spinbutton', { name : 'Product height', exact : true });
    assert.equal (await page.getByRole ('combobox', { name : 'Glass thickness', exact : true }).inputValue (), 'standard');
    await page.getByRole ('button', { name : 'Fit model', exact : true }).click (); assert.equal (await page.evaluate (() => fits), 1);
    await height.fill ('224.5'); await page.waitForFunction (() => draft.heightMm === 224.5); assert.equal (await page.evaluate (() => created), 0); assert.equal (await height.inputValue (), '224.5');
    await height.fill ('2'); await page.waitForTimeout (280); assert.equal (await height.inputValue (), '2'); assert.equal (await height.getAttribute ('aria-invalid'), 'true'); assert.equal (await page.evaluate (() => draft.heightMm), 224.5);
    await height.fill ('225'); await height.press ('Enter'); await page.waitForFunction (() => draft.heightMm === 225); assert.equal (await height.getAttribute ('aria-invalid'), null);
    await height.press ('Tab'); await page.evaluate (() => { draft = module.UpdateProductDraft (draft, { heightMm : 200 }); panel.Refresh (); });
    await height.fill ('225'); await height.press ('Enter'); await page.waitForFunction (() => draft.heightMm === 225);
    await page.getByRole ('combobox', { name : 'Glass thickness', exact : true }).selectOption ('heavy'); await page.waitForFunction (() => draft.details.glassPreset === 'heavy');
    await page.getByRole ('combobox', { name : 'Cap material', exact : true }).selectOption ('aluminum'); await page.waitForFunction (() => draft.details.capMaterial === 'aluminum');
    await page.getByRole ('spinbutton', { name : 'Cap thickness', exact : true }).fill ('1.4'); await page.waitForFunction (() => draft.details.capWallMm === 1.4);
    await page.getByRole ('spinbutton', { name : 'Cap height', exact : true }).fill ('18.5'); await page.waitForFunction (() => draft.bottleShape.capHeightMm === 18.5);
    await page.getByLabel ('Cap color', { exact : true }).evaluate (input => { input.value = '#bf7012'; input.dispatchEvent (new Event ('input', { bubbles : true })); }); await page.waitForFunction (() => draft.details.capColor === '#bf7012');
    assert.equal (await page.getByRole ('button', { name : 'Generate new', exact : true }).count (), 1);
    for (const name of ['front label', 'wrap label', 'back label', 'cap top']) { await page.getByRole ('button', { name : 'Design ' + name + ' in CAD', exact : true }).click (); }
    assert.deepEqual (await page.evaluate (() => cad), ['front', 'wrap', 'back', 'cap-top']);
    await height.fill ('226'); await page.evaluate (() => { target = 'b'; panel.Refresh (); }); await page.waitForTimeout (280); assert.equal (await page.evaluate (() => draft.heightMm), 225); assert.equal (await height.inputValue (), '225');
    await page.evaluate (() => {
        panel.Dispose (); document.getElementById ('panel').replaceChildren ();
        const h = { inspect : () => ({ objectId : target, draft, units : 'metric' }), blocked : () => false, update : async (changes, id) => { if (window.holdProfileUpdate) { window.holdProfileUpdate = false; await new Promise (resolve => { window.releaseProfileUpdate = resolve; }); } else { await new Promise (resolve => setTimeout (resolve, 80)); } if (id !== target) { throw new Error ('Wrong target'); } draft = module.ProfileChanges (draft, changes); return { message : 'Updated' }; }, fitSelected : () => { fits++; }, close : () => {} };
        window.profile = new module.ProductProfileEditor (h, document.getElementById ('profile')); profile.Refresh (h.inspect ());
    });
    const profileHeight = page.getByRole ('spinbutton', { name : 'Profile overall height', exact : true }); await profileHeight.fill ('230.5'); await page.waitForFunction (() => draft.heightMm === 230.5);
    await profileHeight.fill ('240'); await profileHeight.press ('Enter'); await page.getByRole ('combobox', { name : 'Cap material', exact : true }).selectOption ('steel'); await page.waitForFunction (() => draft.heightMm === 240 && draft.details.capMaterial === 'steel');
    await page.getByRole ('combobox', { name : 'Contents type', exact : true }).selectOption ('liquid'); await page.waitForFunction (() => draft.contents?.type === 'liquid');
    await page.evaluate (() => { window.holdProfileUpdate = true; window.releaseProfileUpdate = null; });
    const fill = page.getByRole ('spinbutton', { name : 'Fill height (%)', exact : true }); await fill.fill ('80'); await fill.press ('Enter'); await page.waitForFunction (() => window.releaseProfileUpdate);
    const opacity = page.getByRole ('spinbutton', { name : 'Contents opacity (%)', exact : true }); await opacity.fill ('40'); await opacity.press ('Enter'); await page.evaluate (() => window.releaseProfileUpdate ());
    await page.waitForFunction (() => draft.contents.fillPercent === 80 && draft.contents.opacity === .4);
    await page.evaluate (() => { window.holdProfileUpdate = true; window.releaseProfileUpdate = null; });
    const ior = page.getByRole ('spinbutton', { name : 'Glass IOR', exact : true }); await ior.fill ('1.7'); await ior.press ('Enter'); await page.waitForFunction (() => window.releaseProfileUpdate);
    const glassOpacity = page.getByRole ('spinbutton', { name : 'Glass opacity (%)', exact : true }); await glassOpacity.fill ('25'); await glassOpacity.press ('Enter'); await page.evaluate (() => window.releaseProfileUpdate ());
    await page.waitForFunction (() => draft.optics.ior === 1.7 && draft.optics.opacity === .25);
    await page.getByRole ('button', { name : 'Fit model', exact : true }).click (); assert.equal (await page.evaluate (() => fits), 2);
    await page.setViewportSize ({ width : 390, height : 844 }); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual (errors, []); console.log ('Primary Products UI fixture: live inputs, invalid drafts, glass/cap controls, CAD entries, selection pinning, queued profile edits passed.');
} finally { await browser.close (); }
