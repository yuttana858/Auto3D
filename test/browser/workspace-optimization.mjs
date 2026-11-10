import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { Mesh } from '../../source/engine/model/mesh.js';
import { Triangle } from '../../source/engine/model/triangle.js';
import { Model } from '../../source/engine/model/model.js';
import { PhysicalMaterial } from '../../source/engine/model/material.js';
import { Coord3D } from '../../source/engine/geometry/coord3d.js';
import { Coord2D } from '../../source/engine/geometry/coord2d.js';
import { Unit } from '../../source/engine/model/unit.js';
import { SceneDocument } from '../../source/website/scenedocument.js';
import { PackSession, CreateSessionArchive } from '../../source/website/sessionarchive.js';
const mesh = new Mesh (); const n = 20; mesh.AddNormal (new Coord3D (0, 1, 0));
for (let z = 0; z <= n; z++) { for (let x = 0; x <= n; x++) { mesh.AddVertex (new Coord3D (x * 25.4, 0, z * 25.4)); mesh.AddTextureUV (new Coord2D (x / n, z / n)); } }
for (let z = 0; z < n; z++) { for (let x = 0; x < n; x++) { const a = z * (n + 1) + x; const b = a + 1; const c = a + n + 1; const d = c + 1; for (const vertices of [[a, c, b], [b, c, d]]) { mesh.AddTriangle (new Triangle (...vertices).SetNormals (0, 0, 0).SetTextureUVs (...vertices).SetMaterial (0).SetCurve (0)); } } }
const model = new Model (); model.SetUnit (Unit.Millimeter); model.AddMaterial (new PhysicalMaterial ()); model.AddMeshToRootNode (mesh); const document = new SceneDocument (); document.AddImported (model, 'Grid'); await mkdir ('work', { recursive : true }); await writeFile ('work/optimization.auto3d', CreateSessionArchive (PackSession (document)));
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); page.setDefaultTimeout (90000); const errors = []; page.on ('pageerror', (error) => errors.push (error.stack));
    await page.route ('**/api/auth/**', (route) => route.fulfill ({ json : { user : { id : 'optimization-user', email : 'user@example.com', name : 'User' } } }));
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'standard', theme : 2 }, folders : [] } }));
    await page.route ('**/api/accounts/**', (route) => route.fulfill ({ json : { isAdmin : false, requests : [] } }));
    await page.route ('**/api/personal/items', (route) => route.fulfill ({ json : [] }));
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const background = await page.locator ('.auth_header_button').evaluate ((node) => getComputedStyle (node).backgroundColor); assert.equal (background, 'rgba(0, 0, 0, 0)');
    await page.locator ('#open_file').setInputFiles ('work/optimization.auto3d'); await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Opened ')).catch (async (error) => { console.log ('Import status:', await page.locator ('.scene_status').textContent (), errors); throw error; });
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    const initial = (await call ('scene.inspect')).objects[0]; await call ('object.select', { objectId : initial.id });
    if (await page.locator ('#data_panel_toggle').getAttribute ('aria-expanded') === 'false') { await page.locator ('#data_panel_toggle').click (); }
    /* Details starts minimized; expand it to reach the W/L/H and Scale (%) inputs. */
    const detailsToggle = page.locator ('.details_collapse'); if (await detailsToggle.getAttribute ('aria-expanded') === 'false') { await detailsToggle.click (); }
    assert.equal (await detailsToggle.getAttribute ('aria-expanded'), 'true');
    const width = page.getByLabel ('W dimension in inches', { exact : true }); assert.equal (Number (await width.inputValue ()), 20); assert.equal (await page.getByText ('Model size', { exact : true }).count (), 0);
    await page.getByRole ('button', { name : 'Proportional scaling', exact : true }).click (); await width.fill ('10'); await width.dispatchEvent ('change'); const scaled = (await call ('scene.inspect')).objects[0]; assert.deepEqual (scaled.scale, [0.5, 0.5, 0.5]);
    /* Scale (%) applies live while typing and commits on change; there is no separate Apply scale button. */
    assert.equal (await page.getByRole ('button', { name : 'Apply scale', exact : true }).count (), 0);
    const percent = page.getByLabel ('Scale percentage', { exact : true }); await percent.fill ('200'); await percent.dispatchEvent ('change'); assert.deepEqual ((await call ('scene.inspect')).objects[0].scale, [1, 1, 1]);
    await call ('preferences.units', { units : 'metric' }); assert.equal (Number (await page.getByLabel ('W dimension in mm').inputValue ()), 508);
    await call ('object.transform', { position : [25.4, 0, 0], units : 'display' }); await call ('preferences.units', { units : 'standard' });
    console.log ('Scaling and units passed'); const summary = await call ('polygon.preview', { retain : 50, error : 0.1 }); assert.ok (summary.after < summary.before); const applied = await call ('polygon.apply'); assert.equal (applied.before, 800);
    await call ('history.undo'); const again = await call ('polygon.preview', { retain : 50 }); assert.equal (again.before, 800); await call ('polygon.cancel');
    await page.getByRole ('button', { name : 'Optimize polygons…', exact : true }).click (); const optimize = page.getByRole ('dialog', { name : 'Optimize polygons', exact : true }); await optimize.getByRole ('button', { name : 'Preview decimation' }).click (); await optimize.locator ('.polygon_preview_canvas').waitFor (); await optimize.getByRole ('button', { name : 'Apply optimization' }).click (); await optimize.waitFor ({ state : 'detached' });
    await call ('history.undo'); console.log ('Optimization apply/undo passed');
    await page.getByRole ('button', { name : 'Array selected object', exact : true }).click (); const array = page.getByRole ('dialog', { name : 'Array selected model', exact : true }); await array.getByLabel ('Width count (W)').fill ('2'); await array.getByLabel ('Length count (L)').fill ('2'); await array.getByLabel ('Array retained triangles percentage').fill ('50'); await array.getByRole ('button', { name : 'Preview optimized array' }).click (); await array.getByLabel ('Optimized array preview').waitFor (); await array.getByRole ('button', { name : 'Create array', exact : true }).click (); await array.waitFor ({ state : 'detached', timeout : 10000 }).catch (async (error) => { console.log ('Array status', await array.textContent (), errors); throw error; });
    /* The array reveal animation keeps the viewer busy (and inspect may report an earlier state before it starts); wait for this reveal to complete before inspecting. */
    let reveal = null; for (let retry = 0; retry < 300 && reveal?.state !== 'completed'; retry++) { if (retry) { await page.waitForTimeout (100); } reveal = (await page.evaluate (() => Auto3D.execute ('object.array.playback.inspect'))).result; }
    assert.equal (reveal.state, 'completed', JSON.stringify (reveal)); assert.equal (reveal.placed, 4);
    let scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 4); assert.equal (scene.selectedObjectIds.length, 4); assert.equal (scene.groups.length, 1);
    await call ('object.ungroup'); await call ('object.select', { objectId : scene.objects[0].id, single : true });
    /* Left workspace sections start collapsed; open Session objects to reach the object rows. */
    if (await page.locator ('#upload_panel_toggle').getAttribute ('aria-expanded') === 'false') { await page.locator ('#upload_panel_toggle').click (); }
    if (!await page.locator ('#session_objects').evaluate (node => node.open)) { await page.locator ('#session_objects > summary').click (); }
    await page.locator ('.session_object_row').nth (1).locator ('.object_name').click ({ modifiers : ['Control'] }); scene = await call ('scene.inspect'); assert.equal (scene.selectedObjectIds.length, 2);
    await call ('object.group', { name : 'My load' }); assert.equal ((await call ('scene.inspect')).groups.length, 1); await call ('history.undo'); assert.equal ((await call ('scene.inspect')).groups.length, 0);
    const stale = await call ('polygon.preview', { retain : 50 }); assert.ok (stale); await call ('object.scaling.percent', { percent : 75 }); const invalid = await page.evaluate (() => Auto3D.execute ('polygon.apply')); assert.equal (invalid.ok, false);
    assert.deepEqual (errors, []); console.log ('Units, proportional scaling, worker decimation/apply/undo, instanced array preview, grouping and Ctrl selection passed.');
} finally { await browser.close (); }
