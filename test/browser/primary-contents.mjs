import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = [], requests = []; page.on ('pageerror', error => errors.push (error.message)); page.on ('request', request => requests.push (request.url ()));
    await page.route ('https://auto3d.test/**', async route => {
        const url = new URL (route.request ().url ()), name = url.pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'primary-ui', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { if (process.env.PRIMARY_TEST_PROGRESS) { console.log (id); } const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, JSON.stringify (response)); return response.result; };
    const poll = async (predicate) => { for (let i = 0; i < 600; i++) { try { if (await predicate ()) { return; } } catch (error) { if (!error.message.includes ('viewer is busy')) { throw error; } } await page.waitForTimeout (100); } throw new Error ('Timed out waiting for product state.'); };
    await mkdir ('work/primary-contents-review', { recursive : true });
    await call ('ui.primary_products'); await call ('primary.designs.select', { id : 'rect-cleaner' }); await call ('primary.configure', { material : 'glass' });
    await page.getByRole ('button', { name : 'Edit model', exact : true }).click ();
    const profile = page.getByRole ('region', { name : 'Live product profile', exact : true }); await profile.waitFor ();
    const initial = await call ('primary.profile.inspect'); const objectId = initial.objectId;
    const wall = profile.getByRole ('spinbutton', { name : 'Profile wall thickness', exact : true });
    await wall.fill ('1.5'); await wall.press ('Enter'); await poll (async () => (await call ('primary.profile.inspect')).draft.details.wallMm === 1.5); await poll (async () => await wall.isEnabled ());
    await profile.getByRole ('combobox', { name : 'Contents type', exact : true }).selectOption ('oil'); await poll (async () => (await call ('primary.profile.inspect')).draft.contents?.type === 'oil');
    await poll (async () => await wall.isEnabled ());
    await call ('primary.glass.set', { optics : { color : '#bdd1c3', opacity : .04, ior : 1.52, tintDistanceMm : 18 } });
    let materials = await call ('material.list'); assert.ok (materials.some (m => m.name.endsWith ('contents') && m.opacity === .48 && m.transmissionBackground)); assert.ok (materials.some (m => m.thickness === 1.5 && m.transmission === .96));
    const viscosity = profile.getByRole ('spinbutton', { name : 'Viscosity (mPa·s)', exact : true }); await viscosity.fill ('120'); await viscosity.press ('Enter'); await poll (async () => (await call ('primary.profile.inspect')).draft.contents.viscosity === 120); await poll (async () => await wall.isEnabled ());
    const art = profile.getByRole ('region', { name : 'Product label artwork', exact : true });
    await art.locator ('summary').click (); await art.getByRole ('textbox', { name : 'Label text', exact : true }).fill ('BOTANICAL\nBODY OIL');
    await art.getByRole ('button', { name : 'Create / update text label' }).click ();
    await poll (async () => (await call ('primary.inspect')).artwork?.[0]?.source?.kind === 'text'); await poll (async () => await wall.isEnabled ());
    await poll (async () => (await call ('material.list')).some (m => m.name.startsWith ('Primary label')));
    assert.equal (await art.getByRole ('button', { name : 'Apply label artwork', exact : true }).isVisible (), false);
    const width = art.getByRole ('spinbutton', { name : 'Label width', exact : true }); const oldWidth = Number (await width.inputValue ());
    await width.fill ('30'); await width.press ('Tab'); await poll (async () => (await call ('primary.inspect')).artwork[0].widthMm === 30); await poll (async () => await wall.isEnabled ());
    await call ('history.undo'); await poll (async () => Number (await width.inputValue ()) === oldWidth); await call ('history.redo');
    await call ('primary.callouts.set', { visible : false }); await call ('view.background', { preset : 'light' }); await call ('lighting.restore', { mode : 'hdri', environment : 'studio_small_09', brightness : 1, background : false }); await call ('view.focus', { objectId });
    await profile.locator ('.pp_profile_scroll').evaluate (el => { el.scrollTop = 0; }); await page.screenshot ({ path : 'work/primary-contents-review/glass-oil-text.png' });
    await profile.getByRole ('combobox', { name : 'Contents type' }).scrollIntoViewIfNeeded (); await page.screenshot ({ path : 'work/primary-contents-review/contents-controls.png' });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect width="200" height="120" fill="#f5eddb"/><circle cx="100" cy="60" r="38" fill="#458b9b"/></svg>';
    const chooser = page.waitForEvent ('filechooser'); await art.getByRole ('button', { name : 'Import label image', exact : true }).click (); await (await chooser).setFiles ({ name : 'brand.svg', mimeType : 'image/svg+xml', buffer : Buffer.from (svg) });
    await poll (async () => (await call ('primary.inspect')).artwork?.[0]?.source?.kind === 'svg'); await poll (async () => await wall.isEnabled ());
    for (const bad of ['<script>alert(1)</script>', '<image href="https://external.test/a.png"/>', '<rect width="20" height="20" onload="alert(1)"/>']) {
        const rejected = await page.evaluate (svg => Auto3D.execute ('primary.artwork.svg', { svg }), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">'+bad+'</svg>'); assert.equal (rejected.ok, false);
    }
    assert.equal (requests.some (url => url.includes ('external.test')), false);
    assert.equal ((await call ('primary.inspect')).artwork[0].source.kind, 'svg'); assert.equal ((await call ('primary.profile.inspect')).objectId, objectId);
    await art.getByRole ('button', { name : 'Back label', exact : true }).click (); const imageChooser = page.waitForEvent ('filechooser'); await art.getByRole ('button', { name : 'Import label image', exact : true }).click (); await (await imageChooser).setFiles ('test/testfiles/obj/texture.png');
    await poll (async () => (await call ('primary.inspect')).artwork.length === 2); await poll (async () => await wall.isEnabled ());
    await page.setViewportSize ({ width : 390, height : 844 }); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot ({ path : 'work/primary-contents-review/mobile.png' }); await page.setViewportSize ({ width : 1500, height : 1000 });
    await call ('primary.contents.set', { contents : null }); assert.equal ((await call ('primary.profile.inspect')).draft.contents, undefined);
    await call ('primary.profile.close'); await call ('primary.reset'); await call ('primary.designs.select', { id : 'food-deli' }); await call ('primary.generate'); await call ('primary.profile.open');
    await call ('primary.artwork.text', { text : 'FRESH', color : '#123740' }); assert.equal ((await call ('primary.inspect')).artwork[0].source.text, 'FRESH');
    assert.equal (await profile.getByRole ('combobox', { name : 'Contents type' }).isVisible (), false);
    assert.deepEqual (errors, []); console.log ('Wall/glass optics, cavity fill controls, live text/SVG/image labels, security rejection, Undo, mobile and clamshell labels passed.');
} finally { await browser.close (); }
