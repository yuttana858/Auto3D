import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { writeFile } from 'node:fs/promises';
await build ({ stdin : { contents : `
import * as THREE from './node_modules/three/build/three.module.js';
import { SceneEffects } from './source/engine/viewer/sceneeffects.js';
import { ShadingModel } from './source/engine/viewer/shadingmodel.js';
import { Direction } from './source/engine/geometry/geometry.js';
import { RenderPNG } from './source/website/rendercore.js';
window.checkLighting = async () => {
 const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(400,400);renderer.setClearColor(0xffffff,1); const scene=new THREE.Scene();scene.background=new THREE.Color('white');
 const root=new THREE.Group();scene.add(root);const shading=new ShadingModel(scene);
 const camera=new THREE.PerspectiveCamera(45,1,0.01,100);camera.position.set(4,4,6);camera.lookAt(0,0.8,0);
 const material=new THREE.MeshPhysicalMaterial({color:0x998866,metalness:1,roughness:0.4});const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),material);mesh.position.y=1;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
 const viewer={scene,renderer,camera,shadingModel:shading,mainModel:{mainModel:{GetRootObject:()=>root}},upVector:{direction:Direction.Y,isFlipped:false},canvas:renderer.domElement,Render:()=>{shading.UpdateByCamera({eye:{x:4,y:4,z:6},center:{x:0,y:0.8,z:0}});renderer.render(scene,camera);}};
 const effects=new SceneEffects(viewer);const target=new THREE.WebGLRenderTarget(400,400);renderer.setRenderTarget(target);
 const pixels=()=>{viewer.Render();const data=new Uint8Array(400*400*4);renderer.readRenderTargetPixels(target,0,0,400,400,data);return data;};
 const center=data=>{const i=(200*400+200)*4;return data[i]+data[i+1]+data[i+2];};
 effects.Update();const base=pixels();effects.Set('ambientIntensity',3);effects.ambientRadiance.value=0;const diffuseOnly=pixels();effects.ambientRadiance.value=3;const filled=pixels();
 if(center(filled)<center(base)+80||Math.abs(center(base)-center(diffuseOnly))>2)throw Error('metal fill failed');
 const fill={base:center(base),diffuseOnly:center(diffuseOnly),filled:center(filled)};const cases=[];scene.environmentRotation.y=Math.PI;
 for(const [name,m] of [['opaque',new THREE.MeshBasicMaterial({color:0x2266ff})],['transparent',new THREE.MeshBasicMaterial({color:0x2266ff,transparent:true,opacity:0.55,depthWrite:false})],['metal',material]]){
  mesh.material=m;effects.Update();effects.Set('shadows',false);const before=pixels();const alpha=m.opacity;const shader=m.onBeforeCompile;const light=shading.directionalLight.intensity;
  effects.Set('shadows',true);effects.Set('shadowIntensity',0.8);const after=pixels();let visible=0,changedModel=0,shadow=0;
  for(let i=0;i<before.length;i+=4){const model=before[i]<245||before[i+1]<245||before[i+2]<245;if(model){visible++;if(Math.max(...[0,1,2,3].map(c=>Math.abs(before[i+c]-after[i+c])))>2)changedModel++;}else if(after[i]<230&&after[i+1]<230&&after[i+2]<230){shadow++;}}
  if(visible<1000||(name!=='transparent'&&changedModel>10)||shadow<100||m.opacity!==alpha||m.onBeforeCompile!==shader||shading.directionalLight.intensity!==light||renderer.shadowMap.enabled)throw Error(JSON.stringify({name,visible,changedModel,shadow}));
  cases.push({name,visible,changedModel,shadow});effects.Set('shadows',false);
 }
 mesh.material=material;effects.Update();effects.Set('shadows',true);pixels();const shadow=effects.floorShadow;const savedViewport=renderer.getViewport(new THREE.Vector4()).toArray();const render=renderer.render.bind(renderer);renderer.render=(s,c)=>{if(s===shadow.scene)throw Error('capture fault');return render(s,c);};pixels();
 if(shadow.lastError!=='capture fault'||renderer.getRenderTarget()!==target||JSON.stringify(renderer.getViewport(new THREE.Vector4()).toArray())!==JSON.stringify(savedViewport))throw Error('failed shadow capture corrupted renderer');renderer.render=render;
 // Exercise a failed optional cube pass while floor shadows are enabled.
 // Subsequent viewport draws must still reach the original output target.
 const baselineMaterial=mesh.material; const baselineEnv=baselineMaterial.envMap;
 effects.settings.modelReflections=true;
 renderer.render=(s,c)=>{if(c.parent===effects.cubeCamera)throw Error('cube capture fault');return render(s,c);};
 effects.UpdateDynamicReflection();
 if(renderer.getRenderTarget()!==target||effects.lastReflectionError!=='cube capture fault'||effects.reflectionState.size!==0||baselineMaterial.envMap!==baselineEnv)throw Error('failed cube capture corrupted output');
 renderer.render=render;const recovered=pixels();if(center(recovered)<20)throw Error('model missing after cube capture failure');
 effects.Set('modelReflections',false);pixels();
 effects.Set('modelReflections',true);pixels();if(effects.lastReflectionError!==null)throw Error('cube capture did not recover');
 effects.Set('modelReflections',false);
 const decode=async blob=>{const image=await createImageBitmap(blob);const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);const data=context.getImageData(0,0,image.width,image.height).data;image.close();return data;};
 const job={size:{width:317,height:211},camera:{eye:[4,4,6],center:[0,0.8,0],up:[0,1,0],fov:45,projectionMode:1},alpha:false};
 const tiled=await decode(await RenderPNG({viewer},job,{tileSize:64}));const single=await decode(await RenderPNG({viewer},job,{tileSize:512}));let tiledDifferences=0;for(let i=0;i<tiled.length;i+=4){if(Math.max(...[0,1,2,3].map(c=>Math.abs(tiled[i+c]-single[i+c])))>4)tiledDifferences++;}if(tiledDifferences>317*211*0.005)throw Error('floor shadow tiles disagree: '+tiledDifferences);
 effects.Dispose();target.dispose();renderer.dispose();return {fill,cases,failureRestored:true,reflectionFailureRestored:true,tiledDifferences};
};`, resolveDir : process.cwd () }, bundle : true, outfile : 'work/lighting-isolation.js' });
await writeFile ('work/lighting-isolation.html', '<script src="/work/lighting-isolation.js"></script>');
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage (); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.setContent ('<title>Lighting isolation regression</title>'); await page.addScriptTag ({ path : 'work/lighting-isolation.js' }); const result = await page.evaluate (() => window.checkLighting ());
    assert.deepEqual (errors, []); console.log ('Metallic fill, unchanged model pixels, visible floor shadows and capture-failure restoration:', result);
} finally { await browser.close (); }
