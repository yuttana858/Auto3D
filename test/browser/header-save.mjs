import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/auth/**',route=>route.fulfill({json:{user:{id:'save-fixture',email:'fixture@example.com'}}}));
  await page.route('**/api/preferences',route=>route.fulfill({json:{preferences:{units:'metric',theme:1},folders:['Uncategorized']}}));
  await page.route('**/api/personal/items**',route=>route.fulfill({json:[]}));
  await page.goto(process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html');await page.waitForFunction(()=>window.Auto3D&&!document.body.classList.contains('auth_locked'));
  const save=page.getByRole('button',{name:'Save current session',exact:true});await save.waitFor({state:'visible'});
  assert.equal(await save.evaluate(el=>el.nextElementSibling.getAttribute('aria-label')),'Library');
  await save.click();await page.getByLabel('Save destination',{exact:true}).waitFor();assert.equal(await page.getByLabel('Save destination',{exact:true}).inputValue(),'account');
  await page.getByRole('button',{name:'Close Save session',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[aria-label="Save session"]'));
  const result=await page.evaluate(()=>Auto3D.execute('ui.save',{destination:'account'}));assert.equal(result.ok,true);assert.equal(await page.getByLabel('Save destination',{exact:true}).inputValue(),'account');
  await page.getByRole('button',{name:'Close Save session',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[aria-label="Save session"]'));
  assert.equal((await page.evaluate(()=>Auto3D.execute('ui.save',{destination:'invalid'}))).ok,false);
  await page.route('**/api/share/**',route=>route.fulfill({status:404,json:{error:'Unavailable test link'}}));
  await page.goto((process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html')+'?view=11111111-1111-4111-8111-111111111111');await page.waitForFunction(()=>window.Auto3D&&!document.body.classList.contains('auth_locked'));
  assert.equal(await page.getByRole('button',{name:'Save current session',exact:true}).isVisible(),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Desktop/mobile Save-before-Library, account-default dialog and command validation passed.');
}finally{await browser.close();}
