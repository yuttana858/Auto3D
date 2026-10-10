import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage (); page.setDefaultTimeout (120000); page.on ('dialog', dialog => dialog.accept ()); const errors = []; page.on ('pageerror', error => errors.push (error.message)); page.on ('console', message => { if (['warning', 'error'].includes (message.type ())) { console.log (message.type (), message.text ()); } });
    let preferences = { theme : 2, units : 'standard', view : { backgroundPreset : 'light' } }; let loads = 0;
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'recovery-fixture', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', async route => { if (route.request ().method () === 'PUT') { preferences = route.request ().postDataJSON ().preferences; } else { loads++; } await route.fulfill ({ json : { preferences, folders : [] } }); });
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.includes ('accounts') ? { isAdmin : false } : [] })); }
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    const ready = async () => { await page.locator ('#startup_splash').waitFor ({ state : 'detached' }); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked')).catch (async error => { console.log (await page.locator ('body').innerText (), errors); throw error; }); };
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await ready (); assert.equal (loads, 1);
    assert.equal ((await call ('app.version.inspect')).version, '0.30.0'); assert.equal ((await call ('preferences.viewport.inspect')).view.backgroundPreset, 'standard');
    await page.locator ('#open_file').setInputFiles ({ name : 'cube.off', mimeType : 'text/plain', buffer : Buffer.from ('OFF\n8 6 0\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n0 0 1\n1 0 1\n1 1 1\n0 1 1\n4 0 1 2 3\n4 4 7 6 5\n4 0 4 5 1\n4 1 5 6 2\n4 2 6 7 3\n4 3 7 4 0\n') });
    await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
    await call ('object.transform', { position : [2, 0, 0] });
    const deadline = Date.now () + 30000; let checkpoint; do { checkpoint = await call ('session.recovery.inspect'); if (checkpoint.valid) { break; } await new Promise (resolve => setTimeout (resolve, 500)); } while (Date.now () < deadline); assert.equal (checkpoint.valid, true, JSON.stringify (checkpoint));
    for (let index = 0; index < 2; index++) {
        await page.reload (); await ready (); await page.screenshot ({ path : 'work/recovery-before-restore.png' }); const restore = page.getByRole ('button', { name : 'Restore recovery', exact : true }); await restore.waitFor (); assert.equal (await restore.isEnabled (), true); await restore.click ();
        await page.waitForFunction (() => /^(Recovered unsaved session|Recovery could not)/.test (document.querySelector ('.scene_status')?.textContent || '')); console.log ('restore status', await page.locator ('.scene_status').textContent ()); assert.match (await page.locator ('.scene_status').textContent (), /^Recovered unsaved session/); assert.equal ((await call ('session.recovery.inspect')).valid, true); assert.equal ((await call ('scene.inspect')).objects.length, 1); assert.deepEqual ((await call ('scene.inspect')).objects[0].position, [2, 0, 0]);
        assert.equal ((await call ('preferences.viewport.inspect')).view.backgroundPreset, 'standard');
    }
    assert.deepEqual (errors, []); console.log ('v0.30.0: one account preference load, dark viewer default restored, worker checkpoint restores after two consecutive reloads.');
} finally { await browser.close (); }
