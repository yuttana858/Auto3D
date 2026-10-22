import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { SceneDocument } from '../../source/website/scenedocument.js';
import { Model } from '../../source/engine/model/model.js';
import { Node } from '../../source/engine/model/node.js';
import { PhysicalMaterial } from '../../source/engine/model/material.js';
import { GenerateCuboid, GeneratorParams } from '../../source/engine/model/generator.js';
import { FinalizeModel } from '../../source/engine/model/modelfinalization.js';
import { PackSession, CreateSessionArchive } from '../../source/website/sessionarchive.js';
const model = new Model (); model.AddMaterial (new PhysicalMaterial ()); model.AddMesh (GenerateCuboid (new GeneratorParams ().SetMaterial (0), 1, 2, 1)); const node = new Node (); node.AddMeshIndex (0); model.root.AddChildNode (node); FinalizeModel (model, {});
const saved = new SceneDocument (); saved.AddImported (model, 'Presentation fixture');
const token = '33333333-3333-4333-8333-333333333333';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
 for (const hdri of [false, true]) {
  const page = await browser.newPage ({ viewport : { width : 390, height : 844 } }); const errors = []; page.on ('pageerror', e => errors.push (e.message));
  const view = { cameraState : { eye : [6, 4, 8], center : [0.5, 1, 0.5], up : [0, 1, 0], fov : 55, projectionMode : 1 }, horizonGradient : true, backgroundPreset : 'sunset', presentationBackground : { colors : ['#30284d', '#ad697e', '#f6b779', '#9d6c64', '#302b37'], dark : true, color : { r : 48, g : 40, b : 77, a : 255 } }, lighting : { mode : hdri ? 'hdri' : 'default', environment : 'studio_small_09', brightness : 1.2, rotation : 35, elevation : 10, background : true, effects : { shadows : true, ambientIntensity : 0.2, floorReflection : true } } };
  const archive = Buffer.from (CreateSessionArchive (PackSession (saved, view)));
  await page.route ('**/mini.html?*', async r => r.fulfill ({ body : await readFile ('website/mini.html', 'utf8'), contentType : 'text/html' }));
  await page.route ('**/o3dv/o3dv.mini.js', r => r.fulfill ({ path : 'build/website/o3dv.mini.js', contentType : 'text/javascript' }));
  await page.route ('**/assets/**', r => r.fulfill ({ path : 'website' + new URL (r.request ().url ()).pathname }));
  await page.route ('**/api/audience/' + token, r => r.fulfill ({ json : { name : 'Presentation fixture', codeRequired : true, allowDownload : false } }));
  await page.route ('**/api/audience/' + token + '/archive', r => r.fulfill ({ body : archive, contentType : 'application/octet-stream' }));
  await page.goto ('http://127.0.0.1:8080/mini.html?share=' + token);
  await page.locator ('#code').fill ('1234'); await page.getByRole ('button', { name : 'Unlock model' }).click ();
  await page.locator ('#resetView').waitFor ({ state : 'visible' }); await page.locator ('#code').waitFor ({ state : 'detached' });
  const canvas = page.locator ('#stage canvas');
  const initial = await canvas.screenshot ();
  const rect = await canvas.boundingBox ();
  await page.mouse.move (rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.keyboard.down ('Space'); await page.mouse.down (); await page.mouse.move (rect.x + rect.width / 2 + 40, rect.y + rect.height / 2 + 25, { steps : 5 }); await page.mouse.up (); await page.keyboard.up ('Space');
  assert.equal (initial.equals (await canvas.screenshot ()), false, 'Space left drag must pan');
  await page.locator ('#resetView').click ();
  assert.equal (initial.equals (await canvas.screenshot ()), true);

  await page.locator ('#fit').click (); await page.waitForTimeout (1200);
  assert.equal (initial.equals (await canvas.screenshot ()), false, 'Fit must change the saved composition');
  await page.locator ('#resetView').click ();
  assert.equal (initial.equals (await canvas.screenshot ()), true, 'Reset must reproduce the original saved view');
  await page.setViewportSize ({ width : 600, height : 900 }); await page.locator ('#resetView').click ();
  assert.deepEqual (errors, []); await page.close ();
 }
 console.log ('Mobile saved camera reset, default/HDRI backgrounds, shadows/reflections and resize pass.');
} finally { await browser.close (); }
