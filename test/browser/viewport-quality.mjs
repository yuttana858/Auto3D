import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
await build ({ stdin : { contents : `
import * as THREE from 'three';
import { Viewer } from './source/engine/viewer/viewer.js';
import { RenderPNG } from './source/website/rendercore.js';
window.verifyQuality=async()=>{
 const canvas=document.createElement('canvas');document.body.append(canvas);const viewer=new Viewer();viewer.Init(canvas);viewer.Resize(640,360);
 const root=new THREE.Group();const geometry=new THREE.BoxGeometry(2,2,2);const mesh=new THREE.Mesh(geometry,[new THREE.MeshStandardMaterial({color:0x2266ff})]);root.add(mesh);viewer.SetMainObject(root);
 const originalIndex=geometry.index.array.slice();const originalPosition=geometry.attributes.position.array.slice();
 const waitFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const job={size:{width:317,height:211},camera:{eye:[4,4,6],center:[0,0,0],up:[0,1,0],fov:45,projectionMode:1},alpha:true};
 const decode=async(blob)=>{const bitmap=await createImageBitmap(blob);const target=document.createElement('canvas');target.width=bitmap.width;target.height=bitmap.height;const ctx=target.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return ctx.getImageData(0,0,target.width,target.height).data;};
 viewer.SetViewportQuality('quality');await waitFrame();if(viewer.renderer.getPixelRatio()!==3)throw Error('Native Quality resolution missing');
 const high=await decode(await RenderPNG({viewer},job,{tileSize:64}));
 viewer.SetViewportQuality('fast');await waitFrame();if(viewer.renderer.getPixelRatio()!==1)throw Error('Fast resolution missing');
 const fast=await decode(await RenderPNG({viewer},job,{tileSize:64}));let changed=0;for(let i=0;i<high.length;i++)if(high[i]!==fast[i])changed++;if(changed)throw Error('Display quality changed final PNG pixels: '+changed);
 viewer.SetViewportQuality('auto');await waitFrame();if(viewer.renderer.getPixelRatio()!==2)throw Error('Auto idle resolution missing');
 let draws=0;const render=viewer.renderer.render.bind(viewer.renderer);viewer.renderer.render=(...args)=>{draws++;return render(...args);};
 for(let i=0;i<200;i++)viewer.navigation.callbacks.onUpdate();await waitFrame();
 if(draws!==1||viewer.renderer.getPixelRatio()!==1)throw Error('Movement was not coalesced into one low-resolution frame: '+draws);
 await new Promise(resolve=>setTimeout(resolve,350));await waitFrame();if(viewer.renderer.getPixelRatio()!==2)throw Error('Idle resolution did not restore');
 if(mesh.geometry!==geometry||JSON.stringify([...geometry.index.array])!==JSON.stringify([...originalIndex])||JSON.stringify([...geometry.attributes.position.array])!==JSON.stringify([...originalPosition]))throw Error('Authoritative geometry changed');
 viewer.viewportQuality.Stop();viewer.mainModel.Clear();viewer.renderer.dispose();return {movementUpdates:200,movementFrames:1,pngPixelDifferences:changed,originalGeometry:true,idlePixelRatio:2};
};`, resolveDir : process.cwd () }, bundle : true, outfile : 'work/viewport-quality.js', logLevel : 'silent' });
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ deviceScaleFactor : 3 }); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.addScriptTag ({ path : 'work/viewport-quality.js' }); const result = await page.evaluate (() => window.verifyQuality ());
    assert.deepEqual (errors, []); console.log ('Viewport quality, coalesced camera frames, identical full-resolution PNG and original geometry:', result);
} finally { await browser.close (); }
