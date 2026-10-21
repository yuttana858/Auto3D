import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { OpenSessionArchive } from '../../source/website/sessionarchive.js';
await mkdir ('work', { recursive : true });
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); page.setDefaultTimeout (60000);
    const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'surface-relief-test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html');
    await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { console.log ('Checking', id); const result = await page.evaluate (async ({ id, args }) => { for (let retry = 0; retry < 120; retry++) { const response = await Auto3D.execute (id, args); if (response.error?.message !== 'The viewer is busy. Retry after loading completes.') { return response; } await new Promise (resolve => setTimeout (resolve, 250)); } return { ok : false, error : 'Viewer remained busy' }; }, { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    await call ('packaging.fefco.preset', { code : '0201', length : 160, width : 120, height : 100, thickness : 3, closure : 'closed' });
    const cad = await call ('packaging.inspect'); const measurements = await call ('packaging.measurements.inspect');
    const liner = (await call ('material.list')).find (m => m.name === 'Natural kraft liner');
    await call ('material.surface.relief', { index : liner.index, grain : .4, flute : .4, cycles : 8 });
    await call ('ui.materials'); await page.getByLabel ('Material', { exact : true }).selectOption ({ label : liner.name });
    await page.getByRole ('button', { name : 'Preview Bump texture', exact : true }).click (); await page.locator ('.surface_texture_dialog:not(.popup_closing) .surface_relief_designer:not(.surface_varnish_designer) summary').click ();
    await page.getByLabel ('Tile U', { exact : true }).fill ('1.5'); await page.getByLabel ('Tile U', { exact : true }).press ('Tab'); assert.equal ((await call ('material.texture.inspect', { index : liner.index, slot : 'bumpMap' })).tileU, 1.5);
    await page.getByLabel ('Die impression', { exact : true }).selectOption ('emboss');
    await page.getByLabel ('Impression strength', { exact : true }).fill ('0.9');
    await page.getByLabel ('Mask size in tile', { exact : true }).fill ('0.8');
    const uri = await page.evaluate (() => {
        const canvas = document.createElement ('canvas'); canvas.width = canvas.height = 512; const ctx = canvas.getContext ('2d');
        ctx.strokeStyle = 'white'; ctx.lineWidth = 16; ctx.strokeRect (48, 148, 416, 216);
        ctx.fillStyle = 'white'; ctx.font = 'bold 82px sans-serif'; ctx.textAlign = 'center'; ctx.fillText ('PRESS', 256, 287); return canvas.toDataURL ();
    });
    await page.getByLabel ('Impression mask', { exact : true }).setInputFiles ({ name : 'press-die.png', mimeType : 'image/png', buffer : Buffer.from (uri.split (',')[1], 'base64') });
    assert.equal (await page.getByLabel ('Impression strength', { exact : true }).inputValue (), '0.9');
    assert.equal (await page.getByLabel ('Mask size in tile', { exact : true }).inputValue (), '0.8');
    await page.getByRole ('button', { name : 'Apply surface relief', exact : true }).click ();
    for (let retry = 0; retry < 120; retry++) { if ((await call ('material.list'))[liner.index].surfaceRelief?.impression === 'emboss') { break; } await page.waitForTimeout (250); }
    let material = (await call ('material.list'))[liner.index]; assert.equal (material.reliefMode, 'bump'); assert.equal (material.surfaceRelief.impressionStrength, .9); assert.ok (material.maps.impressionMap);
    await page.locator ('.surface_texture_dialog:not(.popup_closing) .surface_relief_designer:not(.surface_varnish_designer) summary').click (); await page.screenshot ({ path : 'work/surface-relief-controls.png' });
    await page.getByRole ('button', { name : 'Close Bump texture', exact : true }).click ();
    await call ('history.undo'); assert.equal ((await call ('material.list'))[liner.index].surfaceRelief.impression, 'off');
    await call ('history.redo'); assert.equal ((await call ('material.list'))[liner.index].surfaceRelief.impression, 'emboss');
    await call ('material.surface.relief', { index : liner.index, impression : 'deboss' });
    material = (await call ('material.list'))[liner.index]; assert.equal (material.surfaceRelief.impression, 'deboss');
    assert.equal (material.maps.diffuseMap, liner.maps.diffuseMap); assert.equal (material.maps.normalMap, liner.maps.normalMap);
    await page.getByRole ('button', { name : 'Preview Gloss / roughness texture', exact : true }).click ();
    await page.locator ('.surface_texture_dialog:not(.popup_closing) .surface_varnish_designer summary').click (); await page.getByLabel ('Varnish gloss', { exact : true }).fill ('0.97');
    await page.getByLabel ('Varnish mask', { exact : true }).setInputFiles ({ name : 'press-varnish.png', mimeType : 'image/png', buffer : Buffer.from (uri.split (',')[1], 'base64') });
    await page.getByRole ('button', { name : 'Apply spot varnish', exact : true }).click ();
    for (let retry = 0; retry < 120; retry++) { if ((await call ('material.list'))[liner.index].varnishSettings?.gloss === .97) { break; } await page.waitForTimeout (250); }
    assert.equal ((await call ('material.list'))[liner.index].varnishSettings.gloss, .97);
    await page.locator ('.surface_texture_dialog:not(.popup_closing) .surface_varnish_designer summary').click (); await page.screenshot ({ path : 'work/spot-varnish-controls.png' });
    await page.getByRole ('button', { name : 'Close Gloss / roughness texture', exact : true }).click ();
    await call ('history.undo'); assert.equal ((await call ('material.list'))[liner.index].varnishSettings, null); await call ('history.redo');
    assert.deepEqual (await call ('packaging.inspect'), cad); assert.deepEqual (await call ('packaging.measurements.inspect'), measurements);
    await page.evaluate (() => { window.showSaveFilePicker = undefined; }); await call ('ui.save'); await page.getByLabel ('Save name', { exact : true }).fill ('Corrugated die impressions');
    const download = page.waitForEvent ('download'); await page.getByRole ('button', { name : 'Save session file', exact : true }).click ();
    const reopened = OpenSessionArchive (await readFile (await (await download).path ())).document;
    const saved = reopened.model.materials.find (m => m.name === liner.name);
    assert.equal (saved.surfaceRelief.impression, 'deboss'); assert.equal (saved.surfaceRelief.maskScale, .8); assert.ok (saved.impressionMap.buffer.byteLength); assert.ok (saved.bumpMap.buffer.byteLength); assert.equal (saved.varnishSettings.gloss, .97); assert.ok (saved.varnishMaskMap.buffer.byteLength); assert.ok (saved.varnishBaseRoughnessMap.buffer.byteLength);
    await page.getByRole ('button', { name : 'Close Save session', exact : true }).click ();
    await page.setViewportSize ({ width : 390, height : 844 }); await call ('ui.materials'); assert.equal (await page.locator ('.surface_map_card[data-map=displacementMap]').count (), 0); await page.getByRole ('button', { name : 'Preview Bump texture', exact : true }).click (); await page.locator ('.surface_texture_dialog:not(.popup_closing) .surface_relief_designer:not(.surface_varnish_designer) summary').click ();
    assert.equal (await page.locator ('.surface_texture_dialog:not(.popup_closing)').evaluate (n => n.scrollWidth <= n.clientWidth + 1), true);
    await page.screenshot ({ path : 'work/surface-relief-mobile.png' });
    assert.deepEqual (errors, []); console.log ('Surface relief/varnish: texture-window UVs and UI mask upload, emboss/deboss, preserved artwork, Undo/Redo, exact CAD/measurements, worker archive and mobile layout passed.');
} finally { await browser.close (); }
