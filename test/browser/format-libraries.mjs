import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
// Draco glTF and Rhino 3DM import must use the decoders hosted beside the site bundle, never the CDN.
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const cdn = [], local = new Set ();
    for (const files of [['test/testfiles/gltf/Box/glTF-Draco/Box.gltf', 'test/testfiles/gltf/Box/glTF-Draco/Box.bin'], ['test/testfiles/3dm/cube-mesh.3dm']]) {
        const page = await browser.newPage (); page.setDefaultTimeout (90000); const errors = [];
        page.on ('pageerror', error => errors.push (error.message));
        await page.route ('https://cdn.jsdelivr.net/**', route => { cdn.push (route.request ().url ()); route.abort (); });
        page.on ('request', request => { const match = /\/(draco\/draco_decoder\.js|libs\/rhino3dm\/rhino3dm\.(?:min\.js|wasm))$/.exec (request.url ()); if (match) { local.add (match[1]); } });
        await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
        await page.route ('**/api/personal/items', route => route.fulfill ({ json : [] }));
        await page.route ('**/api/auth/session', route => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
        await page.route ('**/api/environments', route => route.fulfill ({ json : [] }));
        await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        await page.locator ('#open_file').setInputFiles (files);
        await page.waitForFunction (() => /^(Added|Imported|Cannot|Can not|Could not|Unable|Failed)/i.test (document.querySelector ('.scene_status')?.textContent || ''), null, { polling : 500 });
        const name = files[0].split ('/').pop ();
        assert.match (await page.locator ('.scene_status').textContent (), new RegExp ('^Added ' + name.replace ('.', '\\.')));
        assert.equal ((await page.evaluate (() => Auto3D.execute ('scene.inspect', {}))).result.objects.length, 1);
        assert.deepEqual (errors, []); await page.close ();
    }
    assert.deepEqual (cdn, []);
    assert.deepEqual ([...local].sort (), ['draco/draco_decoder.js', 'libs/rhino3dm/rhino3dm.min.js', 'libs/rhino3dm/rhino3dm.wasm']);
    console.log ('Draco glTF and Rhino 3DM import passed using site-hosted libraries with the CDN blocked.');
} finally { await browser.close (); }
