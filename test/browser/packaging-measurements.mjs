import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
const output = process.env.PACKAGING_CAPTURE_DIR || 'work'; await mkdir (output, { recursive : true });
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1480, height : 1050 } }); const errors = []; page.on ('pageerror', e => errors.push (e.message)); page.setDefaultTimeout (60000);
    await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'measurement-test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await page.locator ('#startup_splash').waitFor ({ state : 'detached' }); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    await call ('ui.ai.packaging'); await call ('packaging.fefco.preset', { code : '0201', length : 400, width : 300, height : 250, thickness : 4, closure : 'open' });
    await call ('packaging.measurements.update', { id : 'length', mode : 'parametric', basis : 'inside', targetMm : 400.125, toleranceMm : 1.5 });
    await call ('packaging.measurements.update', { id : 'width', mode : 'manual', basis : 'inside', targetMm : 300, toleranceMm : 1 });
    await call ('packaging.measurements.update', { id : 'height', mode : 'parametric', basis : 'inside', targetMm : 250, toleranceMm : 1.5 });
    await call ('packaging.materials.update', { name : 'C flute · measured sample', flute : 'C single wall', caliperToleranceMm : 0.15, outsideFactors : [1, 1, 2], processToleranceMm : 0.25, scoreWidthMm : 8 });
    let report = await call ('packaging.measurements.inspect'); assert.equal (report.dimensions[0].valueMm, 400.125); assert.equal (report.dimensions[2].valueMm, 250);
    await page.screenshot ({ path : output + '/packaging-connected-folds.png' });
    await call ('packaging.measurements.open'); await page.getByRole ('region', { name : 'Measurement layer' }).waitFor ();
    assert.equal (await page.locator ('#MEASUREMENT').getAttribute ('data-source'), 'canonical-cad');
    await page.getByLabel ('Measured board caliper (mm)', { exact : true }).fill ('5'); await page.getByRole ('button', { name : 'Apply material specifications' }).click ();
    await page.evaluate (async () => { /* async predicates make waitForFunction resolve at once, so poll in the page */ const end = Date.now () + 120000; while (!((await Auto3D.execute ('packaging.measurements.inspect')).result.material.caliperMm === 5)) { if (Date.now () > end) { throw new Error ('Timed out waiting for page state'); } await new Promise (resolve => setTimeout (resolve, 100)); } });
    report = await call ('packaging.measurements.inspect'); assert.equal (report.dimensions[0].valueMm, 400.125); assert.equal (report.dimensions[2].valueMm, 250); assert.equal (report.dimensions[1].scoreMm, 304); assert.equal (report.dimensions[1].valueMm, 299);
    await page.screenshot ({ path : output + '/packaging-measurement-layer.png' });
    await page.locator ('.packaging_engineering details > summary').click (); await page.locator ('[data-dimension="length"]').scrollIntoViewIfNeeded ();
    await page.screenshot ({ path : output + '/packaging-dimension-formulas.png' });
    // No changes to authoritative numbers when rotating/zooming presentation.
    const before = JSON.stringify ((await call ('packaging.measurements.inspect')).dimensions); await call ('camera.fov', { fov : 55 }); await call ('packaging.layer', { layer : 'drawing' }); await call ('packaging.layer', { layer : 'measurement' }); assert.equal (JSON.stringify ((await call ('packaging.measurements.inspect')).dimensions), before);
    await page.getByRole ('button', { name : 'Close Packaging', exact : true }).click ();
    const snapshot = JSON.stringify ((await call ('packaging.measurements.inspect')).state);
    const finish = async () => page.evaluate (() => new Promise ((resolve, reject) => { const deadline = performance.now () + 60000; const poll = async () => { const report = (await Auto3D.execute ('packaging.fefco.playback.inspect')).result; if (report.state === 'completed') { resolve (report); } else if (report.state === 'failed' || performance.now () > deadline) { reject (new Error (JSON.stringify (report))); } else { setTimeout (poll, 50); } }; poll (); }));
    await call ('packaging.fefco.animate', { duration : 1 });
    await finish ();
    assert.equal ((await call ('packaging.fefco.playback.inspect')).state, 'completed');
    assert.equal (JSON.stringify ((await call ('packaging.measurements.inspect')).state), snapshot);
    await call ('packaging.fefco.animate', { duration : 1 });
    await finish ();
    assert.equal ((await call ('packaging.fefco.playback.inspect')).state, 'completed');
    assert.equal (JSON.stringify ((await call ('packaging.measurements.inspect')).state), snapshot);
    // HSC gives a clear view of the continuous wall and base score joins.
    await call ('object.delete');
    await call ('packaging.fefco.preset', { code : '0200', length : 400, width : 300, height : 250, thickness : 4 });
    await page.screenshot ({ path : output + '/packaging-open-container.png' });
    await page.locator ('#main_viewer').screenshot ({ path : output + '/packaging-crease-render.png' });
    await call ('packaging.measurements.open'); await page.setViewportSize ({ width : 390, height : 844 }); await page.getByLabel ('Measurement layer', { exact : true }).waitFor (); const overflow = await page.evaluate (() => document.documentElement.scrollWidth > innerWidth); assert.equal (overflow, false); await page.screenshot ({ path : output + '/packaging-measurement-mobile.png' });
    assert.deepEqual (errors, []); console.log ('CAD Measurement layer, manual/parametric material changes and rendering: passed.');
    await page.close ();
    const preview = await browser.newPage ({ viewport : { width : 1480, height : 1050 } }); const previewErrors = []; preview.on ('pageerror', e => previewErrors.push (e.message));
    await preview.goto ('http://127.0.0.1:8082/'); await preview.getByRole ('button', { name : /0201/ }).first ().click (); await preview.waitForTimeout (500);
    await preview.getByLabel ('length mode', { exact : true }).selectOption ('parametric'); await preview.getByLabel ('length basis', { exact : true }).selectOption ('inside'); await preview.getByLabel ('length dimension (mm)', { exact : true }).fill ('400.125'); await preview.getByRole ('button', { name : 'Apply length', exact : true }).click (); await preview.getByRole ('button', { name : 'Apply length', exact : true }).waitFor ({ state : 'visible' }); await preview.getByLabel ('Measured board caliper (mm)', { exact : true }).fill ('5'); await preview.getByRole ('button', { name : 'Apply material specifications', exact : true }).click ();
    await preview.waitForFunction (() => document.getElementById ('cad').textContent.includes ('400.125')); assert.equal (await preview.getByRole ('button', { name : 'Apply material specifications', exact : true }).isEnabled (), true);
    await preview.locator ('.packaging_engineering details > summary').click (); await preview.locator ('[data-dimension="length"]').scrollIntoViewIfNeeded ();
    assert.ok (await preview.locator ('#cad path').count () > 0); assert.deepEqual (previewErrors, []); await preview.screenshot ({ path : output + '/packaging-standalone-preview.png' });
    console.log ('Standalone rendering and CAD preview: passed.');
} finally { await browser.close (); }
