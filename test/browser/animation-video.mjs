import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
// Animation panel and video export: keyframes from the panel, a frame-accurate export with the right frame count and a
// playable file, cancel, playhead restore and the module icon.
const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 }, acceptDownloads : true }); const errors = [];
    page.on ('pageerror', error => errors.push (error.message));
    await page.route ('https://auto3d.test/**', async route => {
        const name = new URL (route.request ().url ()).pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'animation-video', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const raw = (id, args = {}) => page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args });
    const call = async (id, args = {}) => { let response; for (let i = 0; i < 100; i++) { response = await raw (id, args); if (response.ok || !/busy/.test (response.error?.message || '')) { break; } await page.waitForTimeout (100); } assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result; };

    await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl');
    let objects = []; for (let i = 0; i < 150 && !objects.length; i++) { const r = await raw ('scene.inspect'); objects = r.ok ? r.result.objects : []; if (!objects.length) { await page.waitForTimeout (100); } }
    const cube = objects[0]; await call ('object.select', { objectId : cube.id });

    // The module icon opens the Animation panel.
    await page.getByRole ('button', { name : 'Animation and video', exact : true }).click ();
    const panel = page.getByRole ('region', { name : 'Animation', exact : true }); await panel.waitFor ();
    const panels = await call ('ui.modules.inspect'); assert.ok ((panels.panels || panels).some (p => p.id === 'animation' && p.visible), JSON.stringify (panels));

    // Keyframes from the panel: the cube moves 3 units over 2 seconds, the camera is keyed at both ends.
    await panel.getByRole ('spinbutton', { name : 'Duration (s)', exact : true }).fill ('2'); await panel.getByRole ('spinbutton', { name : 'Duration (s)', exact : true }).dispatchEvent ('change');
    await call ('animation.timeline.seek', { time : 0 }); await panel.getByRole ('button', { name : 'Keyframe selected', exact : true }).click (); await panel.getByRole ('button', { name : 'Keyframe camera', exact : true }).click ();
    await call ('animation.timeline.seek', { time : 2 }); await call ('object.transform', { objectId : cube.id, position : [3, 0, 0] });
    await panel.getByRole ('button', { name : 'Keyframe selected', exact : true }).click (); await panel.getByRole ('button', { name : 'Keyframe camera', exact : true }).click ();
    assert.match (await panel.textContent (), /2 camera keyframes · 2 object keyframes on 1 object/);
    const timeline = await call ('animation.timeline.inspect'); assert.equal (timeline.duration, 2); assert.equal (timeline.rangeEnd, 2);
    await call ('animation.timeline.seek', { time : 0.5 }); const before = (await call ('scene.inspect')).objects.find (o => o.id === cube.id).position;
    assert.ok (before[0] > 0 && before[0] < 3, 'the cube is mid-move at 0.5 s: ' + before);

    // Panel export: 720p at 24 fps records 2 s as 49 frames (both ends included).
    await panel.getByRole ('combobox', { name : 'Video size', exact : true }).selectOption ('720p'); await panel.getByRole ('combobox', { name : 'Frame rate', exact : true }).selectOption ('24');
    assert.match (await panel.textContent (), /0\.00 s – 2\.00 s · 49 frames/);
    await panel.getByRole ('button', { name : 'Export video', exact : true }).click ();
    let state; for (let i = 0; i < 1800; i++) { state = await call ('animation.video.inspect'); if (['completed', 'failed'].includes (state.status)) { break; } await page.waitForTimeout (100); }
    assert.equal (state.status, 'completed', state.error); const video = state.video;
    assert.equal (video.frames, 49); assert.equal (video.width, 1280); assert.equal (video.height, 720); assert.equal (video.fps, 24); assert.ok (video.bytes > 1000, 'encoded ' + video.bytes + ' bytes');
    assert.ok (['mp4', 'webm'].includes (video.container)); console.log ('Exported', video.filename, video.codec, video.bytes, 'bytes');
    // Playhead, object pose and the viewer are restored after export.
    const after = await call ('animation.timeline.inspect'); assert.equal (after.time, 0.5);
    const placed = (await call ('scene.inspect')).objects.find (o => o.id === cube.id); assert.deepEqual (placed.position, before, 'pose at 0.5 s is restored');
    assert.equal (await panel.getByRole ('button', { name : 'Export video', exact : true }).isEnabled (), true);

    // Download: a real container file.
    const [download] = await Promise.all ([page.waitForEvent ('download'), panel.getByRole ('button', { name : 'Download video', exact : true }).click ()]);
    const bytes = await readFile (await download.path ()); assert.equal (download.suggestedFilename (), video.filename);
    await mkdir ('work/animation-review', { recursive : true }); await download.saveAs ('work/animation-review/export.' + video.container);
    if (video.container === 'mp4') { assert.equal (bytes.subarray (4, 8).toString (), 'ftyp'); } else { assert.equal (bytes.readUInt32BE (0), 0x1A45DFA3); }

    // A WebM export (always decodable in Chromium) plays back with the expected duration and size.
    const webm = await call ('animation.video.export', { size : '720p', fps : 24, format : 'webm', start : 0, end : 1 });
    assert.equal (webm.video.container, 'webm'); assert.equal (webm.video.frames, 25);
    const played = await page.evaluate (async () => {
        const blob = await new Promise (resolve => { const original = URL.createObjectURL; URL.createObjectURL = value => { resolve (value); URL.createObjectURL = original; return original (value); }; Auto3D.execute ('animation.video.download'); });
        const element = document.createElement ('video'); element.muted = true; element.src = URL.createObjectURL (blob);
        await new Promise ((resolve, reject) => { element.onloadedmetadata = resolve; element.onerror = () => reject (new Error ('video decode failed')); });
        if (!Number.isFinite (element.duration)) { element.currentTime = 1e6; await new Promise (resolve => { element.ontimeupdate = resolve; }); }
        return { width : element.videoWidth, height : element.videoHeight, duration : element.duration };
    });
    assert.equal (played.width, 1280); assert.equal (played.height, 720); assert.ok (Math.abs (played.duration - 25 / 24) < 0.1, 'played duration ' + played.duration);

    // Cancel stops a running export and restores the scene.
    await call ('animation.timeline.configure', { duration : 10, loop : false, interpolation : 'smooth' }); await call ('animation.timeline.range', { start : 0, end : 10 }); await call ('animation.timeline.seek', { time : 0.5 });
    const running = page.evaluate (() => Auto3D.execute ('animation.video.export', { size : '1080p', fps : 60 }));
    for (let i = 0; i < 400; i++) { const s = await call ('animation.video.inspect'); if (s.status === 'encoding' && s.frame > 2) { break; } await page.waitForTimeout (50); }
    const cancel = await call ('animation.video.cancel'); assert.equal (cancel.cancelling, true, JSON.stringify (await call ('animation.video.inspect')));
    const cancelled = await running; assert.equal (cancelled.ok, false); assert.match (cancelled.error.message, /cancelled/);
    assert.equal ((await call ('animation.video.inspect')).status, 'cancelled'); assert.equal ((await call ('animation.timeline.inspect')).time, 0.5);
    assert.equal ((await raw ('animation.video.export', { fps : 15 })).ok, false, 'invalid frame rates are rejected');

    await mkdir ('work/animation-review', { recursive : true }); await page.screenshot ({ path : 'work/animation-review/panel.png' });
    await page.getByRole ('button', { name : 'Animation and video', exact : true }).click (); await page.waitForTimeout (400); assert.equal (await panel.isVisible (), false);
    assert.deepEqual (errors, []);
    console.log ('Animation panel and video export passed: panel keyframes, 49-frame 720p export, download container, WebM playback, cancel and restore.');
} finally { await browser.close (); }
