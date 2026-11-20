import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { MockMacroApi } from './macro-api-mock.mjs';

const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
let page;
try {
    await mkdir ('work/selection-groups', { recursive : true });
    page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); page.setDefaultTimeout (120000);
    const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'selection-groups-fixture', email : 'fixture@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    await MockMacroApi (page, { user : 'selection-groups-fixture' });
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html');
    await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const execute = (id, args = {}) => page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args });
    const call = async (id, args = {}) => { const response = await execute (id, args); assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result; };
    const until = async (description, predicate) => {
        const deadline = Date.now () + 120000;
        for (;;) {
            try { const result = await predicate (); if (result) { return result; } }
            catch (error) { if (!error.message.includes ('The viewer is busy. Retry after loading completes.')) { throw error; } }
            assert.ok (Date.now () < deadline, 'Timed out: ' + description); await page.waitForTimeout (80);
        }
    };
    const scene = () => call ('scene.inspect');
    const selection = async expected => until ('selected objects ' + expected.join (', '), async () => {
        const state = await scene (); return JSON.stringify ([...state.selectedObjectIds].sort ()) === JSON.stringify ([...expected].sort ()) ? state : false;
    });

    // Observe the installed viewer, deriving drag coordinates from its actual
    // rendered geometry. Selection itself always uses real mouse/keyboard UI.
    await page.evaluate (() => {
        const prototype = OV.Engine.Viewer.prototype, original = prototype.SetMainObject;
        const probe = window.selectionGroupsProbe = { root : null, viewer : null, restore : () => { prototype.SetMainObject = original; } };
        prototype.SetMainObject = function (...args) {
            const result = original.apply (this, args);
            if (this.renderer?.domElement === document.querySelector ('#main_viewer canvas')) { probe.root = args[0]; probe.viewer = this; }
            return result;
        };
        probe.projected = () => (probe.root?.children || []).map (object => {
            object.updateWorldMatrix (true, true);
            const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
            object.traverse (mesh => {
                const positions = mesh.geometry?.attributes?.position; if (!mesh.isMesh || !positions) { return; }
                for (let i = 0; i < positions.count; i++) {
                    const point = mesh.localToWorld (mesh.position.clone ().fromBufferAttribute (positions, i)).project (probe.viewer.camera);
                    const normalized = [(point.x + 1) / 2, (1 - point.y) / 2];
                    for (let axis = 0; axis < 2; axis++) { min[axis] = Math.min (min[axis], normalized[axis]); max[axis] = Math.max (max[axis], normalized[axis]); }
                }
            });
            return { min, max };
        });
    });
    await call ('primary.configure', { material : 'petOpaque' }); await call ('primary.callouts.set', { visible : false });
    const ids = [];
    for (let i = 0; i < 3; i++) { ids.push ((await call ('primary.generate')).objectId); }
    const camera = await call ('camera.current.inspect'), direction = camera.center.map ((value, axis) => value - camera.eye[axis]), up = camera.up;
    const right = [direction[1] * up[2] - direction[2] * up[1], direction[2] * up[0] - direction[0] * up[2], direction[0] * up[1] - direction[1] * up[0]];
    const length = Math.hypot (...right);
    for (let i = 0; i < ids.length; i++) { await call ('object.transform', { objectId : ids[i], position : right.map (value => value / length * (i - 1) * 250), units : 'model' }); }
    await call ('view.fit'); await call ('selection.clear');
    const projected = await page.evaluate (() => selectionGroupsProbe.projected ());
    assert.equal (projected.length, 3);
    assert.ok (projected[0].max[0] < projected[1].min[0] && projected[1].max[0] < projected[2].min[0], 'fixture models must be separated on screen');
    const canvas = page.locator ('#main_viewer canvas').first (), toolbar = page.getByRole ('toolbar', { name : 'Object tools', exact : true });
    const rectangleButton = toolbar.getByRole ('button', { name : 'Rectangle select (B)', exact : true });
    const rect = indexes => {
        const boxes = indexes.map (index => projected[index]);
        return { x1 : Math.max (.001, Math.min (...boxes.map (box => box.min[0])) - .008), y1 : Math.max (.001, Math.min (...boxes.map (box => box.min[1])) - .008), x2 : Math.min (.999, Math.max (...boxes.map (box => box.max[0])) + .008), y2 : Math.min (.999, Math.max (...boxes.map (box => box.max[1])) + .008) };
    };
    const point = async (x, y) => { const bounds = await canvas.boundingBox (); return { x : bounds.x + x * bounds.width, y : bounds.y + y * bounds.height }; };
    const drag = async (rectangle, modifier = null, cancel = false) => {
        const start = await point (rectangle.x1, rectangle.y1), end = await point (rectangle.x2, rectangle.y2);
        if (modifier) { await page.keyboard.down (modifier); }
        await page.mouse.move (start.x, start.y); await page.mouse.down (); await page.mouse.move (end.x, end.y, { steps : 8 });
        if (cancel) { await page.keyboard.press ('Escape'); }
        await page.mouse.up (); if (modifier) { await page.keyboard.up (modifier); }
    };
    await rectangleButton.click ();
    const beforeDrag = await call ('camera.current.inspect');
    await drag (rect ([0, 1])); await selection (ids.slice (0, 2));
    assert.deepEqual (await call ('camera.current.inspect'), beforeDrag, 'rectangular selection must not orbit the camera');
    await drag (rect ([2]), 'Shift'); await selection (ids);
    await drag (rect ([1]), 'Alt'); await selection ([ids[0], ids[2]]);
    await drag (rect ([1]), null, true); await selection ([ids[0], ids[2]]);
    await call ('selection.rectangle.mode', { active : true });
    await drag (rect ([0, 1])); await selection (ids.slice (0, 2));

    const originalObjects = (await scene ()).objects;
    await toolbar.getByRole ('button', { name : 'Group (Ctrl+G)', exact : true }).click ();
    let state = await until ('new group', async () => { const current = await scene (); return current.groups.length === 1 ? current : false; });
    const groupId = state.groups[0]; assert.ok (state.objects.slice (0, 2).every (object => object.userData._auto3dGroup === groupId));
    await page.screenshot ({ path : 'work/selection-groups/group-selection.png', timeout : 30000 });
    await call ('selection.clear'); await drag (rect ([0])); await selection (ids.slice (0, 2));
    await page.keyboard.press ('Control+Shift+G');
    await until ('keyboard ungroup', async () => (await scene ()).groups.length === 0); await selection (ids.slice (0, 2));
    await page.keyboard.press ('Control+G'); await until ('keyboard group', async () => (await scene ()).groups.length === 1);
    await toolbar.getByRole ('button', { name : 'Ungroup (Ctrl+Shift+G)', exact : true }).click ();
    await until ('toolbar ungroup', async () => (await scene ()).groups.length === 0);
    state = await scene (); assert.deepEqual (state.objects, originalObjects, 'grouping and ungrouping must preserve object transforms and non-group metadata');

    await page.keyboard.press ('v'); assert.equal ((await call ('selection.rectangle.inspect')).active, false);
    await call ('selection.clear');
    const center = await point ((projected[2].min[0] + projected[2].max[0]) / 2, (projected[2].min[1] + projected[2].max[1]) / 2);
    await page.mouse.click (center.x, center.y); await selection ([ids[2]]);
    await page.mouse.click (center.x, center.y, { button : 'right' });
    await page.locator ('.auto3d_context_menu').waitFor (); assert.equal (await page.locator ('.auto3d_context_menu').count (), 1);
    await page.keyboard.press ('Escape'); await page.locator ('.auto3d_context_menu').waitFor ({ state : 'detached' });

    // Explicit agent operations use the same service and refuse invalid input
    // before changing the current selection.
    await call ('selection.set', { objectIds : [ids[2]], mode : 'replace' }); await selection ([ids[2]]);
    for (const [id, args] of [['selection.rectangle', { x1 : -1, y1 : 0, x2 : 1, y2 : 1 }], ['selection.set', { objectIds : ['missing-object'] }]]) {
        assert.equal ((await execute (id, args)).ok, false); await selection ([ids[2]]);
    }
    await call ('selection.rectangle', { ...rect ([0]), mode : 'replace' }); await selection ([ids[0]]);
    await call ('selection.rectangle', { ...rect ([1]), mode : 'add' }); await selection (ids.slice (0, 2));
    await call ('selection.rectangle', { ...rect ([0]), mode : 'subtract' }); await selection ([ids[1]]);

    await call ('object.select', { objectId : ids[2], single : true });
    await call ('object.array', { width : 2, length : 1, height : 1, gap : { width : 20 }, units : 'model', animate : false });
    const arrayState = await scene (), arrayObjects = arrayState.objects.filter (object => object.userData._auto3dGroupKind === 'array');
    assert.equal (arrayState.objects.length, 4); assert.equal (arrayObjects.length, 2);
    const ungroupArray = toolbar.getByRole ('button', { name : 'Ungroup array', exact : true });
    assert.equal (await ungroupArray.isDisabled (), false); await ungroupArray.click ();
    state = await until ('array separated', async () => { const current = await scene (); return current.groups.length === 0 ? current : false; });
    assert.equal (state.objects.length, 4);
    for (const before of arrayObjects) {
        const after = state.objects.find (object => object.id === before.id);
        for (const key of ['position', 'rotation', 'scale']) { assert.deepEqual (after[key], before[key]); }
        for (const key of ['_auto3dGroup', '_auto3dGroupName', '_auto3dGroupKind']) { assert.equal (after.userData[key], undefined); }
    }
    assert.equal (await ungroupArray.isDisabled (), true);
    await call ('history.undo'); assert.deepEqual ((await scene ()).objects, arrayState.objects, 'Undo restores all array membership and metadata');
    await call ('history.redo'); assert.deepEqual ((await scene ()).objects, state.objects, 'Redo separates the same array without moving copies');
    await call ('history.undo');
    const commandResult = await call ('object.array.ungroup'); assert.ok (commandResult.ungrouped >= 2);
    assert.deepEqual ((await scene ()).objects, state.objects);
    assert.deepEqual (errors, []);
    console.log ('Rectangle drag/add/subtract/cancel, normal selection/context menu, atomic groups, toolbar/keyboard grouping, strict commands, array ungroup and Undo/Redo passed.');
} catch (error) {
    if (page && !page.isClosed ()) {
        await writeFile ('work/selection-groups/failure.txt', error.stack + '\n' + await page.locator ('body').innerText ()).catch (() => {});
        await page.screenshot ({ path : 'work/selection-groups/failure.png', timeout : 30000 }).catch (() => {});
    }
    throw error;
} finally {
    if (page && !page.isClosed ()) { await page.evaluate (() => { window.selectionGroupsProbe?.restore (); delete window.selectionGroupsProbe; }).catch (() => {}); }
    await browser.close ();
}
