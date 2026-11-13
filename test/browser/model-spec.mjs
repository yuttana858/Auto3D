import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Model spec is the default right panel, returns when a module closes, and carries preview actions and the packaging section.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 900 } }); const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : [] } }));
    await page.route ('**/api/personal/items', (route) => route.fulfill ({ json : [] }));
    await page.route ('**/api/auth/**', (route) => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
    await page.route ('**/api/accounts/**', (route) => route.fulfill ({ json : { isAdmin : false } }));
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, id + ' ' + JSON.stringify (result)); return result.result; };
    const panels = async () => Object.fromEntries ((await call ('ui.modules.inspect')).panels.map (panel => [panel.id, panel]));

    // Default right panel, AI not open.
    let state = await panels (); assert.equal (state.data.title, 'Model spec'); assert.equal (state.data.visible, true); assert.equal (state.ai.visible, false);
    assert.equal (await page.locator ('#data_panel_toggle').textContent (), 'Model spec›');
    assert.deepEqual (await call ('ui.model_spec.inspect'), { open : true, selected : null, rotating : false });

    // Modules open only from their icons; closing one returns to Model spec, closing Model spec collapses the side.
    await call ('ui.ai'); state = await panels (); assert.equal (state.ai.visible, true); assert.equal (state.data.visible, false);
    await page.getByRole ('button', { name : 'Close AI Generative panel', exact : true }).click ();
    for (let tries = 0; tries < 50 && !(await panels ()).data.visible; tries++) { await page.waitForTimeout (100); }
    state = await panels (); assert.equal (state.data.visible, true); assert.equal (state.ai.visible, false);
    // Clicking an open module's icon again deselects it and returns to Model spec.
    const aiIcon = page.getByRole ('toolbar', { name : 'Object tools' }).getByRole ('button', { name : 'AI Generative', exact : true });
    await aiIcon.click (); for (let tries = 0; tries < 50 && !(await panels ()).ai.visible; tries++) { await page.waitForTimeout (100); } assert.equal (await aiIcon.getAttribute ('aria-pressed'), 'true');
    await aiIcon.click (); for (let tries = 0; tries < 50 && !(await panels ()).data.visible; tries++) { await page.waitForTimeout (100); }
    state = await panels (); assert.equal (state.ai.visible, false); assert.equal (state.data.visible, true); assert.equal (await aiIcon.getAttribute ('aria-pressed'), 'false');
    assert.deepEqual (await call ('ui.module.toggle', { module : 'packaging' }), { panels : ['packaging'] }); assert.deepEqual (await call ('ui.module.toggle', { module : 'packaging' }), { panels : ['data'] });
    assert.equal ((await page.evaluate (() => Auto3D.execute ('ui.module.toggle', { module : 'data' }))).ok, false);
    await call ('ui.module.mode', { module : 'data', mode : 'closed' }); state = await panels (); assert.equal (Object.values (state).some (panel => panel.side === 'right' && panel.visible), false);
    await call ('ui.module.mode', { module : 'data', mode : 'minimal' });

    // A generated box shows preview actions and its packaging spec.
    await call ('packaging.fefco.generate', { length : 400, width : 300, height : 250 });
    const box = (await call ('scene.inspect')).objects[0]; await call ('object.select', { objectId : box.id });
    const spec = page.locator ('.scene_packaging_spec'); await spec.waitFor ();
    assert.match (await spec.textContent (), /Packaging · FEFCO 0201/); assert.match (await spec.textContent (), /400 × 300 × 250 mm/);
    const inspected = await call ('ui.model_spec.inspect'); assert.equal (inspected.selected.id, box.id); assert.equal (inspected.selected.packaging.code, '0201'); assert.deepEqual ([inspected.selected.packaging.length, inspected.selected.packaging.width, inspected.selected.packaging.height], [400, 300, 250]);
    assert.ok (inspected.selected.triangles > 0); assert.equal (inspected.selected.unit, 'mm');
    for (const name of ['Open in CAD Studio', 'Packaging Gen tools']) { assert.equal (await spec.getByRole ('button', { name, exact : true }).count (), 1, name); }

    // Rotate turntable (button and command), Update opens the replacement picker, × deletes with Undo.
    const actions = page.getByRole ('toolbar', { name : 'Selected model actions' }); const rotate = actions.getByRole ('button', { name : 'Rotate', exact : true });
    await rotate.click (); assert.equal (await rotate.getAttribute ('aria-pressed'), 'true'); assert.equal ((await call ('ui.model_spec.inspect')).rotating, true);
    assert.deepEqual (await call ('ui.model_spec.preview', { rotate : false }), { rotating : false, preview : true }); assert.equal (await rotate.getAttribute ('aria-pressed'), 'false');
    assert.equal ((await page.evaluate (() => Auto3D.execute ('ui.model_spec.preview', { rotate : 'yes' }))).ok, false);
    const [chooser] = await Promise.all ([page.waitForEvent ('filechooser'), actions.getByRole ('button', { name : 'Update', exact : true }).click ()]); assert.ok (chooser);
    await actions.getByRole ('button', { name : 'Delete selected model', exact : true }).click ();
    for (let tries = 0; tries < 50 && (await call ('scene.inspect')).objects.length; tries++) { await page.waitForTimeout (100); }
    assert.equal ((await call ('scene.inspect')).objects.length, 0);
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);

    // Packaging Gen tools opens the full module from Model spec.
    await call ('object.select', { objectId : box.id }); await spec.getByRole ('button', { name : 'Packaging Gen tools', exact : true }).click ();
    for (let tries = 0; tries < 50 && !(await panels ()).packaging.visible; tries++) { await page.waitForTimeout (100); }
    assert.equal ((await panels ()).packaging.visible, true);
    assert.deepEqual (errors, []); console.log ('Model spec default, return on module close, module icon toggle, preview Rotate/Update/Delete, packaging spec and tools passed.');
} finally { await browser.close (); }
