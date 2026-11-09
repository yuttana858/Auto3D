import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
import { CaptureForChat } from '../../tools/agent_capture.mjs';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1280, height : 900 } }); page.setDefaultTimeout (180000); const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
    await page.route ('**/api/auth/**', (route) => route.fulfill ({ json : { user : { id : 'capture-test', email : 'capture@example.com' } } }));
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric' }, folders : [] } }));
    await page.route ('**/api/accounts/**', (route) => route.fulfill ({ json : { isAdmin : false, requests : [] } }));
    await page.route ('**/api/environments', (route) => route.fulfill ({ json : [] }));
    await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' }); await page.locator ('#startup_splash').waitFor ({ state : 'detached' }); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked')); /* the welcome screen can close before sign-in is restored */
    const call = async (id, args = {}) => { const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, response.error?.message); return response.result; };
    await call ('packaging.path.add', { points : [[0, 0], [100, 0], [100, 60], [0, 60]], type : 'cut', closed : true, units : 'mm' }); await call ('packaging.board', { thickness : 20, units : 'mm' }); await call ('packaging.extrude'); await call ('view.fit');
    const viewport = await CaptureForChat (page, { scope : 'viewport', maxSize : 800 }); assert.ok (viewport.structuredContent.width <= 800); await writeFile ('work/agent-viewport-capture.png', Buffer.from (viewport.content[0].data, 'base64'));
    await call ('packaging.open');
    await page.evaluate (() => {
        for (const [kind, x, color] of [['public', 0, '#00ff00'], ['password', 110, '#ff00ff'], ['preview', 220, '#ff00ff'], ['input', 330, '#ff00ff'], ['admin', 440, '#ff00ff']]) {
            const element = document.createElement (kind === 'input' ? 'input' : 'div'); element.style.cssText = 'position:fixed;top:0;left:' + x + 'px;width:100px;height:100px;background:' + color + ';z-index:2147483647';
            if (kind === 'password') { element.className = 'password_input'; element.textContent = 'shown password'; }
            if (kind === 'preview') { element.setAttribute ('data-capture-preview', ''); }
            if (kind === 'admin') { element.setAttribute ('data-capture-private', ''); }
            element.setAttribute ('data-test-capture-marker', ''); document.body.appendChild (element);
        }
    });
    const workspace = await CaptureForChat (page, { scope : 'workspace', maxSize : 1280 }); assert.equal (workspace.structuredContent.width, 1280); assert.equal (workspace.structuredContent.height, 900);
    const pixels = await page.evaluate (async (base64) => {
        const image = new Image (); image.src = 'data:image/png;base64,' + base64; await image.decode (); const canvas = document.createElement ('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext ('2d'); context.drawImage (image, 0, 0); const data = context.getImageData (0, 0, canvas.width, canvas.height).data; let publicCount = 0; let privateCount = 0;
        for (let i = 0; i < data.length; i += 4) { if (data[i] < 10 && data[i + 1] > 245 && data[i + 2] < 10) { publicCount++; } if (data[i] > 245 && data[i + 1] < 10 && data[i + 2] > 245) { privateCount++; } } return { publicCount, privateCount };
    }, workspace.content[0].data); assert.ok (pixels.publicCount > 8000, JSON.stringify (pixels)); assert.equal (pixels.privateCount, 0);
    await page.evaluate (() => document.querySelectorAll ('[data-test-capture-marker]').forEach ((element) => element.remove ()));
    const clean = await CaptureForChat (page, { scope : 'workspace' }); await writeFile ('work/agent-workspace-capture.png', Buffer.from (clean.content[0].data, 'base64'));
    await page.getByRole ('button', { name : 'Close Packaging', exact : true }).click (); await call ('view.fit'); await CaptureForChat (page, { scope : 'viewport' });
    await call ('auth.sign_out'); await assert.rejects (CaptureForChat (page), /Sign in/); assert.deepEqual (errors, []);
    console.log ('Viewport/workspace PNG, real pixel privacy filtering, packaging capture, restored viewer and logout rejection passed.');
} finally { await browser.close (); }
