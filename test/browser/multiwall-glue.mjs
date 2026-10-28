import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { DefaultBoardDatabase } from '../../modules/packaging/src/boarddatabase.js';

await mkdir ('work/multiwall-review', { recursive : true });
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1280, height : 900 } }); page.setDefaultTimeout (60000); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'multiwall-test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric', viewportQuality : 'fast' }, folders : [] } }));
    await page.route ('**/api/packaging/boards', route => route.fulfill ({ json : { revision : null, records : DefaultBoardDatabase () } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    await call ('packaging.boards.select', { id : 'nominal-bc' });
    await call ('packaging.fefco.preset', { code : '0201', basis : 'inside', length : 160, width : 120, height : 100, closure : 'open' });
    const before = await call ('packaging.measurements.inspect'); assert.equal (before.material.flute, 'BC');
    const initial = JSON.stringify (before.dimensions); await page.screenshot ({ path : 'work/multiwall-review/bc-box.png' });
    await call ('packaging.fefco.scrub', { progress : .12 }); await call ('packaging.fefco.scrub', { progress : .72 });
    assert.equal (JSON.stringify ((await call ('packaging.measurements.inspect')).dimensions), initial);
    await call ('packaging.fefco.scrub', { progress : 1 }); await call ('packaging.boards.select', { id : 'nominal-bcb', target : 'selected' });
    assert.equal ((await call ('packaging.measurements.inspect')).material.flute, 'BCB');
    await page.screenshot ({ path : 'work/multiwall-review/bcb-box.png' });
    const viewport = page.locator ('#main_viewer'); const rect = await viewport.boundingBox (); if (rect) { await page.mouse.move (rect.x + rect.width * .5, rect.y + rect.height * .5); await page.mouse.down (); await page.mouse.move (rect.x + rect.width * .8, rect.y + rect.height * .5, { steps : 15 }); await page.mouse.up (); await page.screenshot ({ path : 'work/multiwall-review/bcb-opposite.png' }); }
    assert.deepEqual (errors, []);
    console.log ('BC and BCB boxes rendered through folding; CAD measurements stayed independent of the visual crease.');
} finally { await browser.close (); }
