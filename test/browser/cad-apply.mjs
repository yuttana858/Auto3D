import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
await mkdir ('work/cad-review', { recursive : true });
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1480, height : 1050 } }); page.setDefaultTimeout (30000); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'cad-review', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    await call ('packaging.fefco.preset', { code : '0201', length : 100, width : 80, height : 60, thickness : 3 });
    const objectId = (await call ('scene.inspect')).selectedObjectId;
    await call ('packaging.open_selected'); const dialog = page.locator ('.packaging_dialog');
    assert.equal ((await call ('packaging.inspect')).tool, 'select');
    const canvas = page.locator ('.packaging_canvas'); await canvas.click ({ position : { x : 5, y : 5 } }); assert.deepEqual ((await call ('packaging.inspect')).draftPoints, []);
    const scores = (await call ('packaging.inspect')).paths.filter (p => p.type === 'score');
    const clickPath = async (id, modifiers = []) => {
        // Click a score midpoint in SVG coordinates to exercise real pointer selection.
        const point = await page.locator ('[data-hit-path="' + id + '"]').evaluate (node => { const local = node.getPointAtLength (node.getTotalLength () / 2); const world = local.matrixTransform (node.getScreenCTM ()); return { x : world.x, y : world.y }; });
        for (const modifier of modifiers) { await page.keyboard.down (modifier); } await page.mouse.click (point.x, point.y); for (const modifier of modifiers) { await page.keyboard.up (modifier); }
    };
    await page.screenshot ({ path : 'work/cad-review/before-select.png' }); await clickPath (scores[0].id); await clickPath (scores[1].id, ['Control']); assert.equal ((await call ('packaging.inspect')).selectedPathIds.length, 2);
    await dialog.getByRole ('button', { name : 'Crease and perforation settings', exact : true }).click ();
    await dialog.getByLabel ('Crease / perforation type', { exact : true }).selectOption ('perforation'); await dialog.getByLabel ('Perforation cut (mm)', { exact : true }).fill ('3.25'); await dialog.getByLabel ('Perforation tie (mm)', { exact : true }).fill ('1.5'); await dialog.getByRole ('button', { name : 'Apply crease settings', exact : true }).click ();
    await page.waitForFunction (async () => (await Auto3D.execute ('packaging.inspect')).result.paths.filter (p => p.process?.kind === 'perforation').length === 2);
    await dialog.getByRole ('button', { name : 'Apply to 3D', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('.packaging_status').textContent.includes ('CAD applied'));
    assert.equal ((await call ('scene.inspect')).selectedObjectId, objectId);
    await page.screenshot ({ path : 'work/cad-review/cad-toolbar.png' });
    await dialog.getByRole ('button', { name : 'Pen', exact : true }).click (); await canvas.click ({ position : { x : 35, y : 35 } }); await canvas.click ({ position : { x : 75, y : 35 } }); assert.equal ((await call ('packaging.inspect')).draftPoints.length, 2); await call ('packaging.draft.cancel');
    await call ('packaging.tool', { tool : 'select' });
    const outline = (await call ('packaging.inspect')).paths.find (p => p.type === 'cut'); outline.points[0][0] -= 1; await call ('packaging.path.edit', { id : outline.id, points : outline.points, units : 'mm' });
    await dialog.getByRole ('button', { name : 'Apply to 3D', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('.packaging_status').textContent.includes ('new fold rig'));
    await dialog.getByLabel ('CAD apply mode').selectOption ('flat'); await dialog.getByRole ('button', { name : 'Apply to 3D', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('.packaging_status').textContent.includes ('· flat'));
    await dialog.getByRole ('button', { name : 'Close Packaging', exact : true }).click (); assert.equal ((await call ('scene.inspect')).selectedObjectId, objectId);
    assert.equal (await page.locator ('p.workspace_upload_hint').count (), 0); assert.equal (await page.getByText ('No embedded animation in this model.', { exact : false }).count (), 0);
    assert.deepEqual (errors, []); console.log ('CAD arrow/pen, Ctrl selection, process settings, folded Apply, guarded custom fold and explicit flat Apply passed.');
} finally { await browser.close (); }
