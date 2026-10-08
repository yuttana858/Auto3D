import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); page.setDefaultTimeout (20000);
    const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
    await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' }); await page.waitForFunction (() => window.Auto3D);
    await page.locator ('#startup_splash canvas').click ({ position : { x : 50, y : 50 } }); await page.waitForFunction (() => !document.querySelector ('#startup_splash'));
    await page.evaluate (() => { window.feedback = []; new MutationObserver (() => { const text = Array.from (document.querySelectorAll ('.ov_progress_text,.scene_status'), (element) => element.textContent).join (' '); if (text) { window.feedback.push (text); } }).observe (document.body, { subtree : true, childList : true, characterData : true }); });
    await page.locator ('#open_file').setInputFiles ({ name : 'unsupported.txt', mimeType : 'text/plain', buffer : Buffer.from ('not a model') });
    await page.waitForFunction (() => document.body.textContent.includes ('Cannot open file'));
    assert.ok ((await page.locator ('body').textContent ()).includes ('Supported formats:'));
    assert.ok ((await page.locator ('body').textContent ()).includes ('STEP'));
    await page.getByText ('OK', { exact : true }).click ();
    await page.locator ('#open_file').setInputFiles ('test/testfiles/off/cube.off');
    await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Added '));
    const array = await page.evaluate (() => Auto3D.execute ('object.array', { width : 3, length : 2, height : 1 })); assert.equal (array.ok, true, JSON.stringify (array));
    const feedback = await page.evaluate (() => window.feedback);
    assert.ok (feedback.some ((text) => text.includes ('Uploading models…')));
    assert.ok (feedback.some ((text) => text.includes ('Creating an array…')));
    assert.ok (feedback.some ((text) => text.includes ('5 / 5 copies')));
    assert.ok ((await page.locator ('.scene_status').textContent ()).includes ('Created 3 × 2 × 1 array'));
    assert.deepEqual (errors, []); console.log ('Browser upload feedback, unsupported-format guidance and array copy progress passed.');
} finally { await browser.close (); }
