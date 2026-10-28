import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1200, height : 850 } }); page.setDefaultTimeout (60000); const messages = [], failures = [];
    page.on ('console', message => { if (['warning', 'error'].includes (message.type ())) { messages.push (message.text ()); } }); page.on ('pageerror', error => failures.push (error.message));
    await page.addInitScript (() => {
        const original = HTMLCanvasElement.prototype.getContext, seen = new WeakSet (); window.contextProbe = [];
        HTMLCanvasElement.prototype.getContext = function (type, ...args) { const context = original.call (this, type, ...args); if (context && ['webgl', 'webgl2'].includes (type) && !seen.has (this)) { seen.add (this); window.contextProbe.push ({ canvas : this, context }); } return context; };
    });
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'preview-context-test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric', viewportQuality : 'fast' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    await call ('ui.module.mode', { module : 'data', mode : 'minimal' });
    const first = await call ('packaging.fefco.preset', { code : '0201', length : 100, width : 80, height : 60 });
    const second = await call ('packaging.fefco.preset', { code : '0201', length : 110, width : 90, height : 70 });
    await page.locator ('.scene_model_preview_canvas').waitFor ({ state : 'attached' });
    for (let i = 0; i < 24; i++) { await call ('object.select', { objectId : i % 2 ? first.objectId : second.objectId }); }
    await call ('packaging.fefco.scrub', { progress : .3 }); const main = page.locator ('#viewer'); const rect = await main.boundingBox (); await page.mouse.move (rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.wheel (0, -140);
    const image = PNG.sync.read (await main.screenshot ()); let white = 0; for (let i = 0; i < image.data.length; i += 4) { if (image.data[i] > 245 && image.data[i + 1] > 245 && image.data[i + 2] > 245) { white++; } } assert.ok (white / (image.width * image.height) < .98, 'Main viewer turned white after fold and zoom');
    const contexts = await page.evaluate (() => ({ created : window.contextProbe.length, live : window.contextProbe.filter (item => !item.context.isContextLost ()).length, mainLost : window.contextProbe.find (item => item.canvas.id === 'viewer')?.context.isContextLost (), previews : window.contextProbe.filter (item => item.canvas.classList.contains ('scene_model_preview_canvas')).length }));
    assert.ok (contexts.previews >= 20, JSON.stringify (contexts)); assert.ok (contexts.live <= 3, JSON.stringify (contexts)); assert.equal (contexts.mainLost, false);
    const diagnostics = await call ('lighting.shadow.inspect'); assert.equal (diagnostics.contextLost, false); assert.equal (diagnostics.rootVisible, true); assert.ok (diagnostics.visibleMeshes > 0);
    const errors = await call ('diagnostics.list', { level : 'error' }); assert.ok (!errors.entries.some (entry => entry.source === 'WebGL'), JSON.stringify (errors.entries));
    assert.ok (!messages.some (message => /Too many active WebGL contexts|WebGLRenderer: Context Lost/i.test (message)), JSON.stringify (messages)); assert.deepEqual (failures, []);
    console.log ('Repeated selections released preview contexts, retained the main viewer and produced no false WebGL-loss diagnostic:', JSON.stringify (contexts));
} finally { await browser.close (); }
