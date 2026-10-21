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
    await call ('packaging.fefco.scrub', { progress : .5 });
    assert.equal ((await call ('packaging.fefco.scrub.inspect')).progress, .5);
    assert.deepEqual ((await call ('packaging.measurements.inspect')).dimensions, before.dimensions);
    await page.waitForTimeout (1500);
    await page.screenshot ({ path : 'work/rounded-panel-bend.png' });
    await call ('packaging.fefco.scrub', { progress : .2 });
    await page.mouse.move (600, 420); await page.mouse.wheel (0, -260); await page.waitForTimeout (1000);
    await page.screenshot ({ path : 'work/rounded-panel-bend-closeup.png', clip : { x : 235, y : 95, width : 820, height : 610 } });
    await call ('packaging.fefco.scrub', { progress : .5 });
    await call ('animation.action.add', { time : 1, duration : 2, direction : 'unfold' });
    await call ('animation.timeline.seek', { time : 2 });
    assert.ok (Math.abs ((await call ('packaging.fefco.scrub.inspect')).progress - .25) < .001);
    await call ('animation.timeline.seek', { time : 3 });
    assert.equal ((await call ('packaging.fefco.scrub.inspect')).progress, 0);
    await call ('animation.timeline.seek', { time : 2 });
    assert.ok (Math.abs ((await call ('packaging.fefco.scrub.inspect')).progress - .25) < .001);
    assert.deepEqual ((await call ('packaging.measurements.inspect')).dimensions, before.dimensions);
    assert.deepEqual (errors, []);
    console.log ('Rounded bend, manual scrub, action seeking and exact CAD passed.');
} finally { await browser.close (); }
