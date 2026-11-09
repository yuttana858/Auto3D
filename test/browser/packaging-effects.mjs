import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { OpenSessionArchive } from '../../source/website/sessionarchive.js';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); page.setDefaultTimeout (180000); const errors = [];
    page.on ('pageerror', (error) => errors.push (error.message)); page.on ('console', (message) => { if (message.type () === 'error' && /shader|WebGL|program/i.test (message.text ())) { errors.push (message.text ()); } });
    await page.route ('**/api/auth/**', (route) => route.fulfill ({ json : { user : { id : 'packaging-user', email : 'user@example.com', name : 'User' } } }));
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 2 }, folders : [] } }));
    await page.route ('**/api/accounts/**', (route) => route.fulfill ({ json : { isAdmin : false, requests : [] } }));
    let savedProfile = null; await page.route ('**/api/personal/items', async (route) => { if (route.request ().method () !== 'POST') { return route.fulfill ({ json : [] }); } const request = route.request (); const form = await new Request (request.url (), { method : 'POST', headers : { 'Content-Type' : request.headers ()['content-type'] }, body : request.postDataBuffer () }).formData (); assert.equal (form.get ('objects'), '0'); savedProfile = OpenSessionArchive (await form.get ('archive').arrayBuffer ()).document; const png = new Uint8Array (await form.get ('thumbnail').slice (0, 8).arrayBuffer ()); assert.deepEqual ([...png], [137, 80, 78, 71, 13, 10, 26, 10]); return route.fulfill ({ status : 201, json : { id : '00000000-0000-4000-8000-000000000001', name : form.get ('name'), category : form.get ('category'), kind : 'session', objects : 0 } }); }); await page.route ('**/api/environments', (route) => route.fulfill ({ json : [] }));
    await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' }); await page.locator ('#startup_splash').waitFor ({ state : 'detached' }); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked')); /* the welcome screen can close before sign-in is restored */
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    await call ('ui.ai.packaging'); await page.getByRole ('button', { name : 'Open packaging designer', exact : true }).click (); const dialog = page.getByRole ('dialog', { name : 'Packaging', exact : true }); await dialog.waitFor ();
    // Start with real canvas clicks and finish through the UI.
    const canvas = dialog.getByLabel ('Packaging point-to-point drawing'); const bounds = await canvas.boundingBox ();
    for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7]]) { await page.mouse.click (bounds.x + bounds.width * x, bounds.y + bounds.height * y); }
    await dialog.getByRole ('button', { name : 'Close outline', exact : true }).click (); let design = await call ('packaging.inspect'); assert.equal (design.paths.length, 1); assert.equal (design.paths[0].closed, true);
    await call ('packaging.path.delete', { id : design.paths[0].id });
    for (const [x, y] of [[0, 0], [100, 0], [100, 60], [0, 60]]) { await dialog.getByLabel ('Point X', { exact : true }).fill (String (x)); await dialog.getByLabel ('Point Y', { exact : true }).fill (String (y)); await dialog.getByRole ('button', { name : 'Add point', exact : true }).click (); }
    await dialog.getByRole ('button', { name : 'Close outline', exact : true }).click ();
    await dialog.getByLabel ('Line type', { exact : true }).selectOption ('score');
    for (const [x, y] of [[50, 0], [50, 60]]) { await dialog.getByLabel ('Point X', { exact : true }).fill (String (x)); await dialog.getByLabel ('Point Y', { exact : true }).fill (String (y)); await dialog.getByRole ('button', { name : 'Add point', exact : true }).click (); }
    await dialog.getByRole ('button', { name : 'Finish open path', exact : true }).click (); design = await call ('packaging.inspect'); assert.equal (design.paths.length, 2); assert.equal (design.paths[1].type, 'score');
    await dialog.getByLabel ('Board caliper preset').selectOption ('B flute (nominal)'); assert.equal ((await call ('packaging.inspect')).thickness, 3);
    await dialog.getByLabel ('Board thickness').fill ('3.2'); await dialog.getByLabel ('Board thickness').dispatchEvent ('change'); assert.equal ((await call ('packaging.inspect')).thickness, 3.2);
    await call ('preferences.units', { units : 'standard' }); assert.ok (Math.abs (Number (await dialog.getByLabel ('Grid snap').inputValue ()) - 5 / 25.4) < 0.000001); assert.ok (Math.abs (Number (await dialog.getByLabel ('Board thickness').inputValue ()) - 3.2 / 25.4) < 0.000001);
    await call ('preferences.units', { units : 'metric' });
    await dialog.locator ('details').getByText ('Edit selected path points').click (); await dialog.getByLabel ('Path point 2 Y').fill ('55'); await dialog.getByLabel ('Path point 2 Y').dispatchEvent ('change'); assert.equal ((await call ('packaging.inspect')).paths[1].points[1][1], 55); await call ('history.undo'); assert.equal ((await call ('packaging.inspect')).paths[1].points[1][1], 60);
    for (const format of ['SVG', 'DXF']) { const download = page.waitForEvent ('download'); await dialog.getByRole ('button', { name : 'Download ' + format, exact : true }).click (); const file = await download; const text = await readFile (await file.path (), 'utf8'); assert.ok (text.includes (format === 'SVG' ? 'width="100mm"' : '$INSUNITS')); }
    await call ('library.account.save', { name : 'Flat packaging profile', kind : 'session' }); assert.equal (savedProfile.objects.length, 0); assert.equal (savedProfile.packaging.paths.length, 2); assert.equal (savedProfile.packaging.thickness, 3.2); await call ('packaging.view.fit'); await page.screenshot ({ path : 'work/packaging-editor.png' }); await dialog.getByRole ('button', { name : 'Extrude board into scene', exact : true }).click (); await dialog.waitFor ({ state : 'detached' }); let scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 1);
    if (await page.locator ('#data_panel_toggle').getAttribute ('aria-expanded') === 'false') { await page.locator ('#data_panel_toggle').click (); }
    assert.ok (Math.abs (Number (await page.getByLabel ('H dimension in mm').inputValue ()) - 3.2) < 0.00001);
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 0); await call ('history.redo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    await call ('packaging.open'); await call ('packaging.load_selected'); assert.equal ((await call ('packaging.inspect')).paths.length, 2); await page.getByRole ('button', { name : 'Close Packaging', exact : true }).click (); console.log ('Packaging canvas, precise entry, score assignment, editable caliper, units, downloads, extrusion and Undo/Redo passed.');
    // Raise a volumetric board so the shadow floor and reflection can be checked.
    await call ('packaging.board', { thickness : 50, units : 'mm' }); await call ('packaging.extrude'); await call ('object.array', { width : 2, length : 1, height : 1, autoGroup : true }); assert.equal ((await call ('scene.inspect')).objects.length, 3); await call ('view.fit');
    const pixels = async () => {
        const png = await page.locator ('#main_viewer canvas').first ().screenshot ();
        return page.evaluate (async (base64) => { const source = new Image (); source.src = 'data:image/png;base64,' + base64; await source.decode (); const image = document.createElement ('canvas'); image.width = source.width; image.height = source.height; const context = image.getContext ('2d'); context.drawImage (source, 0, 0); const bytes = context.getImageData (0, 0, image.width, image.height).data; let board = 0; for (let i = 0; i < bytes.length; i += 4) { if (bytes[i] > 40 && bytes[i] > bytes[i + 1] * 1.08 && bytes[i + 1] > bytes[i + 2] * 1.1) { board++; } } return board; }, png.toString ('base64'));
    };
    for (const environment of ['default', 'studio_small_09', 'shanghai_bund']) {
        await call ('lighting.effects', { shadows : false, floorReflection : false, modelReflections : false });
        await call ('lighting.restore', environment === 'default' ? { mode : 'default' } : { mode : 'hdri', environment, brightness : 1.4, background : false }); const baseline = await pixels (); assert.ok (baseline > 1000, environment + ' baseline board visible');
        for (const options of [{ shadows : true }, { shadows : false, modelReflections : true }, { shadows : true, modelReflections : true, floorReflection : true }]) { await call ('lighting.effects', options); const visible = await pixels (); assert.ok (visible > baseline * 0.6, environment + ' retains visible board: ' + visible + '/' + baseline); }
        await page.screenshot ({ path : 'work/render-' + environment + '.png' });
    }
    await call ('lighting.restore', { mode : 'hdri', environment : 'shanghai_bund', brightness : 1.4, background : true }); await page.screenshot ({ path : 'work/render-night-background.png' });
    assert.deepEqual (errors, []); console.log ('Shadows and additive reflections retain model visibility with default, studio and Shanghai HDRI; no shader errors.');
} finally { await browser.close (); }
