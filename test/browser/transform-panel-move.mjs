import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// The floating Object transform panel moves by its title (mouse or keyboard), stays inside the viewer, is remembered and resets.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
    await page.route ('**/api/personal/items', (route) => route.fulfill ({ json : [] }));
    await page.route ('**/api/auth/**', (route) => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
    await page.route ('**/api/accounts/**', (route) => route.fulfill ({ json : { isAdmin : false } }));
    const open = async () => {
        await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        /* A reload after edits offers the unsaved-session recovery dialog; this test does not need it. */
        await call ('session.recovery.discard'); await page.evaluate (() => document.querySelectorAll ('dialog[open]').forEach (dialog => dialog.close ()));
        await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl');
        await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
        const id = (await call ('scene.inspect')).objects[0].id; await call ('object.select', { objectId : id }); await call ('object.tool', { mode : 'scale' });
    };
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    const fails = async (id, args) => assert.equal ((await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args })).ok, false, id + ' ' + JSON.stringify (args));
    await open ();
    const panel = page.locator ('.scene_transform_panel'), handle = page.getByRole ('button', { name : /^Move Object transform panel/ });
    const viewer = await page.locator ('#main_viewer').boundingBox (); const start = await panel.boundingBox ();
    assert.deepEqual (await call ('ui.transform_panel.position'), { moved : false, x : null, y : null, visible : true });

    // Drag by the title.
    const grab = await handle.boundingBox (); await page.mouse.move (grab.x + 20, grab.y + grab.height / 2); await page.mouse.down ();
    await page.mouse.move (grab.x - 400, grab.y + 300, { steps : 8 }); await page.mouse.up ();
    const dragged = await panel.boundingBox (); assert.ok (Math.abs (dragged.x - (start.x - 420)) <= 2 && Math.abs (dragged.y - (start.y + 300 - grab.height / 2)) <= 2, JSON.stringify ({ start, dragged }));
    const state = await call ('ui.transform_panel.position'); assert.equal (state.moved, true);

    // Clamped inside the viewer.
    await page.mouse.move (dragged.x + 20, dragged.y + 8); await page.mouse.down (); await page.mouse.move (-500, 5000, { steps : 4 }); await page.mouse.up ();
    const clamped = await panel.boundingBox (); assert.ok (clamped.x >= viewer.x - 1 && clamped.y + clamped.height <= viewer.y + viewer.height + 1, JSON.stringify ({ viewer, clamped }));

    // Keyboard: arrow keys move 10 px, Shift+arrow 50 px.
    const before = await call ('ui.transform_panel.position'); await handle.focus (); await page.keyboard.press ('ArrowRight'); await page.keyboard.press ('Shift+ArrowUp');
    const keyed = await call ('ui.transform_panel.position'); assert.deepEqual ([keyed.x - before.x, before.y - keyed.y], [10, 50]);

    // Agent command validation and move.
    await fails ('ui.transform_panel.position', { x : 10 }); await fails ('ui.transform_panel.position', { reset : true, x : 1, y : 1 });
    assert.deepEqual (await call ('ui.transform_panel.position', { x : 30, y : 40 }), { moved : true, x : 30, y : 40, visible : true });
    const placed = await panel.boundingBox (); assert.ok (Math.abs (placed.x - viewer.x - 30) <= 1 && Math.abs (placed.y - viewer.y - 40) <= 1);

    // Fields keep working after moving.
    const sizeX = page.getByLabel ('Size X', { exact : true }); await sizeX.click (); await sizeX.press ('Control+a'); await sizeX.pressSequentially ('1.5'); assert.equal (await sizeX.inputValue (), '1.5'); await sizeX.press ('Tab');

    // Remembered after reload, then double-click resets to the default corner.
    await open (); assert.deepEqual (await call ('ui.transform_panel.position'), { moved : true, x : 30, y : 40, visible : true });
    await handle.dblclick (); assert.equal ((await call ('ui.transform_panel.position')).moved, false);
    const reset = await panel.boundingBox (); assert.ok (Math.abs (reset.x - start.x) <= 1 && Math.abs (reset.y - start.y) <= 1);
    await call ('ui.transform_panel.position', { x : 5, y : 5 }); await call ('ui.transform_panel.position', { reset : true }); assert.equal ((await call ('ui.transform_panel.position')).moved, false);
    assert.deepEqual (errors, []); console.log ('Object transform panel drag, clamp, keyboard, agent command, persistence and reset passed.');
} finally { await browser.close (); }
