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
    if (process.env.AUTO3D_BOARD_EFFECTS === '1') { await call ('lighting.effects', { shadows : true, ambientIntensity : .15, modelReflections : true, floorReflection : true }); }
    await call ('ui.ai.packaging'); await page.getByText ('Realistic board surface', { exact : true }).click ();
    const messages = []; page.on ('console', message => { if (message.type () === 'error') { messages.push (message.text ()); } });
    const pixels = async label => {
        const result = await page.evaluate (async () => {
            const result = await Auto3D.execute ('capture.image', { scope : 'viewport', maxSize : 512 }); if (!result.ok) { return { error : result.error }; }
            const img = new Image (); img.src = 'data:image/png;base64,' + result.result.content[0].data; await img.decode (); const canvas = document.createElement ('canvas'); canvas.width = img.width; canvas.height = img.height; const context = canvas.getContext ('2d'); context.drawImage (img, 0, 0); const data = context.getImageData (0, 0, img.width, img.height).data; let white = 0, board = 0;
            for (let i = 0; i < data.length; i += 4) { if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) { white++; } if (data[i] > 40 && data[i] > data[i + 1] * 1.08 && data[i + 1] > data[i + 2] * 1.08) { board++; } }
            return { board, whiteFraction : white / (data.length / 4) };
        }); console.log (label, JSON.stringify (result)); assert.ok (result.board > 500, 'Box disappeared after ' + label); assert.ok (result.whiteFraction < .98, 'Viewer turned white after ' + label);
    };
    const waitIdle = () => page.waitForFunction (() => !document.querySelector ('input[aria-label="Enable board surface"]').disabled);
    const checkbox = page.getByLabel ('Enable board surface', { exact : true }); await checkbox.waitFor ();
    /* Since Packaging 1.10.4 a change made while the scene is still busy is rejected with a wait message and the control is restored, so retry until the toggle is accepted. */
    const rejection = 'Wait for the current operation to finish, then change the board surface again.';
    const toggle = async enabled => {
        for (let attempt = 0; attempt < 20; attempt++) {
            await waitIdle (); if (await checkbox.isChecked () === enabled) { return; }
            await page.evaluate (message => { for (const node of document.querySelectorAll ('p, div, span')) { if (node.childElementCount === 0 && node.textContent === message) { node.textContent = ''; } } }, rejection);
            await checkbox.click (); await page.waitForTimeout (300); await waitIdle ();
            const rejected = await page.evaluate (message => document.body.textContent.includes (message), rejection);
            if (!rejected && await checkbox.isChecked () === enabled) { return; }
        }
        throw new Error ('Board surface toggle was never accepted');
    };
    await pixels ('initial');
    for (const enabled of [false, true]) { await toggle (enabled); await pixels ('enable ' + enabled); }
    for (const [label, value] of [['Panel bow', '1'], ['Fold softness', '2'], ['Cut compression', '1'], ['Paper grain', '.7']]) {
        await page.getByLabel (label, { exact : true }).evaluate ((input, value) => { input.value = value; input.dispatchEvent (new Event ('change', { bubbles : true })); }, value); await waitIdle (); await pixels (label);
    }
    await call ('packaging.fefco.camera', { autoFit : false }); await call ('packaging.fefco.scrub', { progress : .23 });
    for (const enabled of [false, true]) { await toggle (enabled); await pixels ('folded enable ' + enabled); }
    await page.screenshot ({ path : 'work/board-panel-white-repro.png' });
    const rendering = await call ('lighting.shadow.inspect'); assert.equal (rendering.contextLost, false); assert.deepEqual (rendering.shaderErrors, []); assert.equal (rendering.rootVisible, true);
    await call ('diagnostics.shadow'); const log = await call ('diagnostics.list', { level : 'all' }); console.log ('Diagnostics', JSON.stringify (log)); console.log ('Console errors', JSON.stringify (messages)); assert.deepEqual (errors, []); assert.deepEqual (messages, []);
    console.log ('Actual panel remained rendered through toggles, extreme geometry controls, grain refresh and a fold preview.');
} finally { await browser.close (); }
