import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
await mkdir ('work', { recursive : true });
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage ({ viewport : { width, height : 1000 }, reducedMotion : 'reduce' }), errors = [];
        page.on ('pageerror', error => errors.push (error.message));
        page.on ('console', message => { if (/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/.test (message.text ())) { errors.push (message.text ()); } });
        await page.route ('**/api/**', route => route.fulfill ({ json : { user : null } }));
        await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.locator ('.entry_banner').waitFor ();
        const command = (id, args = {}) => page.evaluate (([id, args]) => window.Auto3D.execute (id, args), [id, args]);
        const inspect = async () => (await command ('landing.inspect')).result;
        const playback = action => command ('landing.demo.playback', { action });
        const until = async (key, threshold) => {
            const started = Date.now ();
            while ((await inspect ()).sequence.finish[key] < threshold) {
                if (Date.now () - started > 20000) { throw new Error ('Timed out waiting for ' + key); }
                await page.waitForTimeout (40);
            }
        };
        await command ('landing.demo.stage', { stage : 2 }); await playback ('play'); await until ('ink', 1); await playback ('pause');
        const kraft = await inspect (); assert.equal (kraft.artwork.ink, 1); assert.equal (kraft.artwork.white, 0); assert.equal (kraft.artwork.exteriorPanels, 6);
        await page.locator ('.entry_canvas_wrap').screenshot ({ path : `work/artwork-${width}-kraft.png` });
        await playback ('play'); await until ('white', 0.4); await playback ('pause');
        const wipe = await inspect (); assert.ok (wipe.artwork.white > 0 && wipe.artwork.white < 1);
        await page.locator ('.entry_canvas_wrap').screenshot ({ path : `work/artwork-${width}-wipe.png` });
        await playback ('play'); await until ('white', 1); await playback ('pause');
        await page.locator ('.entry_canvas_wrap').screenshot ({ path : `work/artwork-${width}-white.png` });
        await playback ('play'); await until ('callouts', 1); await playback ('pause');
        const complete = await inspect (); assert.equal (complete.sequence.finish.turn, 1); assert.ok (complete.rotation - kraft.rotation > 1.2);
        assert.ok (Math.abs (Math.max (...complete.framing.extent) - 0.96) < 0.002); assert.ok (complete.framing.screenCenter.every (v => Math.abs (v) < 0.002));
        assert.equal (await page.locator ('.entry_material_label:visible').count (), 3);
        assert.equal (await page.locator ('.entry_agent').evaluate (e => Number (getComputedStyle (e).opacity)), 0);
        const layout = await page.locator ('.entry_materials').evaluate (overlay => {
            const outer = overlay.getBoundingClientRect ();
            return [...overlay.querySelectorAll ('.entry_material_label')].every (label => { const r = label.getBoundingClientRect (); return r.left >= outer.left && r.right <= outer.right + 1 && r.top >= outer.top && r.bottom <= outer.bottom; });
        });
        assert.equal (layout, true); await page.locator ('.entry_canvas_wrap').screenshot ({ path : `work/artwork-${width}-materials.png` });
        const held = (await inspect ()).sequence.sequenceTime; await page.waitForTimeout (180); assert.equal ((await inspect ()).sequence.sequenceTime, held);
        await page.setViewportSize ({ width : width + 40, height : 1000 }); await page.waitForTimeout (150);
        const resized = await inspect (); assert.ok (resized.materials.width > 0); assert.ok (resized.framing.screenCenter.every (v => Math.abs (v) < 0.002));
        await command ('landing.demo.stage', { stage : 0 }); const reset = await inspect ();
        assert.equal (reset.artwork.ink, 0); assert.equal (reset.artwork.white, 0); assert.equal (await page.locator ('.entry_materials').isVisible (), false);
        assert.deepEqual (errors, []); await page.close ();
        console.log (`Kraft print, white color wipe, right turn, material leaders, centered fit, pause and reset passed at ${width}px`);
    }
} finally { await browser.close (); }
