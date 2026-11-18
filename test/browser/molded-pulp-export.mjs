import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
// Molded Pulp output: the review mesh stays on screen; Export STEP downloads a closed B-rep per shell (mm) and Export GLB the
// formed shape with its pulp material (m). Covers a tray, a clamshell (two solids) and re-forming an object after Undo.
const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 }, acceptDownloads : true }); const errors = [], requests = []; page.on ('pageerror', error => errors.push (error.message)); page.on ('request', request => requests.push (request.url ()));
    await page.route ('https://auto3d.test/**', async route => {
        const url = new URL (route.request ().url ()), name = url.pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'pulp-ui', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    // Forming refines the tray to the requested detail in place after it appears, so retry while the viewer is busy.
    const call = async (id, args = {}) => { let response; for (let i = 0; i < 300; i++) { response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); if (response.ok || !/busy/.test (response.error?.message || '')) { break; } await page.waitForTimeout (100); } assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result; };
    // Poll a command result from Node: waitForFunction would treat the returned Promise itself as truthy.
    const until = async (id, test, timeout = 60000) => { const end = Date.now () + timeout; for (;;) { const r = await page.evaluate (id => Auto3D.execute (id), id); if (r?.ok && test (r.result)) { return r.result; } if (Date.now () > end) { throw new Error ('Timed out waiting on ' + id + ': ' + JSON.stringify ({ stage : r?.result?.stage, result : r?.result?.result, generating : r?.result?.generating, reason : r?.result?.unavailableReason, ok : r?.ok, error : r?.error }).slice (0, 900) + ' status=' + await page.locator ('.mp_status').textContent ()); } await page.waitForTimeout (150); } };
    const raw = (id, args = {}) => page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args });
    await call ('primary.configure', { family : 'can' }); const can = await call ('primary.generate');
    await call ('object.array', { objectId : can.objectId, width : 3, length : 2, height : 1, gap : { width : 20, length : 20 }, animate : false });
    await call ('object.select', { objectId : can.objectId });
    await page.getByRole ('group', { name : 'Generation modules', exact : true }).getByRole ('button', { name : 'Molded Pulp', exact : true }).click ();
    const panel = page.getByRole ('region', { name : 'Molded Pulp', exact : true }); await panel.getByRole ('button', { name : 'Sense selection', exact : true }).waitFor ();
    assert.equal (await panel.getByRole ('button', { name : 'Export STEP', exact : true }).isDisabled (), true, 'nothing to export before forming');
    assert.equal ((await raw ('pulp.export', { format : 'step' })).ok, false);
    await call ('pulp.sense'); await call ('pulp.configure', { formDepthMm : 35, detail : 'draft' });
    await call ('pulp.tray.form'); await until ('pulp.inspect', r => r.result?.stage === 'tray' && !r.generating && !r.refining);

    const download = async (button, format) => { const [file] = await Promise.all ([page.waitForEvent ('download'), panel.getByRole ('button', { name : button, exact : true }).click ()]); const bytes = await readFile (await file.path ()); await mkdir ('work/molded-pulp-review', { recursive : true }); await file.saveAs ('work/molded-pulp-review/' + file.suggestedFilename ()); return { name : file.suggestedFilename (), bytes, format }; };
    const step = await download ('Export STEP', 'step'), text = step.bytes.toString ('utf8');
    assert.match (step.name, /\.step$/); assert.match (text, /^ISO-10303-21;/); assert.match (text, /AUTOMOTIVE_DESIGN/); assert.match (text, /SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
    assert.equal ((text.match (/MANIFOLD_SOLID_BREP\(/g) || []).length, 1); assert.equal ((text.match (/ADVANCED_FACE\(/g) || []).length, 6);
    assert.match (await panel.locator ('.mp_status').textContent (), /STEP downloaded: 1 closed solid in mm/);
    const glb = await download ('Export GLB', 'glb'); assert.match (glb.name, /\.glb$/); assert.equal (glb.bytes.subarray (0, 4).toString (), 'glTF'); assert.equal (glb.bytes.readUInt32LE (4), 2);
    const json = JSON.parse (glb.bytes.subarray (20, 20 + glb.bytes.readUInt32LE (12)).toString ());
    assert.ok (json.materials.some (m => /Molded pulp/.test (m.name)), 'pulp material'); assert.ok (json.meshes.length >= 1);
    const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION]; assert.ok (Math.max (...position.max.map ((v, a) => v - position.min[a])) < 1, 'metres: the tray is under 1 m');

    // Phase 2 check: smooth walls with the outer skirt off (default), then on. The tray stays unchanged either way.
    const skirt = panel.getByRole ('checkbox', { name : 'Outer skirt wall (experimental)', exact : true }); assert.equal (await skirt.isChecked (), false);
    const objectsBefore = (await call ('scene.inspect')).objects.length;
    await panel.getByRole ('button', { name : 'Check smooth walls', exact : true }).click ();
    await page.waitForFunction (() => /Smooth walls/.test (document.querySelector ('.mp_status')?.textContent || ''), null, { timeout : 120000 });
    assert.match (await panel.locator ('.mp_status').textContent (), /Smooth walls: 6 walls, \d+ control points, within [\d.]+ mm of the review surface/);
    await skirt.check (); assert.equal ((await call ('pulp.inspect')).draft.skirtWall, true);
    const withSkirt = await call ('pulp.loft.check'); assert.equal (withSkirt.skirtWall, true); assert.equal (withSkirt.shells[0].walls.filter (w => w.kind === 'skirt').length, 4, 'four skirt sides between the sheet corners'); assert.equal (withSkirt.ok, true, withSkirt.message);
    assert.equal ((await call ('scene.inspect')).objects.length, objectsBefore, 'the check does not change the scene');
    console.log ('Smooth walls (skirt off): ' + await panel.locator ('.mp_status').textContent ()); console.log ('Smooth walls (skirt on): ' + JSON.stringify (withSkirt.shells[0].walls.map (w => w.id + ' ' + w.outlineControls + 'x' + w.heightControls + ' ' + w.maxDistanceMm.toFixed (2) + (w.withinTolerance ? '' : ' (outside)'))) + ' ok=' + withSkirt.ok);
    await skirt.uncheck (); assert.equal ((await call ('pulp.loft.check')).shells[0].walls.some (w => w.kind === 'skirt'), false);

    // A clamshell exports two solids; the agent command returns the same summary as the panel.
    await call ('pulp.configure', { clamshell : 'top-bottom' }); await call ('pulp.tray.form'); await until ('pulp.inspect', r => r.result?.clamshell === 'top-bottom' && !r.generating && !r.refining);
    const [clam] = await Promise.all ([page.waitForEvent ('download'), raw ('pulp.export', { format : 'step' })]);
    const clamText = (await readFile (await clam.path ())).toString ('utf8'); assert.equal ((clamText.match (/MANIFOLD_SOLID_BREP\(/g) || []).length, 2);
    // Undo brings back the earlier single tray object; its plan is not the cached one, so export forms it again from the
    // saved definition and products (in the worker) and still writes one solid.
    await call ('history.undo'); const tray = (await call ('scene.inspect')).objects.find (o => /Molded pulp/.test (o.name)); await call ('object.select', { objectId : tray.id });
    const [again] = await Promise.all ([page.waitForEvent ('download'), raw ('pulp.export', { format : 'step' })]);
    assert.equal (((await readFile (await again.path ())).toString ('utf8').match (/MANIFOLD_SOLID_BREP\(/g) || []).length, 1);
    assert.equal ((await raw ('pulp.export', { format : 'iges' })).ok, false, 'only step and glb');
    assert.deepEqual (errors, []);
    console.log ('Molded Pulp output passed: STEP (1 solid, 6 faces, mm) and GLB (pulp material, m) from the panel, clamshell STEP with 2 solids.');
} finally { await browser.close (); }
