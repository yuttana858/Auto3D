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
    await call ('object.array', { width : 5, length : 4, height : 1, animate : false });
    const before = await call ('lighting.shadow.inspect'); assert.equal ((await call ('scene.inspect')).objects.length, 20); assert.ok (before.resources.geometries < 100, JSON.stringify (before));
    for (const enabled of [false, true, false, true]) {
        await call ('packaging.appearance.update', { enabled }); const state = await call ('lighting.shadow.inspect'); console.log ('GPU resources', JSON.stringify (state.resources)); assert.equal (state.contextLost, false); assert.deepEqual (state.shaderErrors, []); assert.equal (state.rootVisible, true); assert.ok (state.resources.geometries < 100); assert.equal (state.resources.textures, before.resources.textures);
    }
    assert.deepEqual (errors, []); console.log ('Twenty-box array shares GPU buffers; repeated edits keep geometry/texture counts bounded.');
} finally { await browser.close (); }
