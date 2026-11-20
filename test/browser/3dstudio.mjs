import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { OpenSessionArchive } from '../../source/website/sessionarchive.js';
import { MockMacroApi } from './macro-api-mock.mjs';

// Full app contract: native module shell, real WASM worker, live inputs, scene
// history and portable archives. No panel or solid evaluation is replaced.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
let page;
try {
    await mkdir ('work/3dstudio', { recursive : true });
    page = await browser.newPage ({ viewport : { width : 1440, height : 1050 } }); page.setDefaultTimeout (120000);
    const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'studio-fixture', email : 'fixture@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    await MockMacroApi (page, { user : 'studio-fixture' });
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html');
    await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => {
        const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args });
        assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result;
    };
    const until = async (description, predicate) => {
        const deadline = Date.now () + 120000; let last;
        for (;;) {
            try { last = await predicate (); if (last) { return last; } }
            catch (error) { if (!error.message.includes ('viewer is busy')) { throw error; } }
            assert.ok (Date.now () < deadline, 'Timed out: ' + description + ' (' + JSON.stringify (last) + ')'); await page.waitForTimeout (80);
        }
    };
    const near = (actual, expected, label) => assert.ok (Math.abs (actual - expected) < .001, label + ': ' + actual + ' vs ' + expected);
    const inspect = () => call ('studio.inspect');
    const changed = (description, predicate) => until (description, async () => {
        const state = await inspect (); if (!state.busy && predicate (state)) { return state; }
        if (!state.busy) { const message = await page.locator ('.studio_status').innerText (); if (/^\[(conflict|command_failed|permission_required)\]/.test (message)) { throw new Error (description + ': ' + message); } }
        return false;
    });
    await page.evaluate (() => {
        const prototype = OV.Engine.Viewer.prototype, original = prototype.SetMainObject;
        const probe = window.studioProbe = { root : null, restore : () => { prototype.SetMainObject = original; } };
        prototype.SetMainObject = function (...args) { const result = original.apply (this, args); if (this.renderer?.domElement === document.querySelector ('#main_viewer canvas')) { probe.root = args[0]; } return result; };
        probe.geometry = () => (probe.root?.children || []).map (object => {
            object.updateWorldMatrix (true, true); let triangles = 0;
            const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
            object.traverse (mesh => {
                const positions = mesh.geometry?.attributes?.position; if (!mesh.isMesh || !positions) { return; }
                triangles += (mesh.geometry.index?.count || positions.count) / 3;
                for (let i = 0; i < positions.count; i++) { const p = mesh.localToWorld (mesh.position.clone ().fromBufferAttribute (positions, i)).toArray (); for (let j = 0; j < 3; j++) { min[j] = Math.min (min[j], p[j]); max[j] = Math.max (max[j], p[j]); } }
            });
            return { min, max, triangles };
        });
    });
    const geometry = () => page.evaluate (() => studioProbe.geometry ());
    await call ('ui.3dstudio'); const panel = page.getByRole ('region', { name : '3Dstudio', exact : true }); console.log ('3Dstudio module loaded.');
    assert.equal (await panel.locator ('[data-primitive]').count (), 7);
    for (const type of ['sphere', 'tube', 'cone', 'torus', 'capsule', 'box']) { await panel.locator ('[data-primitive="' + type + '"]').click (); assert.equal (await panel.locator ('[data-primitive="' + type + '"]').getAttribute ('aria-pressed'), 'true'); }
    const number = label => panel.getByRole ('spinbutton', { name : 'Studio ' + label, exact : true });
    const set = async (label, value) => { const input = number (label); await input.fill (String (value)); await input.press ('Enter'); };
    await set ('Height', 60); await set ('Width', 80); await set ('Depth', 60);
    await panel.getByRole ('button', { name : 'Generate', exact : true }).click ();
    let state = await changed ('generated box selection', value => value.available && value.objects.length === 1); const boxId = state.objectId; console.log ('Editable box generated through the panel.');
    assert.equal (await panel.getByRole ('button', { name : 'Generate new', exact : true }).count (), 1, 'generation immediately enters selected-model editing');
    await set ('Height', 80); state = await changed ('live box height', value => value.definition.nodes[0].parameters.heightMm === 80);
    assert.equal (state.objects.length, 1); assert.equal (state.objectId, boxId); near ((await geometry ())[0].max[1], 80, 'live dimensions reach rendered geometry');
    await call ('history.undo'); state = await inspect (); assert.equal (state.definition.nodes[0].parameters.heightMm, 60);
    await call ('history.redo'); state = await inspect (); assert.equal (state.definition.nodes[0].parameters.heightMm, 80);
    await set ('Height', -5); await until ('invalid dimensions are rejected visibly', async () => await number ('Height').getAttribute ('aria-invalid') === 'true'); assert.equal ((await inspect ()).definition.nodes[0].parameters.heightMm, 80);
    await number ('Height').press ('Escape'); assert.equal (Number (await number ('Height').inputValue ()), 80, 'Escape restores the committed measurement');
    await set ('Width', 85); await set ('Depth', 55); await changed ('coalesced width and depth', value => value.definition.nodes[0].parameters.widthMm === 85 && value.definition.nodes[0].parameters.depthMm === 55);
    await call ('preferences.units', { units : 'standard' }); await until ('inch field display', async () => Math.abs (Number (await number ('Height').inputValue ()) - 80 / 25.4) < .000001);
    await set ('Height', 4); await changed ('inch edit converts to canonical millimeters', value => Math.abs (value.definition.nodes[0].parameters.heightMm - 101.6) < .001);
    await call ('preferences.units', { units : 'metric' }); await set ('Height', 80); await changed ('metric height restored', value => value.definition.nodes[0].parameters.heightMm === 80);
    console.log ('Live fields, invalid-input recovery, Undo/Redo and display units passed.');
    await panel.locator ('[data-primitive="cylinder"]').click (); await set ('Height', 120); await set ('Diameter', 24);
    await panel.getByRole ('button', { name : 'Generate', exact : true }).click (); state = await changed ('generated editable rod', value => value.objects.length === 2 && value.objectId !== boxId); const toolId = state.objectId;
    let rendered = await geometry (); assert.ok (rendered[1].min[0] >= rendered[0].max[0] + 9.999, 'new solids are spaced clear of earlier models');
    await call ('object.transform', { objectId : toolId, position : [0, -10, 0], units : 'model' });
    await panel.getByLabel ('Boolean target', { exact : true }).selectOption (boxId); await panel.getByLabel ('Boolean tool', { exact : true }).selectOption (toolId); await panel.getByLabel ('Boolean operation', { exact : true }).selectOption ('subtract');
    await panel.getByRole ('button', { name : 'Apply Boolean', exact : true }).click (); state = await changed ('subtracted result selected', value => value.objects.length === 3 && value.definition.nodes.some (node => node.kind === 'boolean'));
    const resultId = state.objectId, resultNodeId = state.definition.rootId, baseId = state.definition.nodes.find (node => node.kind === 'primitive' && node.type === 'box').id;
    assert.equal (state.objects.find (object => object.objectId === boxId).visible, false); assert.equal (state.objects.find (object => object.objectId === toolId).visible, false);
    rendered = await geometry (); assert.ok (rendered.at (-1).triangles > 12, 'the rendered result contains a real cylindrical subtraction');
    await call ('history.undo'); state = await inspect (); assert.equal (state.objects.length, 2); assert.ok (state.objects.every (object => object.visible));
    await call ('history.redo'); state = await inspect (); assert.equal (state.objectId, resultId); assert.equal (state.objects.length, 3);
    await panel.locator ('[data-node-id="' + baseId + '"]').click (); await set ('Height', 90); state = await changed ('upstream primitive edit rebuilds Boolean result', value => value.definition.nodes.find (node => node.id === baseId).parameters.heightMm === 90);
    assert.equal (state.definition.nodes.length, 4); assert.equal (state.definition.rootId, resultNodeId); assert.equal (state.objectId, resultId);
    await panel.getByRole ('button', { name : 'Show through this step', exact : true }).click (); state = await changed ('history rollback retains future', value => value.definition.rootId === baseId); assert.equal (state.definition.tipId, resultNodeId); assert.equal (state.definition.nodes.length, 4);
    assert.equal ((await geometry ()).at (-1).triangles, 12, 'rollback displays the pre-Boolean box');
    await panel.getByRole ('button', { name : 'Resume full model', exact : true }).click (); await changed ('resume retained full result', value => value.definition.rootId === resultNodeId); assert.ok ((await geometry ()).at (-1).triangles > 12);
    await panel.locator ('[data-node-id="' + resultNodeId + '"]').click (); await panel.getByLabel ('Enable history operation', { exact : true }).uncheck (); await changed ('suppress operation', value => value.definition.nodes.find (node => node.id === resultNodeId).enabled === false); assert.equal ((await geometry ()).at (-1).triangles, 12);
    await panel.getByLabel ('Enable history operation', { exact : true }).check (); await changed ('restore operation', value => value.definition.nodes.find (node => node.id === resultNodeId).enabled);
    console.log ('Real subtraction and editable history rollback/resume/suppression passed.');
    await panel.locator ('[data-node-id="' + baseId + '"]').click (); await panel.getByRole ('button', { name : 'Fit model', exact : true }).click (); await panel.evaluate (node => { node.scrollTop = 0; }); await page.screenshot ({ path : 'work/3dstudio/desktop.png', timeout : 120000 });
    await call ('ui.module.mode', { module : '3dstudio', mode : 'extended' }); assert.equal (await page.getByRole ('dialog', { name : '3Dstudio extended workspace', exact : true }).count (), 1);
    assert.ok (await panel.evaluate (node => node.scrollWidth <= node.clientWidth + 1), 'extended module has no horizontal overflow'); await page.screenshot ({ path : 'work/3dstudio/extended.png', timeout : 120000 });
    await call ('ui.module.mode', { module : '3dstudio', mode : 'minimal' });
    const expectedDefinition = (await inspect ()).definition;
    await page.evaluate (() => { window.showSaveFilePicker = undefined; }); await call ('ui.save'); await page.getByLabel ('Save name', { exact : true }).fill ('3Dstudio editable solid');
    const download = page.waitForEvent ('download'); await page.getByRole ('button', { name : 'Save session file', exact : true }).click (); const bytes = await readFile (await (await download).path ()); await writeFile ('work/3dstudio/editable-solid.auto3d', bytes);
    const archive = OpenSessionArchive (bytes), saved = archive.document.objects.find (object => object.id === resultId); assert.deepEqual (JSON.parse (saved.userData._auto3dStudio), expectedDefinition);
    await page.getByRole ('button', { name : 'Close Save session', exact : true }).click (); await page.locator ('#open_file').setInputFiles ({ name : 'Editable solid.auto3d', mimeType : 'application/octet-stream', buffer : bytes });
    await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Opened ')); await call ('object.select', { objectId : resultId, single : true });
    state = await inspect (); assert.deepEqual (state.definition, expectedDefinition); await call ('ui.3dstudio'); await panel.locator ('[data-node-id="' + baseId + '"]').click (); await set ('Width', 95);
    await changed ('reopened authoring graph remains editable', value => value.definition.nodes.find (node => node.id === baseId).parameters.widthMm === 95);
    await panel.locator ('[data-primitive="tube"]').click (); await panel.getByRole ('button', { name : 'Generate', exact : true }).click ();
    state = await changed ('generated tube', value => value.objects.length === 4 && value.definition.nodes[0].type === 'tube'); const tubeId = state.objectId;
    await set ('Wall thickness', 3); state = await changed ('selected tube wall thickness drives the saved inner diameter', value => value.definition.nodes[0].parameters.innerDiameterMm === 44);
    assert.equal (state.objectId, tubeId); assert.equal (state.objects.length, 4); assert.equal (state.definition.nodes[0].parameters.outerDiameterMm, 50);
    assert.equal (Number (await number ('Inner diameter').inputValue ()), 44); assert.equal (Number (await number ('Wall thickness').inputValue ()), 3);
    console.log ('Portable authoring archive reopen and selected-tube wall editing passed.');
    await page.setViewportSize ({ width : 390, height : 844 }); await call ('ui.module.mode', { module : '3dstudio', mode : 'minimal' }); await panel.evaluate (node => { node.scrollTop = 0; });
    assert.ok (await panel.evaluate (node => node.scrollWidth <= node.clientWidth + 1), 'mobile module has no horizontal overflow'); assert.equal (await panel.locator ('[data-primitive]').count (), 7);
    await page.screenshot ({ path : 'work/3dstudio/mobile.png', timeout : 120000 }); assert.deepEqual (errors, []);
    console.log ('3Dstudio native shell, all primitive cards, live canonical-unit inputs, real subtraction, retained-history editing/rollback/suppression, Undo/Redo, portable editable save/reopen, desktop/extended/mobile checks passed.');
} catch (error) {
    if (page && !page.isClosed ()) { await writeFile ('work/3dstudio/failure.txt', error.stack + '\n' + await page.locator ('body').innerText ()).catch (() => {}); await page.screenshot ({ path : 'work/3dstudio/failure.png', timeout : 30000 }).catch (() => {}); }
    throw error;
} finally {
    if (page && !page.isClosed ()) { await page.evaluate (() => { window.studioProbe?.restore (); delete window.studioProbe; }).catch (() => {}); }
    await browser.close ();
}
