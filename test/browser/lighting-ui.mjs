import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1400, height : 1000 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', error => { errors.push (error.message); console.log ('PAGEERROR', error.message); }); page.on ('console', message => { if (message.type () === 'error') { console.log (message.text ()); if (message.text ().includes ('Shader Error')) { errors.push (message.text ()); } } });
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2 }, folders : [] } }));
    await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false, requests : [] } }));
    await page.route ('**/api/personal/items', route => route.fulfill ({ json : [] })); await page.route ('**/api/environments', route => route.fulfill ({ json : [] }));
    await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' }); await page.locator ('#startup_splash').waitFor ({ state : 'detached' }); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked')); /* the welcome screen can close before sign-in is restored */
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    console.log ('Workspace ready'); await page.locator ('#lighting_section').evaluate (node => { node.open = true; }); await page.locator ('#open_file').setInputFiles ('website/assets/models/DamagedHelmet.glb'); await page.waitForFunction (() => /^(Added|Imported|Can not|Could not|Unable)/.test (document.querySelector ('.scene_status')?.textContent || '')); console.log ('Import:', await page.locator ('.scene_status').textContent ()); await page.screenshot ({ path : 'work/helmet-import.png' }); await call ('view.fit'); await call ('lighting.restore', { mode : 'default' }); await call ('view.background', { preset : 'light' });
    const sample = async name => {
        const png = await page.locator ('#main_viewer canvas').first ().screenshot ({ path : `work/helmet-${name}.png` });
        return page.evaluate (async encoded => { const image = new Image (); image.src = 'data:image/png;base64,' + encoded; await image.decode (); const canvas = document.createElement ('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext ('2d'); context.drawImage (image, 0, 0); const data = context.getImageData (Math.floor (image.width * 0.4), Math.floor (image.height * 0.4), Math.floor (image.width * 0.2), Math.floor (image.height * 0.2)).data; let total = 0; for (let i = 0; i < data.length; i += 4) { total += (data[i] + data[i + 1] + data[i + 2]) / 3; } return total / (data.length / 4); }, png.toString ('base64'));
    };
    await call ('lighting.effects', { shadows : false, ambientIntensity : 0, floorReflection : false, modelReflections : false }); const before = await sample ('fill-off');
    await page.locator ('#ambient_intensity').evaluate (node => { node.value = '3'; node.dispatchEvent (new Event ('input', { bubbles : true })); node.dispatchEvent (new Event ('change', { bubbles : true })); }); const filled = await sample ('fill-on'); assert.ok (filled > before + 20, JSON.stringify ({ before, filled }));
    await page.locator ('#global_shadows').check (); await page.locator ('#shadow_intensity').evaluate (node => { node.value = '1'; node.dispatchEvent (new Event ('input', { bubbles : true })); }); const shadowed = await sample ('shadow-on'); assert.ok (Math.abs (shadowed - filled) < 2, JSON.stringify ({ filled, shadowed }));
    const diagnosis = await call ('lighting.shadow.inspect'); assert.equal (diagnosis.mapEnabled, false); assert.equal (diagnosis.pipeline, 'projected-color-mask'); assert.equal (diagnosis.captureError, null); assert.deepEqual (diagnosis.shaderErrors, []);
    await call ('lighting.effects', { floorReflection : true }); await sample ('reflection-and-shadow'); assert.equal ((await call ('lighting.shadow.inspect')).captureError, null);
    const visibleModel = async name => {
        const png = await page.locator ('#main_viewer canvas').first ().screenshot ({ path : `work/toggle-${name}.png` });
        const colored = await page.evaluate (async encoded => {
            const image = new Image (); image.src = 'data:image/png;base64,' + encoded; await image.decode ();
            const canvas = document.createElement ('canvas'); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext ('2d'); context.drawImage (image, 0, 0);
            const data = context.getImageData (Math.floor (image.width * 0.35), Math.floor (image.height * 0.35), Math.floor (image.width * 0.3), Math.floor (image.height * 0.3)).data;
            let count = 0; for (let index = 0; index < data.length; index += 4) { if (Math.max (data[index], data[index + 1], data[index + 2]) - Math.min (data[index], data[index + 1], data[index + 2]) > 25) { count++; } } return count;
        }, png.toString ('base64'));
        assert.ok (colored > 200, `Textured model disappeared: ${name}, colored pixels: ${colored}`);
        const state = await call ('lighting.shadow.inspect'); assert.equal (state.contextLost, false); assert.equal (state.captureError, null); assert.equal (state.modelReflection.captureError, null); assert.deepEqual (state.shaderErrors, []);
    };
    await call ('lighting.effects', { floorReflection : false, ambientIntensity : 0 });
    for (const mode of ['default', 'hdri']) {
        await call ('lighting.restore', { mode, environment : 'studio_small_09' }); assert.equal ((await call ('lighting.inspect')).mode, mode);
        await call ('view.background', { preset : 'light' });
        for (const reflect of [false, true]) { for (const shadows of [false, true]) {
            await page.locator ('#model_reflections').setChecked (reflect); await page.locator ('#global_shadows').setChecked (shadows);
            await visibleModel (`${mode}-reflect-${reflect}-shadows-${shadows}`);
        } }
        await page.locator ('#model_reflections').uncheck (); await page.locator ('#global_shadows').uncheck (); await visibleModel (`${mode}-disabled-again`);
    }
    assert.deepEqual (errors, []); console.log ('Textured metallic helmet: live fill brightens the model; Shadows preserves its pixels; floor reflection also renders.', { before, filled, shadowed });
} finally { await browser.close (); }
