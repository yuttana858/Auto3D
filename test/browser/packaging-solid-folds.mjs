import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    // Separate contexts release WebGL resources between textured route fixtures.
    for (const code of ['0200', '0201', '0202', '0203']) {
        const page = await browser.newPage ({ viewport : { width : 1280, height : 850 } }); const errors = []; page.setDefaultTimeout (60000);
        page.on ('pageerror', e => errors.push (e.message)); page.on ('console', m => { if (m.type () === 'error' && /shader|WebGL|program/i.test (m.text ())) { errors.push (m.text ()); } });
        await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'solid-fold-test', email : 'test@example.com' } } }));
        await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
        for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
        await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8081/'); await page.locator ('#startup_splash').waitFor ({ state : 'detached' }); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, JSON.stringify (r)); return r.result; };
        const finish = async () => page.evaluate (() => new Promise ((resolve, reject) => { const deadline = performance.now () + 60000; const check = async () => { const r = (await Auto3D.execute ('packaging.fefco.playback.inspect')).result; if (r.state === 'completed') { resolve (r); } else if (r.state === 'failed' || performance.now () > deadline) { reject (new Error (JSON.stringify (r))); } else { setTimeout (check, 50); } }; check (); }));
        const graphics = async () => { const state = await call ('lighting.shadow.inspect'); assert.equal (state.contextLost, false); assert.ok (state.visibleMeshes > 0); assert.deepEqual (state.shaderErrors, []); };
        assert.equal ((await call ('app.version.inspect')).version, '0.35.0'); await call ('ui.ai.packaging');
        const style = (await call ('packaging.fefco.catalog')).styles.find (s => s.code === code); assert.equal (style.folding.supported, true); assert.equal (style.folding.cadMapped, true);
        await call ('packaging.fefco.preset', { code, length : 320, width : 240, height : 180, thickness : 8, overlap : 100, closure : 'closed' });
        const cad = await call ('packaging.inspect'); const audit = await call ('packaging.fefco.folding.check'); assert.equal (audit.clear, true); assert.equal (audit.samples, 3601); assert.deepEqual (audit.intersections, []); console.log (code + ': generated and surface route checked.');
        const start = await call ('packaging.fefco.animate', { duration : 2 }); assert.equal (start.action, 'unfold'); assert.equal (start.clearance.clear, true); await finish ();
        let scene = await call ('scene.inspect'); let selected = scene.objects.find (o => o.id === scene.selectedObjectId); assert.equal (selected.userData._auto3dPackagingState, 'flat'); assert.deepEqual ((await call ('packaging.inspect')).paths, cad.paths); await graphics (); await page.screenshot ({ path : 'work/solid-' + code + '-flat.png' });
        const again = await call ('packaging.fefco.animate', { duration : 2 }); assert.equal (again.action, 'fold'); const complete = await finish (); assert.equal (complete.stage, code === '0200' ? 'open HSC' : 'closed box');
        scene = await call ('scene.inspect'); selected = scene.objects.find (o => o.id === scene.selectedObjectId); assert.equal (selected.userData._auto3dPackagingState, 'folded'); assert.equal (JSON.parse (selected.userData._auto3dFefco).closure, code === '0200' ? 'open' : 'closed'); await graphics (); await page.screenshot ({ path : 'work/solid-' + code + '-assembled.png' });
        await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.at (-1).userData._auto3dPackagingState, 'flat'); await call ('history.redo'); await graphics (); assert.deepEqual (errors, []);
        await page.close (); console.log (code + ' ' + style.acronym + ': solid audit, CAD flat, rendered assembly, correct top and Undo/Redo passed.');
    }
} finally { await browser.close (); }
