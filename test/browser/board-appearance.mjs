import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1100, height : 800 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', e => errors.push (e.message));
    await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'presentation-test', email : 'fixture@example.com' } } }));
    await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'metric', viewportQuality : 'fast' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { console.log ('Checking', id); const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    const wait = async (id, test) => { const end = Date.now () + 120000; while (Date.now () < end) { const value = await call (id); if (test (value)) { return value; } await page.waitForTimeout (150); } throw new Error ('Timed out: ' + id); };
    await call ('packaging.fefco.preset', { code : '0201', length : 100, width : 80, height : 60, thickness : 3, closure : 'closed' });
    const before = await call ('packaging.measurements.inspect');
    await call ('packaging.appearance.update', { enabled : false });
    await page.screenshot ({ path : 'work/board-surface-off.png' });
    await call ('packaging.appearance.update', { enabled : true, panelBow : .18, cutCompression : .18, paperGrain : .35, foldSoftness : 1 });
    const result = await call ('packaging.appearance.inspect'); assert.equal (result.settings.enabled, true);
    await page.screenshot ({ path : 'work/board-surface-default.png' });
    assert.deepEqual ((await call ('packaging.measurements.inspect')).dimensions, before.dimensions);
    await call ('history.undo'); assert.equal ((await call ('packaging.appearance.inspect')).settings.enabled, false);
    await call ('history.redo'); assert.equal ((await call ('packaging.appearance.inspect')).settings.enabled, true);
    await call ('packaging.fefco.scrub', { progress : .23 });
    await page.waitForTimeout (700); await page.screenshot ({ path : 'work/board-surface-bending.png' });
    await call ('packaging.fefco.scrub', { progress : .72 });
    await page.waitForTimeout (700); await page.screenshot ({ path : 'work/board-surface-inner-liner.png' });
    assert.deepEqual ((await call ('packaging.measurements.inspect')).dimensions, before.dimensions);
    await call ('ui.ai.packaging');
    await page.getByText ('Realistic board surface', { exact : true }).click ();
    const bowControl = page.getByLabel ('Panel bow', { exact : true }); await bowControl.waitFor (); assert.equal (await bowControl.isEnabled (), true);
    await bowControl.evaluate (input => { input.value = '.2'; input.dispatchEvent (new Event ('change', { bubbles : true })); });
    await page.waitForFunction (() => !document.querySelector ('input[aria-label="Panel bow"]').disabled);
    assert.equal ((await call ('packaging.appearance.inspect')).settings.panelBow, .2);
    await page.screenshot ({ path : 'work/board-surface-controls.png' });
    assert.deepEqual (errors, []); console.log ('Real board surface, independent materials, history, exact CAD and folded preview passed.');
} finally { await browser.close (); }
