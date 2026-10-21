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
    await call ('object.array', { width : 2, length : 2, height : 1, animate : false });
    const scene = await call ('scene.inspect'); const dimensions = await call ('packaging.measurements.inspect');
    await call ('packaging.fefco.camera', { autoFit : false });
    await call ('packaging.fefco.scrub', { progress : .23 }); const camera = await call ('camera.current.inspect');
    await page.evaluate (() => { window.boardContextLost = false; document.querySelectorAll ('canvas').forEach (canvas => canvas.addEventListener ('webglcontextlost', () => { window.boardContextLost = true; })); });
    const start = Date.now ();
    for (let i = 0; i < 6; i++) { await call ('packaging.appearance.update', { enabled : i % 2 === 1 }); assert.equal ((await call ('packaging.fefco.scrub.inspect')).progress, .23); }
    assert.deepEqual ((await call ('scene.inspect')).objects.map (o => [o.id, o.position]), scene.objects.map (o => [o.id, o.position]));
    assert.deepEqual ((await call ('packaging.measurements.inspect')).dimensions, dimensions.dimensions); const after = await call ('camera.current.inspect'); assert.deepEqual (after.eye, camera.eye); assert.deepEqual (after.center, camera.center);
    await call ('history.undo'); assert.equal ((await call ('packaging.appearance.inspect')).settings.enabled, false); await call ('history.redo'); assert.equal ((await call ('packaging.appearance.inspect')).settings.enabled, true);
    assert.equal (await page.evaluate (() => window.boardContextLost), false); assert.deepEqual (errors, []);
    console.log ('Six array/fold-preview toggles retained pose, camera, exact placements, Undo/Redo and WebGL context; elapsed ms:', Date.now () - start);
} finally { await browser.close (); }
