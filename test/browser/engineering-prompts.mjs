import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { EngineeringPrompts } from '../../source/website/engineeringsequence.js';

const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage ({ viewport : { width, height : 1000 }, reducedMotion : 'reduce' }); const errors = [], apiCalls = [];
        page.on ('pageerror', error => errors.push (error.message));
        await page.route ('**/api/**', route => { apiCalls.push (new URL (route.request ().url ()).pathname); return route.fulfill ({ json : { user : null } }); });
        await page.addInitScript (() => {
            window.demoMediaCalls = [];
            const unexpected = name => () => { window.demoMediaCalls.push (name); throw Error ('Presentation must not invoke ' + name); };
            Object.defineProperty (window, 'speechSynthesis', { value : { getVoices : unexpected ('getVoices'), speak : unexpected ('speak'), cancel : unexpected ('cancel'), pause : unexpected ('pause'), resume : unexpected ('resume') } });
            window.SpeechRecognition = class { constructor () { window.demoMediaCalls.push ('SpeechRecognition'); } };
            window.webkitSpeechRecognition = window.SpeechRecognition;
            if (navigator.mediaDevices) { navigator.mediaDevices.getUserMedia = unexpected ('getUserMedia'); }
        });
        await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html');
        const agent = page.locator ('.entry_agent'); await agent.waitFor (); await agent.scrollIntoViewIfNeeded ();
        const execute = (command, args = {}) => page.evaluate (([id, arguments_]) => window.Auto3D.execute (id, arguments_), [command, args]);
        const inspect = async () => (await execute ('landing.inspect')).result;
        assert.equal ((await inspect ()).playing, false);
        assert.equal ((await inspect ()).entrance.complete, true);
        assert.equal ((await inspect ()).presentationOnly, true);
        assert.equal (await page.locator ('.entry_draft_pen').count (), 0);
        assert.ok (await page.locator ('.entry_sketch_constraints circle').count () >= 1);
        assert.equal (await agent.locator ('input, textarea, button, form, [contenteditable], [tabindex]').count (), 0);
        assert.equal (await agent.evaluate (e => getComputedStyle (e).pointerEvents), 'none');
        const bounds = await agent.boundingBox (), canvas = await page.locator ('.entry_canvas_wrap').boundingBox ();
        assert.ok (bounds.x >= canvas.x && bounds.y >= canvas.y && bounds.y + bounds.height <= canvas.y + canvas.height);
        assert.ok ((await agent.locator ('.entry_prompt_shell').boundingBox ()).height <= 36);
        const bannerHeight = (await page.locator ('.entry_banner').boundingBox ()).height;
        assert.ok (bannerHeight < (width > 760 ? 570 : 900), 'Compact banner height: ' + bannerHeight);
        if (width > 760) { assert.ok (bounds.width < canvas.width * 0.55); }
        const before = (await inspect ()).sequence.sequenceTime;
        assert.equal ((await execute ('landing.prompt.submit', { prompt : EngineeringPrompts[0].prompt })).result.accepted, false);
        assert.equal ((await execute ('landing.prompt.voice', { enabled : true })).result.enabled, false);
        assert.equal ((await inspect ()).sequence.sequenceTime, before);

        await page.emulateMedia ({ reducedMotion : 'no-preference' });
        await execute ('landing.demo.playback', { action : 'restart' });
        await page.waitForFunction (() => {
            const ink = document.querySelector ('.entry_heading_ink');
            return ink.textContent.length >= 4 && ink.textContent.length < 16;
        });
        await execute ('landing.demo.playback', { action : 'pause' });
        const entering = (await inspect ()).entrance;
        assert.equal (entering.complete, false);
        assert.ok ('Engineering intelligence.'.startsWith (entering.text));
        const loginY = await page.locator ('.entry_login').evaluate (e => new DOMMatrix (getComputedStyle (e).transform).m42);
        assert.ok (loginY < 0, 'Sign-in descends while the headline types');
        const entranceFrozen = await page.locator ('.entry_banner').innerHTML ();
        await page.waitForTimeout (120); assert.equal (await page.locator ('.entry_banner').innerHTML (), entranceFrozen);
        await page.locator ('.entry_banner').screenshot ({ path : `work/card-entrance-${width}.png` });
        await execute ('landing.demo.playback', { action : 'play' });
        await page.waitForFunction (() => {
            const first = document.querySelector ('.entry_logo_letter');
            return document.querySelector ('.entry_agent').dataset.phase === 'logo' && Number (first.style.strokeDashoffset) < 0.5;
        });
        await execute ('landing.demo.playback', { action : 'pause' });
        assert.equal (await page.locator ('.entry_canvas_wrap').getAttribute ('data-scene-visible'), 'false');
        assert.equal (Number (await agent.evaluate (e => getComputedStyle (e).opacity)), 0);
        const logoFrozen = await page.locator ('.entry_intro').innerHTML ();
        await page.waitForTimeout (140); assert.equal (await page.locator ('.entry_intro').innerHTML (), logoFrozen);
        await execute ('landing.demo.playback', { action : 'play' });
        await page.waitForFunction (() => document.querySelector ('.entry_agent').dataset.phase === 'greeting' && document.querySelector ('.entry_agent_reply').textContent === 'Hi Glen, what would you like to create today?');
        await execute ('landing.demo.playback', { action : 'pause' });
        const centered = await agent.boundingBox ();
        assert.equal ((await inspect ()).entrance.complete, true);
        assert.ok (Math.abs (centered.x + centered.width / 2 - canvas.x - canvas.width / 2) < 2);
        assert.ok (Math.abs (centered.y + centered.height / 2 - canvas.y - canvas.height / 2) < 2);
        assert.equal (await page.locator ('.entry_intro').isVisible (), false);
        assert.match (await agent.evaluate (e => getComputedStyle (e).backdropFilter), /blur/);
        assert.equal (await page.locator ('.entry_canvas_wrap').getAttribute ('data-scene-visible'), 'false');
        await execute ('landing.demo.playback', { action : 'play' });
        await page.waitForFunction (() => {
            const e = document.querySelector ('.entry_agent');
            return e.dataset.phase === 'drafting' && e.dataset.input === 'typing' && e.querySelector ('.entry_prompt_text').textContent.length > 3;
        });
        await execute ('landing.demo.playback', { action : 'pause' });
        const typed = await agent.locator ('.entry_prompt_text').textContent ();
        assert.ok (EngineeringPrompts[0].prompt.startsWith (typed) && typed.length < EngineeringPrompts[0].prompt.length);
        const held = (await inspect ()).sequence.sequenceTime;
        await page.waitForTimeout (160);
        assert.equal ((await inspect ()).sequence.sequenceTime, held);
        assert.equal (await agent.locator ('.entry_prompt_text').textContent (), typed);
        await execute ('landing.demo.playback', { action : 'play' });
        await page.waitForFunction (() => document.querySelector ('.entry_agent').dataset.phase === 'docking');
        await execute ('landing.demo.playback', { action : 'pause' });
        assert.equal (await agent.locator ('.entry_prompt_text').textContent (), EngineeringPrompts[0].prompt);
        assert.equal (await page.locator ('.entry_canvas_wrap').getAttribute ('data-scene-visible'), 'false');
        await execute ('landing.demo.playback', { action : 'play' });
        await page.waitForFunction (() => document.querySelector ('.entry_canvas_wrap').dataset.sceneVisible === 'true');
        await execute ('landing.demo.playback', { action : 'pause' });
        assert.equal (await agent.getAttribute ('data-placement'), 'corner');
        assert.ok ((await agent.boundingBox ()).width < centered.width || width <= 760);

        // Start just before the spoken MP request. The mic pulses as complete words arrive.
        await execute ('landing.demo.stage', { stage : 0 });
        await execute ('landing.demo.playback', { action : 'play' });
        await page.waitForFunction (() => {
            const e = document.querySelector ('.entry_agent');
            return e.dataset.micActive === 'true' && e.querySelector ('.entry_prompt_text').textContent.length > 0;
        });
        const mic = agent.locator ('.entry_prompt_mic');
        assert.equal (await mic.evaluate (e => getComputedStyle (e).animationName), 'entry_mic');
        assert.equal (await mic.evaluate (e => getComputedStyle (e).animationPlayState), 'running');
        await execute ('landing.demo.playback', { action : 'pause' });
        const spoken = await agent.locator ('.entry_prompt_text').textContent ();
        const wordCount = spoken.split (' ').length;
        assert.equal (spoken, EngineeringPrompts[1].prompt.split (' ').slice (0, wordCount).join (' '));
        assert.equal (await mic.evaluate (e => getComputedStyle (e).animationPlayState), 'paused');
        await page.screenshot ({ path : `work/compact-verified-${width}.png` });
        await execute ('landing.demo.playback', { action : 'play' });
        await page.waitForFunction (() => document.querySelector ('.entry_agent').dataset.phase === 'replying');
        await execute ('landing.demo.playback', { action : 'pause' });
        assert.equal (await agent.getAttribute ('data-mic-active'), 'false');
        assert.equal (await agent.locator ('.entry_prompt_text').textContent (), EngineeringPrompts[1].prompt);
        assert.ok (Number (await agent.evaluate (e => getComputedStyle (e, '::before').opacity)) > 0);
        assert.equal (await agent.evaluate (e => getComputedStyle (e, '::before').animationPlayState), 'paused');
        await execute ('landing.demo.playback', { action : 'play' });
        await page.waitForFunction (() => document.querySelector ('.entry_agent').dataset.phase === 'executing');
        await execute ('landing.demo.playback', { action : 'pause' });
        assert.match (await agent.locator ('.entry_execution_percent').textContent (), /\d+%/);
        const distances = [];
        for (const stage of [0, 1, 2, 3]) {
            await execute ('landing.demo.stage', { stage });
            const framing = (await inspect ()).framing;
            assert.ok (framing.visiblePoints > 0);
            assert.ok (framing.extent.every (value => value <= framing.fill + 1e-6), 'Current geometry fits the rendering window');
            assert.ok (framing.screenCenter.every (value => Math.abs (value) < 0.002), 'The visible assembly is centered in the animation window');
            distances.push (framing.distance);
        }
        assert.ok (Math.max (...distances) > Math.min (...distances) * 1.1, 'The camera changes distance with the current assembly');
        assert.deepEqual (await page.evaluate (() => demoMediaCalls), []);
        assert.deepEqual (apiCalls.filter (path => !['/api/environments', '/api/auth/session'].includes (path)), []);
        assert.equal (await page.locator ('#auth_gate').evaluate (e => e.scrollWidth > e.clientWidth), false);
        assert.equal (await page.locator ('#main').evaluate (e => e.inert), true);
        assert.deepEqual (errors, []); await page.close ();
        console.log ('Card entrance, logo/greeting, glass docking, current geometry fit, typing/STT, pause and zero media access passed at ' + width + 'px');
    }
} finally { await browser.close (); }
