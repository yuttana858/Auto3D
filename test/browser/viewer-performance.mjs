import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
await build({stdin:{contents:`
import * as THREE from 'three';
import { SceneEffects } from './source/engine/viewer/sceneeffects.js';
import { ShadingModel } from './source/engine/viewer/shadingmodel.js';
import { Direction } from './source/engine/geometry/geometry.js';
window.auditViewer=()=>{
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(800,450);renderer.info.autoReset=false;
 const scene=new THREE.Scene();scene.background=new THREE.Color('white');const root=new THREE.Group();scene.add(root);
 const mesh=new THREE.Mesh(new THREE.TorusKnotGeometry(1,0.3,2000,20),new THREE.MeshStandardMaterial({color:0x6688aa}));mesh.position.y=2;mesh.castShadow=true;root.add(mesh);
 const camera=new THREE.PerspectiveCamera(45,800/450,0.01,100);camera.position.set(4,4,6);camera.lookAt(0,2,0);
 const shading=new ShadingModel(scene);const viewer={scene,renderer,camera,shadingModel:shading,mainModel:{mainModel:{GetRootObject:()=>root}},upVector:{direction:Direction.Y,isFlipped:false},canvas:renderer.domElement,Render:()=>renderer.render(scene,camera)};
 const effects=new SceneEffects(viewer);effects.Update();const gl=renderer.getContext();const rows=[];
 for(const [name,shadows,reflection,dpr] of [['plain',false,false,1],['shadows',true,false,1],['shadows+floor reflection',true,true,1],['plain DPR2',false,false,2]]){
  effects.settings.shadows=shadows;effects.settings.floorReflection=reflection;renderer.setPixelRatio(dpr);effects.Update();viewer.Render();gl.finish();let times=[];let triangles=0,calls=0;
  for(let i=0;i<8;i++){camera.position.x=4+i/100;camera.lookAt(0,2,0);renderer.info.reset();const start=performance.now();viewer.Render();gl.finish();times.push(performance.now()-start);triangles+=renderer.info.render.triangles;calls+=renderer.info.render.calls;}
  times.sort((a,b)=>a-b);rows.push({name,geometryTriangles:mesh.geometry.index.count/3,meanMs:times.reduce((a,b)=>a+b)/times.length,p50Ms:times[4],maxMs:times[7],submittedTrianglesPerFrame:triangles/8,drawCallsPerFrame:calls/8,canvasPixels:renderer.domElement.width*renderer.domElement.height});
 }
 effects.Dispose();renderer.dispose();return {renderer:gl.getParameter(gl.RENDERER),rows};
};`,resolveDir:process.cwd()},bundle:true,outfile:'work/viewer-audit.js',logLevel:'silent'});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage();await page.addScriptTag({path:'work/viewer-audit.js'});const result=await page.evaluate(()=>window.auditViewer());
const [plain,shadow,reflection]=result.rows;
assert.equal(plain.submittedTrianglesPerFrame,80000);
assert.equal(shadow.submittedTrianglesPerFrame,160002);
assert.equal(shadow.drawCallsPerFrame,3);
assert.equal(reflection.submittedTrianglesPerFrame,320006);
assert.ok(result.rows.every(row=>row.geometryTriangles===80000),'Preview effects must retain original geometry');
console.log(JSON.stringify(result,null,2));}finally{await browser.close();}
