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
        assert.equal ((await inspect ()).sequence.outro.opacity, 1, 'reduced motion starts on the visible material study');
        // Wait and pause inside the page on the same animation frame. Separate poll and pause round trips let a
        // slow CI runner overshoot a phase (ink ends at 0.9 s, white starts at 2.2 s; the blank hold is short).
        const pauseWhen = (condition, label, timeout) => page.evaluate (async ([condition, label, timeout]) => {
            const started = Date.now ();
            for (;;) {
                const sequence = (await window.Auto3D.execute ('landing.inspect')).result.sequence;
                if (condition.outro ? sequence.outro.phase === condition.outro : sequence.finish[condition.key] >= condition.threshold) { break; }
                if (Date.now () - started > timeout) { throw new Error ('Timed out waiting for ' + label); }
                await new Promise (resolve => requestAnimationFrame (resolve));
            }
            await window.Auto3D.execute ('landing.demo.playback', { action : 'pause' });
        }, [condition, label, timeout]);
        const untilThenPause = (key, threshold) => pauseWhen ({ key, threshold }, key, 20000);
        await command ('landing.demo.stage', { stage : 2 }); await playback ('play'); await untilThenPause ('ink', 1);
        const kraft = await inspect (); assert.equal (kraft.artwork.ink, 1); assert.equal (kraft.artwork.white, 0); assert.equal (kraft.artwork.exteriorPanels, 6);
        await page.locator ('.entry_canvas_wrap').screenshot ({ path : `work/artwork-${width}-kraft.png` });
        await playback ('play'); await untilThenPause ('white', 0.4);
        const wipe = await inspect (); assert.ok (wipe.artwork.white > 0 && wipe.artwork.white < 1);
        await page.locator ('.entry_canvas_wrap').screenshot ({ path : `work/artwork-${width}-wipe.png` });
        await playback ('play'); await untilThenPause ('white', 1);
        await page.locator ('.entry_canvas_wrap').screenshot ({ path : `work/artwork-${width}-white.png` });
        await playback ('play'); await untilThenPause ('callouts', 1);
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
        await command ('landing.demo.stage', { stage : 3 }); await playback ('play');
        const outroThenPause = phase => pauseWhen ({ outro : phase }, 'outro ' + phase, 10000);
        await outroThenPause ('fading');
        const fading = await inspect ();
        assert.ok (fading.sequence.outro.opacity > 0 && fading.sequence.outro.opacity < 1);
        const fadeOpacity = await page.locator ('.entry_canvas_wrap').evaluate (e => Number (getComputedStyle (e).opacity));
        assert.ok (Math.abs (fadeOpacity - fading.sequence.outro.opacity) < 0.001);
        await page.waitForTimeout (160); assert.equal ((await inspect ()).sequence.sequenceTime, fading.sequence.sequenceTime);
        await playback ('play'); await outroThenPause ('holding');
        assert.equal (await page.locator ('.entry_canvas_wrap').evaluate (e => Number (getComputedStyle (e).opacity)), 0);
        assert.equal (await page.locator ('.entry_visual_heading').evaluate (e => Number (getComputedStyle (e).opacity)), 0);
        assert.equal (await page.locator ('.entry_login').evaluate (e => Number (getComputedStyle (e).opacity)), 1);
        await page.locator ('.entry_visual').screenshot ({ path : `work/outro-hold-${width}.png` });
        // Observe and pause on the loop boundary in-page, without a protocol round trip.
        const { samples, restarted } = await page.evaluate (async () => {
            const hold = (await window.Auto3D.execute ('landing.inspect')).result.sequence, samples = [], started = Date.now ();
            await window.Auto3D.execute ('landing.demo.playback', { action : 'play' });
            while (true) {
                const frame = (await window.Auto3D.execute ('landing.inspect')).result.sequence;
                if (frame.cycle > hold.cycle) {
                    await window.Auto3D.execute ('landing.demo.playback', { action : 'pause' });
                    return { samples, restarted : frame };
                }
                samples.push (frame);
                if (Date.now () - started > 10000) { throw new Error ('The outro did not loop'); }
                await new Promise (resolve => requestAnimationFrame (resolve));
            }
        });
        assert.ok (samples.length > 2 && samples.at (-1).sequenceTime - samples[0].sequenceTime > 1, 'hold remains blank before the loop');
        assert.ok (samples.every (frame => frame.outro.opacity === 0)); assert.equal (restarted.phase, 'logo');
        assert.equal ((await inspect ()).sequence.phase, 'logo');
        assert.equal (await page.locator ('.entry_canvas_wrap').evaluate (e => Number (getComputedStyle (e).opacity)), 1);
        await command ('landing.demo.stage', { stage : 0 }); const reset = await inspect ();
        assert.equal (reset.artwork.ink, 0); assert.equal (reset.artwork.white, 0); assert.equal (await page.locator ('.entry_materials').isVisible (), false);
        assert.deepEqual (errors, []); await page.close ();
        console.log (`Printed finishes, material leaders, centered fit, fade, blank hold, automatic loop and pause passed at ${width}px`);
    }
} finally { await browser.close (); }
