import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1400, height : 1000 }, acceptDownloads : true }); page.setDefaultTimeout (600000);
    const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2 }, folders : [] } }));
    await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false, requests : [] } }));
    await page.route ('**/api/personal/items', route => route.fulfill ({ json : [] }));
    await page.route ('**/api/environments', route => route.fulfill ({ json : [] }));
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.locator ('#startup_splash').waitFor ({ state : 'detached' }); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked')); /* the welcome screen can close before sign-in is restored */
    await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl');
    await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
    const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, JSON.stringify (r)); return r.result; };
    await call ('lighting.effects', { ambientIntensity : 0.4, ambientColor : '#ffddbb' });
    await page.locator ('#data_panel_toggle[aria-expanded="false"]').click ();
    const dimension = page.locator ('[data-dimension-axis="0"]'); const before = Number (await dimension.inputValue ()); await dimension.fill (String (before * 1.5));
    assert.ok (Math.abs ((await call ('scene.inspect')).objects[0].scale[0] - 1.5) < 0.001);
    await dimension.press ('Tab');
    const percent = page.getByRole ('spinbutton', { name : 'Scale percentage', exact : true }); await percent.fill ('125');
    assert.ok (Math.abs ((await call ('scene.inspect')).objects[0].scale[0] - 1.875) < 0.001);
    await percent.fill ('150'); assert.ok (Math.abs ((await call ('scene.inspect')).objects[0].scale[0] - 2.25) < 0.001); await percent.press ('Tab');
    assert.equal (await page.getByRole ('button', { name : 'Apply scale', exact : true }).count (), 0);
    assert.equal (await page.getByText ('Cast + Receive enables self-shadowing.', { exact : false }).count (), 0);
    await call ('ui.array'); const fields = await page.locator ('.array_counts').first ().locator ('input').evaluateAll (inputs => inputs.map (input => ({ y : input.getBoundingClientRect ().top, x : input.getBoundingClientRect ().left })));
    assert.equal (new Set (fields.map (field => field.y)).size, 1); assert.ok (fields[0].x < fields[1].x && fields[1].x < fields[2].x);
    await page.getByLabel ('Height count (H)', { exact : true }).fill ('2'); await page.getByLabel ('Alternate layer rotation', { exact : true }).selectOption ('90');
    await page.getByRole ('button', { name : 'Create array', exact : true }).click (); await page.waitForFunction (() => /^Created/.test (document.querySelector ('.scene_status')?.textContent || ''));
    assert.equal ((await call ('scene.inspect')).objects.length, 2);
    await call ('view.fit'); await call ('camera.create', { name : 'Overview' }); await call ('render.open'); await call ('sidebar.details.collapse', { collapsed : true });
    assert.equal (await page.locator ('.ov_sidebar_content[hidden]').count (), 1); assert.equal (await page.locator ('#render_queue').isVisible (), true);
    const render = async (resolution, alpha) => {
        const added = await call ('render.queue.enqueue', { resolution, alpha, cameraId : (await call ('camera.inspect')).views[0].id });
        await call ('render.queue.start');
        await page.locator ('.render_queue_job[data-job-id="' + added.jobs[0].id + '"] [role=status]').filter ({ hasText : /^(completed|failed)$/ }).waitFor ();
        const job = (await call ('render.queue.inspect')).jobs.find (item => item.id === added.jobs[0].id); assert.equal (job.status, 'completed', JSON.stringify (job));
        const downloading = page.waitForEvent ('download'); await call ('render.queue.download', { id : job.id }); const file = await downloading; await file.saveAs ('work/render-' + resolution + (alpha ? '-alpha' : '') + '.png');
        console.log ('Completed', resolution, alpha ? 'alpha' : 'background', job.size);
        return job;
    };
    await render ('hd', true); await render ('4k', false);
    if (process.env.AUTO3D_TEST_16K === '1') { await render ('16k', true); }
    const cancelJob = (await call ('render.queue.enqueue', { resolution : '4k', alpha : true })).jobs[0];
    await call ('render.queue.start'); await call ('render.queue.cancel', { id : cancelJob.id });
    for (let attempt = 0; attempt < 100; attempt++) { if (!(await call ('render.queue.inspect')).running) { break; } await page.waitForTimeout (50); }
    const cancelled = await call ('render.queue.inspect'); assert.equal (cancelled.running, false); assert.equal (cancelled.jobs.find (job => job.id === cancelJob.id).status, 'cancelled');
    assert.equal (await page.locator ('#main_viewer').evaluate (element => element.inert), false);
    await page.screenshot ({ path : 'work/rendering-panel.png' }); assert.deepEqual (errors, []);
    console.log ('Ambient controls, live dimensions/scale, compact alternating layers, collapsible Details and real PNG rendering passed.');
} finally { await browser.close (); }
