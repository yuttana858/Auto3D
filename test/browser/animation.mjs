// Run with npm start in another terminal. Uses a fresh browser profile.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import { OpenSessionArchive } from '../../source/website/sessionarchive.js';
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}}); const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message)});page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log(m.type(),m.text())});page.setDefaultTimeout(60000);
await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
    await page.route ('**/api/personal/items', (route) => route.fulfill ({ json : [] }));
    await page.route ('**/api/auth/session', (route) => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
await page.goto(process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html',{waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>window.Auto3D);
await page.waitForFunction (() => !document.body.classList.contains ('auth_locked'));
await page.locator('#open_file').setInputFiles('test/testfiles/animation/animated.glb');

const call=async(id,args={})=>{const r=await page.evaluate(({id,args})=>Auto3D.execute(id,args),{id,args});assert.equal(r.ok,true,JSON.stringify(r));return r.result;};
await page.waitForFunction(()=>document.querySelector('.scene_status')?.textContent.startsWith('Added '));console.log('import status',await page.locator('.scene_status').textContent());const readRecovery = async () => page.evaluate (async () => {
    const db = await new Promise ((resolve) => { const request = indexedDB.open ('sw-auto3d-library-browser-user', 1); request.onsuccess = () => resolve (request.result); });
    const item = await new Promise ((resolve) => { const request = db.transaction ('saves').objectStore ('saves').get ('__auto3d_recovery__'); request.onsuccess = () => resolve (request.result); });
    db.close (); return item ? { updatedAt : item.updatedAt, bytes : Array.from (new Uint8Array (await item.archive.arrayBuffer ())) } : null;
});
const scene=await call('scene.inspect');console.log('scene',scene);const objectId=scene.objects[0].id;
let importedCheckpoint = null;
for (let attempt = 0; attempt < 40 && !importedCheckpoint; attempt++) { await page.waitForTimeout (250); importedCheckpoint = await readRecovery (); }
assert.ok (importedCheckpoint, 'Initial import must retain history dirty notifications and recovery');
await call('animation.embedded.configure',{objectId,clip:0,speed:1,loop:false});await call('animation.embedded.playback',{objectId,action:'play'});
let progress = null;
for (let attempt = 0; attempt < 40; attempt++) { await page.waitForTimeout (250); progress = await call ('animation.embedded.inspect', { objectId }); if (progress.state?.time > 0.1) { break; } }
assert.ok (progress.state?.time > 0.1, JSON.stringify (progress)); const playing=await call('animation.embedded.playback',{objectId,action:'pause'});assert.ok(playing.time>0.1);
await call('animation.embedded.configure',{objectId,clip:1,speed:1,loop:true});await call('animation.embedded.playback',{objectId,action:'seek',time:1});
await call('animation.panel',{visible:true});assert.equal(await page.getByLabel('Scene state playhead').count(),1);assert.equal(await page.getByLabel('Camera positioning playhead').count(),1);
assert.equal(await page.locator('.animation_panel .native_timeline').count(),0);
await call('animation.timeline.seek',{time:0});await call('animation.keyframe.scene');await call('animation.keyframe.camera');
await call('animation.timeline.seek',{time:3});await call('object.transform',{objectId,position:[2,0,0]});await call('view.focus',{objectId});await call('animation.keyframe.scene');await call('animation.keyframe.camera');
await call('animation.timeline.range',{start:0.5,end:4});
const playhead=page.getByLabel('Scene state playhead');await playhead.fill('1.5');await playhead.dispatchEvent('input');assert.equal((await call('animation.timeline.inspect')).time,1.5); assert.ok (Math.abs ((await call ('scene.inspect')).objects[0].position[0] - 1) < 1e-6);
const marker=page.getByLabel('Beginning marker on Scene state');await marker.focus();await page.keyboard.press('ArrowRight');assert.ok((await call('animation.timeline.inspect')).rangeStart>0.5);
await page.getByLabel('End of animation',{exact:true}).fill('3.5');await page.getByLabel('End of animation',{exact:true}).dispatchEvent('change');
await page.screenshot({path:'/tmp/auto3d-advance-animation.png'});
await call('animation.timeline.playback',{action:'play'});await page.waitForTimeout(250);await call('animation.timeline.playback',{action:'pause'});
await call('object.transform',{objectId,position:[1,0,0]});
let checkpoint = null;
for (let attempt = 0; attempt < 40 && !checkpoint; attempt++) { await page.waitForTimeout (250); checkpoint = await readRecovery (); }
assert.ok (checkpoint, 'Worker recovery must finish');
const recovery=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('sw-auto3d-library-browser-user',1);r.onsuccess=()=>resolve(r.result);});const item=await new Promise(resolve=>{const r=db.transaction('saves').objectStore('saves').get('__auto3d_recovery__');r.onsuccess=()=>resolve(r.result);});db.close();return item?Array.from(new Uint8Array(await item.archive.arrayBuffer())):null;});
assert.ok(recovery?.length>0,'Recovery worker must create an archive');
console.log('worker recovery saved',recovery.length,'bytes');
await call('object.transform',{objectId,position:[1.25,0,0]});
let nextCheckpoint = null;
for (let attempt = 0; attempt < 40; attempt++) { await page.waitForTimeout (250); nextCheckpoint = await readRecovery (); if (nextCheckpoint && nextCheckpoint.updatedAt !== checkpoint.updatedAt && OpenSessionArchive (new Uint8Array (nextCheckpoint.bytes)).document.objects[0].position[0] === 1.25) { break; } }
assert.ok (nextCheckpoint && nextCheckpoint.updatedAt !== checkpoint.updatedAt, 'Cached geometry recovery must update');
await call('ui.save');await page.getByLabel('Save name',{exact:true}).fill('Animation QA');await page.getByLabel('Save destination',{exact:true}).selectOption('device');
await page.getByRole('button',{name:'Save to library',exact:true}).click();
await page.waitForFunction(()=>document.body.textContent.includes('Saved successfully to'));
console.log('Browser playback, timeline controls and library save passed');
console.log('errors',errors);assert.deepEqual(errors,[]);
console.log('status',await page.locator('.scene_status').textContent());
// Inspect actual saved portable archive bytes and background recovery through IndexedDB.
const records=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sw-auto3d-library-browser-user',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('saves').objectStore('saves').getAll();r.onsuccess=()=>resolve(r.result.map(i=>({id:i.id,name:i.name,size:i.archive?.size})));r.onerror=()=>reject(r.error);});}finally{db.close();}}).catch(e=>({error:e.message}));console.log('stored records',records);
const archive=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('sw-auto3d-library-browser-user',1);r.onsuccess=()=>resolve(r.result);});const items=await new Promise(resolve=>{const r=db.transaction('saves').objectStore('saves').getAll();r.onsuccess=()=>resolve(r.result);});db.close();const item=items.find(i=>i.name==='Animation QA');return Array.from(new Uint8Array(await item.archive.arrayBuffer()));});

const recovered = OpenSessionArchive (new Uint8Array (nextCheckpoint.bytes)); assert.equal (recovered.document.objects[0].position[0], 1.25); assert.equal (recovered.view.timeline.rangeEnd, 3.5);
const saved=OpenSessionArchive(new Uint8Array(archive));
assert.equal(saved.view.timeline.rangeStart,0.6);assert.equal(saved.view.timeline.rangeEnd,3.5);assert.equal(saved.view.timeline.cameraKeyframes.length,2); assert.notDeepEqual (saved.view.timeline.cameraKeyframes[0].center, saved.view.timeline.cameraKeyframes[1].center);assert.equal(saved.document.objects[0].keyframes.length,2);assert.ok(saved.document.objects[0].animationAsset.files[0].buffer.byteLength>0);
console.log('Actual library .auto3d archive tracks/range/source verified');
await page.keyboard.press('Escape');
await call('ui.library');await page.getByRole('button',{name:'Device library',exact:true}).click();
await page.getByLabel('Open Animation QA',{exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('.library_grid'));
const restored=await call('animation.timeline.inspect');assert.equal(restored.rangeStart,0.6);assert.equal(restored.rangeEnd,3.5);assert.equal(restored.cameraKeyframes.length,2);
await call('animation.embedded.playback',{objectId,action:'play'});await page.waitForTimeout(200);const resumed=await call('animation.embedded.playback',{objectId,action:'pause'});assert.ok(resumed.time>0);
assert.deepEqual(errors,[]);console.log('Library reopen and embedded playback passed');
}finally{await browser.close();}
