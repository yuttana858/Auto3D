import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir ('work', { recursive : true });
await build ({ stdin : { contents : `
import * as THREE from './node_modules/three/build/three.module.js';
import { SceneEffects } from './source/engine/viewer/sceneeffects.js';
import { Direction } from './source/engine/geometry/geometry.js';
window.shadowCheck = () => {
 const renderer = new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true}); renderer.setSize(320,320); document.body.appendChild(renderer.domElement);
 const scene = new THREE.Scene(); scene.background = new THREE.Color('white');
 const camera = new THREE.PerspectiveCamera(45,1,0.01,100); camera.position.set(4,5,6); camera.lookAt(0,0,0);
 const root = new THREE.Group(); const material = new THREE.MeshBasicMaterial({color:0x2266ff});
 const model = new THREE.Mesh(new THREE.BoxGeometry(2,2,2),material); model.castShadow = true; root.add(model); scene.add(root);
 const light = new THREE.DirectionalLight('white',1); light.position.set(-5,6,-4); scene.add(light);
 /* Floor shadows project along the global direction (1,2,1) rotated by environmentRotation (floorshadow.js), not this light; turn it toward the camera so the silhouette is not hidden behind the box. */
 scene.environmentRotation.set(0,Math.PI,0);
 const viewer = {scene,renderer,canvas:renderer.domElement,upVector:{direction:Direction.Y,isFlipped:false},shadingModel:{directionalLight:light,UpdateShading:()=>{}},mainModel:{mainModel:{GetRootObject:()=>root}},Render:()=>renderer.render(scene,camera)};
 const effects = new SceneEffects(viewer); effects.Set('shadows',true);
 const order = []; model.onBeforeRender = ()=>order.push('model'); const renderMask = effects.shadowFloor.onBeforeRender; effects.shadowFloor.onBeforeRender = (...args)=>{order.push('floor'); renderMask(...args);};
 const sample = (strength,transparent) => {
  material.transparent = transparent; material.depthWrite = !transparent; material.needsUpdate = true;
  effects.Set('shadowIntensity',strength); order.length = 0; viewer.Render();
  const gl = renderer.getContext(); const pixels = new Uint8Array(320*320*4); gl.readPixels(0,0,320,320,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let blue = 0, dark = 0; for(let i=0;i<pixels.length;i+=4){if(pixels[i+2]>pixels[i]*1.3 && pixels[i+2]>pixels[i+1]*1.1) blue++; else if(pixels[i]<200 && pixels[i+1]<200 && pixels[i+2]<200) dark++;}
  return {blue,dark,order:[...order]};
 };
 const result = [false,true].map(transparent=>({transparent,off:sample(0,transparent),on:sample(1,transparent)}));
 effects.Dispose(); renderer.dispose(); return result;
};`, resolveDir : process.cwd (), loader : 'js' }, bundle : true, outfile : 'work/floor-shadow-browser.js' });
await writeFile ('work/floor-shadow-browser.html', '<script src="/work/floor-shadow-browser.js"></script>');
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ();
    await page.goto ('http://127.0.0.1:8080/work/floor-shadow-browser.html');
    const result = await page.evaluate (() => window.shadowCheck ());
    for (const sample of result) {
        assert.ok (sample.off.blue > 1000); assert.equal (sample.on.blue, sample.off.blue);
        assert.ok (sample.on.dark > sample.off.dark + 100, JSON.stringify (sample));
        /* docs/rendering.md: depth testing protects opaque models (they render first); the floor renders before transparent models. */
        if (sample.transparent) { assert.ok (sample.on.order.indexOf ('floor') < sample.on.order.indexOf ('model'), JSON.stringify (sample)); } else { assert.ok (sample.on.order.indexOf ('model') < sample.on.order.indexOf ('floor'), JSON.stringify (sample)); }
    }
    console.log ('Opaque models render before the depth-tested floor and the floor renders before transparent models; model coverage unchanged; ground shadows visible.', result);
} finally { await browser.close (); }
