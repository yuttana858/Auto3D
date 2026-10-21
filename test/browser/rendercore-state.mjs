import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
await build ({ stdin : { contents : `
import * as THREE from './node_modules/three/build/three.module.js';
import { RenderPNG, RenderCamera } from './source/website/rendercore.js';
import { ShadingModel } from './source/engine/viewer/shadingmodel.js';
window.checkRenderState = async () => {
 const state = {eye:[4,5,6],center:[0,0,0],up:[0,1,0],fov:45,projectionMode:1};
 const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setSize(317,211); document.body.appendChild(renderer.domElement);
 const scene = new THREE.Scene(); scene.background=new THREE.Color('white'); const background=scene.background;
 const root=new THREE.Group(); const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial({color:0x2266ff})); root.add(mesh);scene.add(root);
 const helper=new THREE.Mesh(new THREE.SphereGeometry(2),new THREE.MeshBasicMaterial({color:0xff0000}));scene.add(helper);
 const dome=new THREE.Mesh(new THREE.SphereGeometry(1),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.BackSide}));scene.add(dome);
 const shading=new ShadingModel(scene);const camera=RenderCamera(state,317,211,0.01,100);
 const viewer={scene,renderer,camera,shadingModel:shading,defaultDome:dome,mainModel:{mainModel:{GetRootObject:()=>root}},Render:()=>renderer.render(scene,camera)};
 const app={viewer};const job={size:{width:317,height:211},camera:state,alpha:true};
 renderer.setViewport(2,3,100,100);renderer.setScissor(7,9,20,20);renderer.setScissorTest(true);renderer.autoClear=false;
 const viewport=renderer.getViewport(new THREE.Vector4()).toArray();const light=shading.directionalLight.position.toArray();const position=dome.position.toArray();
 const check=()=>{if(scene.background!==background||helper.visible!==true||dome.visible!==true||renderer.autoClear!==false||renderer.getScissorTest()!==true||JSON.stringify(renderer.getViewport(new THREE.Vector4()).toArray())!==JSON.stringify(viewport)||JSON.stringify(shading.directionalLight.position.toArray())!==JSON.stringify(light)||JSON.stringify(dome.position.toArray())!==JSON.stringify(position)||renderer.getRenderTarget()!==null)throw Error('state not restored');};
 const decode=async blob=>{const bitmap=await createImageBitmap(blob);const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;bitmap.close();return pixels;};
 const tiled=await decode(await RenderPNG(app,job,{tileSize:64}));check(); const single=await decode(await RenderPNG(app,job,{tileSize:512}));check();
 let changed=0,blue=0,red=0;for(let i=0;i<tiled.length;i+=4){if(Math.max(...[0,1,2,3].map(c=>Math.abs(tiled[i+c]-single[i+c])))>4)changed++;if(tiled[i+2]>tiled[i]*1.3&&tiled[i+2]>tiled[i+1]*1.1&&tiled[i+3]>0)blue++;if(tiled[i]>tiled[i+2]*1.3&&tiled[i+3]>0)red++;}
 if(tiled[3]!==0||blue<1000||red!==0)throw Error('alpha or helper filtering failed');
 let previews=0,liveFrames=0;const originalLiveRender=viewer.Render;viewer.Render=()=>{if(scene.background!==background||!helper.visible||!dome.visible)throw Error('background live frame lost helpers');liveFrames++;originalLiveRender();};
 const interactive=await decode(await RenderPNG(app,job,{tileSize:64,background:true,preview:()=>previews++,progress:value=>{if(value<100)camera.position.set(9,8,7);}}));check();
 if(camera.position.x!==9||previews<2||liveFrames<2)throw Error('background navigation or previews failed');
 let backgroundChanged=0;for(let i=0;i<tiled.length;i+=4){if(Math.max(...[0,1,2,3].map(c=>Math.abs(tiled[i+c]-interactive[i+c])))>4)backgroundChanged++;}
 if(backgroundChanged>317*211*.005)throw Error('navigation changed queued image');viewer.Render=originalLiveRender;
 let cancelled=false;try{await RenderPNG(app,job,{cancelled:()=>true});}catch(error){cancelled=/cancelled/.test(error.message);}check();
 const render=renderer.render.bind(renderer);renderer.render=(...args)=>{if(renderer.getRenderTarget())throw Error('GPU test fault');return render(...args);};let failed=false;try{await RenderPNG(app,job);}catch(error){failed=/GPU test fault/.test(error.message);}check();
 renderer.render=render;let shouldCancel=false;try{await RenderPNG(app,job,{tileSize:64,background:true,cancelled:()=>shouldCancel,progress:()=>{shouldCancel=true;}});}catch(error){if(!/cancelled/.test(error.message))throw error;}check();
 renderer.render=render;scene.traverse(item=>{item.geometry?.dispose();item.material?.dispose();});renderer.dispose();return{changed,blue,red,cancelled,failed,previews,liveFrames,backgroundChanged};
};`, resolveDir : process.cwd () }, bundle : true, outfile : 'work/render-state.js' });
await writeFile ('work/render-state.html', '<script src="/work/render-state.js"></script>');
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage (); await page.goto ('http://127.0.0.1:8080/work/render-state.html');
    const result = await page.evaluate (() => window.checkRenderState ()); assert.ok (result.changed < 317 * 211 * 0.005, JSON.stringify (result)); assert.equal (result.cancelled, true); assert.equal (result.failed, true);
    console.log ('Tiled/single-frame pixels agree; alpha excludes helpers; success, cancellation and GPU failures restore renderer/scene state.', result);
} finally { await browser.close (); }
