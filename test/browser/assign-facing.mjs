import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Assign facing: footprint + arrows, click/command assignment turns the model and sets it on the floor, Undo, turn, finish.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 900 } }); const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : [] } }));
    await page.route ('**/api/personal/items', (route) => route.fulfill ({ json : [] }));
    await page.route ('**/api/auth/**', (route) => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
    await page.route ('**/api/accounts/**', (route) => route.fulfill ({ json : { isAdmin : false } }));
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, id + ' ' + JSON.stringify (result)); return result.result; };
    const fails = async (id, args = {}) => assert.equal ((await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args })).ok, false, id + ' ' + JSON.stringify (args));
    /* World footprint while assigning: [x (W), z (L), y (H)] rounded, and the model must sit on the floor. */
    const size = async () => { const world = (await call ('object.facing.inspect')).world; assert.ok (Math.abs (world.floor) < 1e-3, 'on the floor: ' + world.floor); return [world.size[0], world.size[2], world.size[1]].map (Math.round); };

    await call ('packaging.fefco.generate', { length : 400, width : 300, height : 250 });
    const box = (await call ('scene.inspect')).objects[0]; await call ('object.select', { objectId : box.id });
    await fails ('object.facing.assign', { front : '+x' }); /* not started */

    // Start from the Model spec button; the hint bar and overlay appear.
    await page.getByRole ('toolbar', { name : 'Selected model actions' }).getByRole ('button', { name : 'Assign facing', exact : true }).click ();
    const bar = page.getByRole ('toolbar', { name : 'Assign facing' }); await bar.waitFor ();
    const start = await size (); assert.equal (new Set (start).size, 3, 'box sides differ: ' + start);
    let state = await call ('object.facing.inspect'); assert.equal (state.active, true); assert.equal (state.objectId, box.id); assert.deepEqual ([state.worldFront, state.worldUp, state.mode], ['+z', '+y', 'front']);
    assert.equal (await page.evaluate (() => document.querySelector ('#main_viewer canvas') !== null), true);

    // Making the +X side the Front turns the model a quarter turn: width and length swap, height stays, and it is on the floor.
    await fails ('object.facing.assign', { front : '+x', up : '+y' }); await fails ('object.facing.assign', { front : 'x' });
    state = await call ('object.facing.assign', { front : '+x' }); assert.deepEqual (await size (), [start[1], start[0], start[2]]);
    assert.deepEqual (state.assigned, { front : '+x', up : '+y' });
    const placed = (await call ('scene.inspect')).objects[0]; assert.deepEqual (placed.rotation, [0, -90, 0]); /* +X onto front (+Z) is a quarter turn about up, snapped to whole degrees */
    // Making the current front the Up side tips it: the old length becomes the height.
    await call ('object.facing.assign', { up : '+z' }); const tipped = await size (); assert.equal (tipped[2], start[0], 'after the quarter turn the front side is the original width; tipping it up makes that the height: ' + tipped);
    assert.match ((await call ('object.facing.inspect')).assigned.up, /^[+-][xyz]$/);
    // Undo twice restores the original orientation and facing record.
    await call ('history.undo'); await call ('history.undo'); assert.deepEqual (await size (), start); assert.equal ((await call ('object.facing.inspect')).assigned, null);
    await call ('history.redo'); assert.deepEqual (await size (), [start[1], start[0], start[2]]);

    // Turn buttons and command.
    await bar.getByRole ('button', { name : 'Turn left 90 degrees' }).click (); assert.deepEqual (await size (), start);
    assert.equal ((await call ('object.facing.turn', { degrees : 180 })).active, true); assert.deepEqual (await size (), start); await fails ('object.facing.turn', { degrees : 45 });

    // Clicking the model in the viewer assigns the face under the pointer; Shift+click (or Up mode) assigns Up.
    const canvas = page.locator ('#main_viewer canvas').first (); const rect = await canvas.boundingBox ();
    await call ('view.fit'); const before = JSON.stringify ((await call ('scene.inspect')).objects[0].rotation);
    let hit = false;
    for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.5, 0.6]]) {
        await page.mouse.move (rect.x + rect.width * fx, rect.y + rect.height * fy); const hover = (await call ('object.facing.inspect')).hover;
        if (!hover || hover === '+z') { continue; } /* +z is already the front; the top (+y) or a side tips or turns the model */
        await page.mouse.click (rect.x + rect.width * fx, rect.y + rect.height * fy); hit = true; break;
    }
    assert.ok (hit, 'a face other than the current front was under the pointer'); assert.notEqual (JSON.stringify ((await call ('scene.inspect')).objects[0].rotation), before, 'click assigned the front');
    assert.equal ((await call ('scene.inspect')).selectedObjectId, box.id, 'assignment click keeps the selection');
    await bar.getByRole ('button', { name : 'Up', exact : true }).click (); assert.equal ((await call ('object.facing.inspect')).mode, 'up'); await call ('object.facing.mode', { mode : 'front' });

    // Escape finishes; the overlay and bar are removed. Selecting nothing also ends it.
    await page.keyboard.press ('Escape'); assert.equal ((await call ('object.facing.inspect')).active, false); assert.equal (await bar.count (), 0);
    await call ('object.facing.open', { objectId : box.id }); await call ('selection.clear'); assert.equal ((await call ('object.facing.inspect')).active, false);
    await fails ('object.facing.open');
    assert.deepEqual (errors, []); console.log ('Assign facing: footprint/arrows, Front/Up assignment with floor placement, Undo/Redo, turns, viewer click, mode and finish passed.');
} finally { await browser.close (); }
