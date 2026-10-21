import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1100, height : 800 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', e => errors.push (e.message));
    await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'presentation-test', email : 'fixture@example.com' } } }));
    await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'metric', viewportQuality : 'fast' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { console.log ('Checking', id); const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    const wait = async (id, test) => { const end = Date.now () + 120000; while (Date.now () < end) { const value = await call (id); if (test (value)) { return value; } await page.waitForTimeout (150); } throw new Error ('Timed out: ' + id); };
    await call ('packaging.fefco.preset', { code : '0201', length : 100, width : 80, height : 60, thickness : 3, closure : 'closed' });
    const before = await call ('packaging.measurements.inspect'); const camera = await call ('camera.current.inspect');
    await call ('packaging.fefco.animate', { duration : 5 });
    await call ('packaging.fefco.playback', { action : 'pause' }); const paused = await call ('packaging.fefco.playback.inspect'); assert.equal (paused.state, 'paused'); assert.equal (paused.cameraAutoFit, true); assert.equal (paused.boundingBoxVisible, false);
    await page.screenshot ({ path : 'work/fold-camera-transition.png' }); await call ('packaging.fefco.playback', { action : 'resume' });
    await wait ('packaging.fefco.playback.inspect', state => state.state === 'completed');
    const flat = await call ('camera.current.inspect'); assert.notDeepEqual (flat.eye, camera.eye); assert.deepEqual ((await call ('packaging.measurements.inspect')).dimensions, before.dimensions);
    await page.screenshot ({ path : 'work/fold-camera-flat-endpoint.png' });
    await call ('packaging.fefco.camera', { autoFit : false }); const manual = await call ('camera.current.inspect');
    await call ('packaging.fefco.animate', { duration : 1 }); await wait ('packaging.fefco.playback.inspect', state => state.state === 'completed');
    const unchanged = await call ('camera.current.inspect'); for (const key of ['eye', 'center', 'up']) { assert.deepEqual (unchanged[key], manual[key]); }
    await call ('view.focus');
    const original = (await call ('scene.inspect')).objects[0];
    const creation = call ('object.array', { width : 3, length : 2, height : 2, duration : 6, autoFit : true });
    // Playback inspection bypasses the pending mutation queue.
    const revealing = await wait ('object.array.playback.inspect', state => state.stage === 'revealing' && state.state === 'playing');
    assert.equal (revealing.cameraAutoFit, true); await call ('object.array.playback', { action : 'pause' }); assert.equal ((await call ('object.array.playback.inspect')).state, 'paused');
    await page.screenshot ({ path : 'work/array-drop-reveal.png' }); await call ('object.array.playback', { action : 'resume' }); await creation;
    const scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 12); assert.equal (scene.groups.length, 1);
    assert.deepEqual (scene.objects[0].position, original.position); assert.ok (scene.objects[1].position[0] > original.position[0]); assert.equal (scene.objects[3].position[0], original.position[0]); assert.ok (scene.objects[6].position[1] > original.position[1]);
    const arrayCamera = await call ('camera.current.inspect'); assert.ok (arrayCamera.distance > 300, 'Full array must remain framed after a prior view.focus tween');
    await page.screenshot ({ path : 'work/array-camera-completed.png' });
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 1); await call ('history.redo'); assert.equal ((await call ('scene.inspect')).objects.length, 12);
    await call ('history.undo');
    const cancellation = page.evaluate (() => Auto3D.execute ('object.array', { width : 2, length : 2, height : 1, duration : 15 }));
    for (let retry = 0; retry < 120; retry++) { const paused = await page.evaluate (async () => { const state = (await Auto3D.execute ('object.array.playback.inspect')).result; if (state.stage === 'revealing' && state.state === 'playing') { return (await Auto3D.execute ('object.array.playback', { action : 'pause' })).result.state === 'paused'; } return false; }); if (paused) { break; } await page.waitForTimeout (100); }
    await call ('object.array.playback', { action : 'cancel' }); assert.equal ((await cancellation).ok, false); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    assert.equal ((await call ('object.array.playback.inspect')).state, 'cancelled'); assert.deepEqual (errors, []);
    console.log ('Smooth fold camera/manual override, exact CAD, sequential array drops, ramped camera, pause/resume, exact placements, grouping, Undo/Redo and cancellation passed.');
} finally { await browser.close (); }
