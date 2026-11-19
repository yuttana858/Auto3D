import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// A model in another known unit keeps its real size: a GLB (metres) opened into a millimetre scene of
// generated products is scaled 1000×, instead of appearing 1000× too small.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1280, height : 800 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', e => errors.push (e.message));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : [] } }));
    await page.route ('**/api/personal/items', route => route.fulfill ({ json : [] }));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
    await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false } }));
    await page.route ('**/api/macros**', route => route.fulfill ({ json : { macros : [], available : true } }));
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, id + ' ' + JSON.stringify (r)); return r.result; };
    await call ('primary.designs.generate', { id : 'standard-beverage' });
    await page.locator ('#open_file').setInputFiles ('test/testfiles/gltf/BoxVertexColors/glTF-Binary/BoxVertexColors.glb');
    await page.waitForFunction (() => /Added BoxVertexColors/.test (document.querySelector ('.scene_status')?.textContent || document.body.textContent));
    const box = (await call ('scene.inspect')).objects.find (o => o.name.startsWith ('BoxVertexColors'));
    assert.deepEqual (box.scale, [1000, 1000, 1000], 'metres into a millimetre scene: ' + JSON.stringify (box.scale));
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    assert.deepEqual (errors, []);
    console.log ('Import units: a metre GLB keeps its real size in a millimetre scene; Undo removes it.');
} finally { await browser.close (); }
