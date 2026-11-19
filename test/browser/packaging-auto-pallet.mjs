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
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'auto-pallet-ui', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name === '/api/packaging/boards') { return route.fulfill ({ status : 404, json : { error : 'No saved board catalog' } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, JSON.stringify (response)); return response.result; };
    await mkdir ('work/auto-pallet-review', { recursive : true });
    await call ('packaging.boards.select', { id : 'nominal-e', target : 'generation' });
    const box = await call ('packaging.fefco.generate', { code : '0201', length : 300, width : 200, height : 150, closure : 'closed' });
    await call ('packaging.tab', { tab : 'auto' });
    const panel = page.getByRole ('region', { name : 'Packaging Generative', exact : true });
    const auto = panel.getByRole ('tabpanel', { name : 'Auto', exact : true }); await auto.waitFor ();
    const section = auto.getByRole ('region', { name : 'Auto pallet', exact : true }); await section.waitFor ();
    // The selected RSC is 203 × 303 × 156 mm outside: 20 per layer × 8 layers under 55 in overall.
    const plan = await call ('packaging.pallet.inspect', {}); assert.equal (plan.available, true, plan.reason); assert.equal (plan.objectId, box.objectId);
    assert.equal (plan.plan.perLayer, 20); assert.equal (plan.plan.layers, 8); assert.equal (plan.plan.total, 160);
    const load = section.getByRole ('region', { name : 'Pallet load', exact : true });
    assert.match (await load.textContent (), /Per layer\s*20/); assert.match (await load.textContent (), /Boxes\s*160/);
    await call ('preferences.units', { units : 'standard' });
    assert.equal (await section.getByLabel ('Max overall height').inputValue (), '55');
    assert.match (await load.textContent (), /54\.13 in/);
    // Lowering the height in the panel changes the plan before anything is built.
    await section.getByLabel ('Max overall height').fill ('30'); await section.getByLabel ('Max overall height').press ('Enter');
    assert.match (await load.textContent (), /Layers\s*4/); assert.match (await load.textContent (), /Boxes\s*80/);
    await section.getByLabel ('Max overall height').fill ('55'); await section.getByLabel ('Max overall height').press ('Enter');
    await section.getByLabel ('Pallet colour', { exact : true }).selectOption ('black');
    await page.setViewportSize ({ width : 390, height : 844 }); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false); await page.setViewportSize ({ width : 1500, height : 1000 });
    const before = await call ('scene.inspect');
    await section.getByRole ('button', { name : 'Auto pallet', exact : true }).click ();
    await page.waitForFunction (() => document.querySelector ('.packaging_auto_pallet [aria-live=polite]')?.textContent.includes ('160 boxes'), null, { timeout : 120000 });
    const after = await call ('scene.inspect'); assert.equal (after.objects.length, before.objects.length + 160);
    const pallet = after.objects.find (item => item.userData?._auto3dPallet); assert.ok (pallet); assert.match (pallet.name, /Black/);
    assert.equal (JSON.parse (pallet.userData._auto3dPallet).total, 160);
    assert.ok (after.objects.every (item => item.userData?._auto3dGroup === pallet.userData._auto3dGroup));
    await call ('view.fit'); await page.screenshot ({ path : 'work/auto-pallet-review/black-pallet-160.png', timeout : 120000 });
    await call ('history.undo'); const undone = await call ('scene.inspect'); assert.equal (undone.objects.length, 1); assert.deepEqual (undone.objects[0].position, before.objects[0].position);
    assert.deepEqual (errors, []);
    console.log ('Auto pallet section, live plan and units, height input, colour choice, 160-box column-stacked build, mobile layout and Undo passed.');
} finally { await browser.close (); }
