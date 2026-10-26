import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { CreateFefcoBox } from '../../modules/packaging/src/index.js';
import { PackagingModel } from '../../source/website/packagingadapter.js';
import { SceneDocument } from '../../source/website/scenedocument.js';
import { PackSession, CreateSessionArchive } from '../../source/website/sessionarchive.js';
const parameters = { code : '0201', length : 100, width : 80, height : 60, thickness : 3, closure : 'closed' };
function Archive (legacy) {
const data = CreateFefcoBox (parameters);
// Reproduce the older saved crease layout: edge / inner / closed, no outer slot.
if (legacy) { for (const mesh of data.visualMeshes) { for (const triangle of mesh.triangles) { if (triangle.material === 0) { triangle.material = 3; } if (mesh.name.includes ('top-')) { for (const key of ['vertices', 'normals', 'uvs']) { [triangle[key][1], triangle[key][2]] = [triangle[key][2], triangle[key][1]]; } } } } }
const document = new SceneDocument (); const object = document.AddImported (PackagingModel (data), 'Saved RSC compatibility fixture'); object.packagingProfile = data.profile; object.userData._auto3dFefco = JSON.stringify (data.parameters); object.userData._auto3dPackagingState = 'folded';
return Buffer.from (CreateSessionArchive (PackSession (document, { backgroundPreset : 'dark', horizonGradient : true, cameraState : { eye : [-90, 100, -110], center : [-40, 60, -50], up : [0, 1, 0], fov : 35, projectionMode : 1 } })));
}
const archives = [Archive (true), Archive (false)];
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const [index, archive] of archives.entries ()) {
    const page = await browser.newPage ({ viewport : { width : 1200, height : 900 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', e => { errors.push (e.message); console.log ('Page error', e.message); }); page.on ('console', m => { if (m.type () === 'error') { console.log ('Console error', m.text ()); } });
    await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'rsc-test', email : 'fixture@example.com' } } }));
    await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, viewportQuality : 'fast' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    await page.locator ('#open_file').setInputFiles ({ name : 'saved-rsc.auto3d', mimeType : 'application/octet-stream', buffer : archive });
    await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Opened '), null, { timeout : 30000 }).catch (async error => { console.log ('Scene status', await page.locator ('.scene_status').allTextContents ()); throw error; });
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    await mkdir ('work/rsc-fix', { recursive : true });
    const image = await call ('capture.image', { scope : 'viewport', maxSize : 1000 }); await writeFile (index === 0 ? 'work/rsc-fix/saved-rsc-after.png' : 'work/rsc-fix/new-rsc-after.png', Buffer.from (image.content[0].data, 'base64'));
    const before = await call ('packaging.measurements.inspect');
    await call ('packaging.appearance.update', { panelBow : .3 }); await call ('history.undo');
    const after = await call ('packaging.measurements.inspect'); assert.deepEqual (after.dimensions, before.dimensions);
    const diagnostics = await call ('lighting.shadow.inspect'); assert.equal (diagnostics.contextLost, false); assert.deepEqual (diagnostics.shaderErrors, []); assert.deepEqual (errors, []);
    console.log (index === 0 ? 'Legacy closed RSC passes' : 'Fresh closed RSC passes');
    await page.close ();
  }
} finally { await browser.close (); }
