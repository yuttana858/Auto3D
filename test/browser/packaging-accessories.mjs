import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = [];
    page.on ('pageerror', error => errors.push (error.message));
    await page.route ('https://auto3d.test/**', async route => {
        const name = new URL (route.request ().url ()).pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'accessories-ui', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name === '/api/packaging/boards') { return route.fulfill ({ status : 404, json : { error : 'No saved board catalog' } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, JSON.stringify (response)); return response.result; };
    await mkdir ('work/accessories-review', { recursive : true });
    const box = await call ('packaging.fefco.preset', { code : '0201', length : 300, width : 200, height : 150, thickness : 3, closure : 'closed', basis : 'inside' });
    await call ('packaging.tab', { tab : 'accessories' });
    const panel = page.getByRole ('region', { name : 'Packaging Generative', exact : true });
    assert.deepEqual (await panel.getByRole ('tab').allTextContents (), ['Packaging', 'Auto', 'Accessories']);
    assert.equal (await panel.getByRole ('tab', { name : 'Accessories', exact : true }).getAttribute ('aria-selected'), 'true');
    const tab = panel.getByRole ('tabpanel', { name : 'Accessories', exact : true }); await tab.waitFor ();
    assert.equal (await panel.getByRole ('tabpanel', { name : 'Auto', exact : true }).isVisible (), false);
    // The panel reads the carton's engineering inside size, like the dimension tools.
    const state = await call ('packaging.accessories.inspect', { columns : 3, rows : 2 }); assert.equal (state.available, true, state.reason); assert.equal (state.cartonId, box.objectId);
    assert.match (await tab.getByRole ('region', { name : 'Carton inside size', exact : true }).textContent (), /L\s*300 mm.*W\s*200 mm.*H\s*150 mm/);
    // Keyboard: arrow keys move between the three tabs.
    await panel.getByRole ('tab', { name : 'Accessories', exact : true }).press ('ArrowLeft'); assert.equal (await panel.getByRole ('tab', { name : 'Auto', exact : true }).getAttribute ('aria-selected'), 'true');
    await panel.getByRole ('tab', { name : 'Auto', exact : true }).press ('ArrowRight'); assert.equal (await panel.getByRole ('tab', { name : 'Accessories', exact : true }).getAttribute ('aria-selected'), 'true');
    // Pad options: positions, flute and grade from the board catalog, and whether the box grows.
    for (const label of ['Top pad', 'Bottom pad', 'Front pad', 'Back pad', 'Do not affect box ID']) { await tab.getByLabel (label, { exact : true }).waitFor (); }
    assert.ok ((await tab.getByLabel ('Flute', { exact : true }).locator ('option').allTextContents ()).some (text => /^E flute/.test (text)));
    assert.deepEqual (await tab.getByLabel ('Board grade', { exact : true }).locator ('option').allTextContents (), ['32 ECT', '44 ECT', '48 ECT', '200# test', '275# test']);
    await tab.getByLabel ('Top pad', { exact : true }).check ();
    await tab.getByLabel ('Flute', { exact : true }).selectOption ('nominal-e'); await tab.getByLabel ('Board grade', { exact : true }).selectOption ('44 ECT');
    assert.match (await tab.textContent (), /box inside becomes 300 mm × 200 mm × 153 mm/);
    await tab.getByLabel ('Do not affect box ID', { exact : true }).check (); assert.match (await tab.textContent (), /box size unchanged/);
    await tab.getByLabel ('Do not affect box ID', { exact : true }).uncheck ();
    await tab.getByRole ('button', { name : 'Add pads', exact : true }).click ();
    await page.waitForFunction (() => document.querySelector ('.packaging_accessories > [role=status][aria-live=polite]')?.textContent.includes ('Added 2 pads'), null, { timeout : 60000 });
    // The carton grew through the dimension tools so the space between the pads is the original 150 mm.
    const grown = await call ('packaging.dimensions.inspect'); assert.ok (Math.abs (grown.inside.height - 153) < 1e-6, String (grown.inside.height));
    await tab.getByLabel ('Cells along length', { exact : true }).fill ('4'); await tab.getByLabel ('Cells along length', { exact : true }).press ('Enter');
    assert.match (await tab.textContent (), /8 cells/);
    await tab.getByRole ('button', { name : 'Add partitions', exact : true }).click ();
    await page.waitForFunction (() => document.querySelector ('.packaging_accessories > [role=status][aria-live=polite]')?.textContent.includes ('8-cell partitions'), null, { timeout : 60000 });
    const scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 1 + 2 + 4);
    assert.ok (scene.objects.every (item => item.userData._auto3dGroup === scene.objects[0].userData._auto3dGroup));
    assert.equal (await tab.getByRole ('button', { name : 'Add pads', exact : true }).isDisabled (), true);
    await page.setViewportSize ({ width : 390, height : 844 }); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false); await page.setViewportSize ({ width : 1500, height : 1000 });
    await call ('view.fit'); await page.screenshot ({ path : 'work/accessories-review/pads-and-partitions.png' });
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 3);
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    await call ('history.undo'); assert.ok (Math.abs ((await call ('packaging.dimensions.inspect')).inside.height - 150) < 1e-6);
    assert.deepEqual (errors, []);
    console.log ('Accessories tab, keyboard tabs, engineering inside size, pad positions/flute/grade, box growth and keep-box, 8-cell partitions, grouping, mobile layout and Undo passed.');
} finally { await browser.close (); }
