import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
 const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); page.setDefaultTimeout (180000);
 await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'log-test', email : 'test@example.com' } } }));
 await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : {}, folders : [] } })); await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false } })); await page.route ('**/api/personal/items', route => route.fulfill ({ json : [] })); await page.route ('**/api/environments', route => route.fulfill ({ json : [] }));
 await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.locator ('#startup_splash').waitFor ({ state : 'detached' });
 const call = async (id, args = {}) => { const response = await page.evaluate (({id,args}) => Auto3D.execute(id,args), {id,args}); assert.equal(response.ok,true,response.error?.message); return response.result; };
 const strip = page.getByRole ('toolbar', { name : 'Object tools' }); const panel = page.locator ('#main_right_container'); const toggle = page.locator ('#data_panel_toggle');
 for (const expanded of [false,true,false,true]) { if ((await toggle.getAttribute ('aria-expanded') === 'true') !== expanded) { await toggle.click (); } const rect=await strip.boundingBox();const bounds=await panel.boundingBox();assert.ok(Math.abs(rect.x-bounds.x)<2);if(expanded){assert.ok(rect.x+rect.width<bounds.x+bounds.width-100);const content=await page.locator('#data_panel_content').boundingBox();assert.ok(content.x>=rect.x+rect.width-2);} }
 await call ('diagnostics.clear');
 await page.evaluate (() => { console.error ('Test shader error Authorization=Bearer fake-secret'); window.dispatchEvent(new ErrorEvent('error',{message:'Test runtime error'})); window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection',{promise:Promise.resolve(),reason:new Error('Test rejection')})); document.querySelector('#main_viewer canvas').dispatchEvent(new Event('webglcontextlost',{bubbles:true})); });
 await page.route ('**/api/diagnostic-test*', route=>route.fulfill({status:503,json:{error:'fake'}})); await page.evaluate(()=>fetch('/api/diagnostic-test?access_token=fake-secret'));
 await page.getByRole ('button',{name:'Preferences',exact:true}).click(); await page.getByRole('button',{name:'Error logs',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Error logs',exact:true});await dialog.waitFor();assert.ok((await dialog.textContent()).includes('HTTP 503 /api/diagnostic-test'));assert.ok(!(await dialog.textContent()).includes('fake-secret'));await dialog.getByRole('button',{name:'Review shadow state'}).click();assert.ok((await dialog.textContent()).includes('Current shadow state'));
 const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download error log'}).click();const file=await download;const exported=JSON.parse(await readFile(await file.path(),'utf8'));assert.ok(exported.entries.length>=5);assert.ok(!JSON.stringify(exported).includes('fake-secret'));
 await page.screenshot({path:'work/error-log-preferences.png'});await page.reload();await page.locator('#startup_splash').waitFor({state:'detached'});const restored=await call('diagnostics.list');assert.ok(restored.entries.some(e=>e.message.includes('Test runtime error')));
 await call('auth.sign_out');assert.equal(await page.evaluate(()=>sessionStorage.getItem('auto3d-error-log-v1:log-test')),null);
 console.log('Preferences error review/export, runtime/fetch/WebGL logging, refresh persistence, logout cleanup and expanded/collapsed tool strip positioning passed.');
}finally {await browser.close();}
