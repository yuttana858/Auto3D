import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { MockMacroApi } from './macro-api-mock.mjs';

// Real panel input and rendered geometry: a selected product changes in place,
// while Generate creates a separate object outside the existing scene bounds.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
let page;
try {
    await mkdir ('work/primary-live-placement', { recursive : true });
    page = await browser.newPage ({ viewport : { width : 1400, height : 1000 } }); page.setDefaultTimeout (120000);
    const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'primary-placement-fixture', email : 'fixture@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    await MockMacroApi (page, { user : 'primary-placement-fixture' });
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
            catch (error) { if (!error.message.includes ('The viewer is busy. Retry after loading completes.')) { throw error; } }
            assert.ok (Date.now () < deadline, 'Timed out: ' + description + ' (' + JSON.stringify (last) + ')'); await page.waitForTimeout (80);
        }
    };
    const near = (actual, expected, description) => assert.ok (Math.abs (actual - expected) < .001, description + ': ' + actual + ' vs ' + expected);
    const definition = object => JSON.parse (object.userData._auto3dPrimaryProduct);
    const settled = async () => { const state = await call ('primary.inspect'); return !state.generating && !state.liveUpdating; };
    // Observe, without replacing, the actual viewer's model installation. Scene
    // object order corresponds to these root children in SessionEditor.Render.
    await page.evaluate (() => {
        const prototype = OV.Engine.Viewer.prototype, original = prototype.SetMainObject;
        const probe = window.primaryPlacementProbe = { root : null, restore : () => { prototype.SetMainObject = original; } };
        prototype.SetMainObject = function (...args) {
            const result = original.apply (this, args);
            if (this.renderer?.domElement === document.querySelector ('#main_viewer canvas')) { probe.root = args[0]; }
            return result;
        };
        probe.bounds = () => (probe.root?.children || []).map (object => {
            object.updateWorldMatrix (true, true);
            const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
            object.traverse (mesh => {
                const positions = mesh.geometry?.attributes?.position; if (!mesh.isMesh || !positions) { return; }
                for (let i = 0; i < positions.count; i++) {
                    const world = mesh.localToWorld (mesh.position.clone ().fromBufferAttribute (positions, i)).toArray ();
                    for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min (min[axis], world[axis]); max[axis] = Math.max (max[axis], world[axis]); }
                }
            });
            return { min, max };
        });
    });
    const bounds = () => page.evaluate (() => primaryPlacementProbe.bounds ());
    await call ('ui.primary_products');
    // Opaque PET exercises the same model/placement paths without making this
    // interaction regression a repeated physical-glass rendering stress test.
    await call ('primary.configure', { material : 'petOpaque' }); await call ('primary.callouts.set', { visible : false });
    const panel = page.getByRole ('region', { name : 'Primary Products', exact : true });
    const height = panel.getByRole ('spinbutton', { name : 'Product height', exact : true });
    const scale = panel.getByRole ('spinbutton', { name : 'Product scale percent', exact : true });
    assert.equal (await panel.getByRole ('button', { name : 'Apply scale', exact : true }).count (), 0);
    const generate = async count => {
        await panel.getByRole ('button', { name : count === 1 ? 'Generate' : 'Generate new', exact : true }).click ();
        return until ('generated object ' + count, async () => { const scene = await call ('scene.inspect'); return scene.objects.length === count && await settled () ? scene : false; });
    };
    let scene = await generate (1); const firstId = scene.objects[0].id;
    assert.deepEqual (scene.objects[0].position, [0, 0, 0], 'the first product keeps its normal origin');
    const firstPosition = [...scene.objects[0].position];
    const changed = (id, expected, count) => until ('live height ' + expected, async () => {
        const state = await call ('scene.inspect'); assert.equal (state.objects.length, count, 'manual edits must not generate extra objects'); assert.equal (state.selectedObjectId, id);
        const object = state.objects.find (item => item.id === id);
        return Math.abs (definition (object).draft.heightMm - expected) < .001 && await settled () ? state : false;
    });
    await height.fill ('240'); scene = await changed (firstId, 240, 1); const baselineDiameter = definition (scene.objects[0]).draft.diameterMm;
    near ((await bounds ())[0].max[1] - (await bounds ())[0].min[1], 240, 'manual input changes rendered height');
    await scale.fill ('125'); await changed (firstId, 300, 1);
    await scale.fill ('130'); scene = await changed (firstId, 312, 1);
    near (definition (scene.objects[0]).draft.diameterMm, baselineDiameter * 1.3, '130% uses the same baseline as 125%');
    near ((await bounds ())[0].max[1] - (await bounds ())[0].min[1], 312, 'scale updates actual rendered geometry');
    assert.deepEqual (scene.objects[0].position, firstPosition, 'live rebuilding keeps its position');

    scene = await generate (2); const secondId = scene.selectedObjectId, second = scene.objects.find (item => item.id === secondId), secondDefinition = definition (second);
    const secondPosition = [...second.position]; let rendered = await bounds ();
    assert.ok (rendered[1].min[0] >= rendered[0].max[0] + 9.999, 'the next product has a real gap between rendered bounds');
    assert.deepEqual (scene.objects[0].position, firstPosition, 'generation leaves the prior object where it was');
    await call ('object.select', { objectId : firstId, single : true });
    await until ('manual field follows the older selected product', async () => Number (await height.inputValue ()) === 312);
    await height.fill ('260'); scene = await changed (firstId, 260, 2);
    assert.deepEqual (definition (scene.objects.find (item => item.id === secondId)), secondDefinition, 'editing the older selected object leaves its neighbor unchanged');
    assert.deepEqual (scene.objects.find (item => item.id === secondId).position, secondPosition);
    await until ('dimension editing resets the scale baseline', async () => Number (await scale.inputValue ()) === 100);

    await call ('object.transform', { objectId : firstId, position : [400, 0, 0], rotation : [0, 45, 0], scale : [1.5, 1, 1], units : 'model' });
    const existing = await call ('scene.inspect'), previousBounds = await bounds ();
    scene = await generate (3); const thirdId = scene.selectedObjectId, thirdPosition = [...scene.objects.find (item => item.id === thirdId).position]; rendered = await bounds ();
    assert.ok (rendered[2].min[0] >= Math.max (...previousBounds.map (box => box.max[0])) + 9.999, 'placement measures moved, rotated and scaled scene objects');
    assert.deepEqual (scene.objects.slice (0, 2), existing.objects, 'generation preserves every preexisting object');
    await call ('history.undo'); scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 2); assert.deepEqual (scene.objects, existing.objects);
    await call ('history.redo'); scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 3);
    assert.equal (scene.selectedObjectId, thirdId); assert.deepEqual (scene.objects.find (item => item.id === thirdId).position, thirdPosition, 'Redo restores the recorded placement instead of finding a new location');
    assert.deepEqual (await bounds (), rendered, 'Redo restores the same rendered bounds');
    assert.deepEqual (errors, []);
    console.log ('Primary Products live manual fields, absolute percentage scaling, older-object selection, automatic placement against transformed bounds, and Undo/Redo passed.');
} catch (error) {
    if (page && !page.isClosed ()) {
        await writeFile ('work/primary-live-placement/failure.txt', error.stack + '\n' + await page.locator ('body').innerText ()).catch (() => {});
        await page.screenshot ({ path : 'work/primary-live-placement/failure.png', timeout : 30000 }).catch (() => {});
    }
    throw error;
} finally {
    if (page && !page.isClosed ()) { await page.evaluate (() => { window.primaryPlacementProbe?.restore (); delete window.primaryPlacementProbe; }).catch (() => {}); }
    await browser.close ();
}
