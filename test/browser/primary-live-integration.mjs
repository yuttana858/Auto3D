import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { OpenSessionArchive } from '../../source/website/sessionarchive.js';
import { MockMacroApi } from './macro-api-mock.mjs';

// Exercise the integrated app: module inputs, actual renderer, shared CAD dialog and portable archive.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
let page;
try {
    page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); page.setDefaultTimeout (120000);
    const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'primary-live-fixture', email : 'fixture@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    await MockMacroApi (page, { user : 'primary-live-fixture' });
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html');
    await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => {
        const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args });
        assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result;
    };
    // Explicitly await asynchronous inspection; waitForFunction treats a Promise as truthy before it resolves.
    const until = async (description, predicate) => {
        const deadline = Date.now () + 120000; let last;
        for (;;) {
            try { last = await predicate (); if (last) { return last; } }
            catch (error) { if (!error.message.includes ('viewer is busy')) { throw error; } }
            assert.ok (Date.now () < deadline, 'Timed out: ' + description + ' (' + JSON.stringify (last) + ')'); await page.waitForTimeout (80);
        }
    };
    const near = (actual, expected, message, tolerance = 1e-3) => assert.ok (Math.abs (actual - expected) <= tolerance, message + ': ' + actual + ' vs ' + expected);
    const setColor = (input, color) => input.evaluate ((node, value) => { node.value = value; node.dispatchEvent (new Event ('input', { bubbles : true })); }, color);

    // Observe only the existing main viewer, preserving its rendering method and restoring it in finally.
    await page.evaluate (() => {
        const prototype = OV.Engine.Viewer.prototype, original = prototype.SetMainObject;
        const probe = window.primaryLiveProbe = { root : null, viewer : null, renders : 0, restore : () => { prototype.SetMainObject = original; } };
        prototype.SetMainObject = function (...args) {
            const result = original.apply (this, args);
            if (this.renderer?.domElement === document.querySelector ('#main_viewer canvas')) { probe.root = args[0]; probe.viewer = this; probe.renders++; }
            return result;
        };
        probe.snapshot = () => {
            const meshes = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
            probe.root?.traverse (mesh => {
                const position = mesh.geometry?.attributes?.position; if (!mesh.isMesh || !position) { return; }
                const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity], axisY = new Set (); let hash = 2166136261;
                const raw = new Uint32Array (position.array.buffer, position.array.byteOffset, position.array.length);
                for (const value of raw) { hash = Math.imul (hash ^ value, 16777619) >>> 0; }
                for (let i = 0; i < position.count; i++) {
                    const local = mesh.position.clone ().fromBufferAttribute (position, i);
                    if (Math.hypot (local.x, local.z) < 1e-4) { axisY.add (Math.round (local.y * 10000) / 10000); }
                    const world = mesh.localToWorld (local).toArray ();
                    for (let j = 0; j < 3; j++) { low[j] = Math.min (low[j], world[j]); high[j] = Math.max (high[j], world[j]); min[j] = Math.min (min[j], world[j]); max[j] = Math.max (max[j], world[j]); }
                }
                const materials = (Array.isArray (mesh.material) ? mesh.material : [mesh.material]).map (material => {
                    let pixels = null; const image = material.map?.image;
                    if (image && (image.naturalWidth || image.width) && (image.complete === undefined || image.complete)) {
                        const canvas = document.createElement ('canvas'); canvas.width = 32; canvas.height = 32;
                        const context = canvas.getContext ('2d'); context.drawImage (image, 0, 0, 32, 32);
                        pixels = { center : [...context.getImageData (16, 16, 1, 1).data], corner : [...context.getImageData (0, 0, 1, 1).data] };
                    }
                    return { name : material.name, type : material.type, color : material.color?.getHexString (), attenuationColor : material.attenuationColor?.getHexString (), transmission : material.transmission, ior : material.ior, thickness : material.thickness, metalness : material.metalness, roughness : material.roughness, pixels };
                });
                meshes.push ({ name : mesh.name, materialIndices : [...(mesh.userData.originalMaterials || [])], min : low, max : high, vertices : position.count, hash, axisY : [...axisY].sort ((a, b) => a - b), materials });
            });
            const projected = [];
            if (probe.viewer && meshes.length) { for (const x of [min[0], max[0]]) { for (const y of [min[1], max[1]]) { for (const z of [min[2], max[2]]) { projected.push (probe.root.position.clone ().set (x, y, z).project (probe.viewer.camera).toArray ()); } } } }
            const pivot = probe.viewer?.navigation?.orbitCenter;
            return { meshes, min, max, projected, renders : probe.renders, pivot : pivot ? [pivot.x, pivot.y, pivot.z] : null };
        };
    });
    const rendered = () => page.evaluate (() => window.primaryLiveProbe.snapshot ());
    const fitVisible = async description => until (description, async () => {
        const state = await rendered (); return state.projected.length === 8 && state.projected.every (point => Math.abs (point[0]) <= 1.01 && Math.abs (point[1]) <= 1.01 && point[2] > -1 && point[2] < 1);
    });
    await mkdir ('work/primary-live-integration', { recursive : true });
    await call ('ui.primary_products'); assert.equal ((await call ('primary.inspect')).material, 'glass');
    const created = await call ('primary.generate'), objectId = created.objectId;
    const definition = async () => {
        const scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 1, 'live edits must never create another object');
        assert.equal (scene.selectedObjectId, objectId); assert.equal (scene.objects[0].id, objectId);
        return JSON.parse (scene.objects[0].userData._auto3dPrimaryProduct);
    };
    const changed = (description, predicate) => until (description, async () => { const value = await definition (); return predicate (value) && !(await call ('primary.inspect')).liveUpdating ? value : false; });
    const right = page.locator ('.pp_workspace').filter ({ has : page.getByRole ('spinbutton', { name : 'Product height', exact : true }) }).first ();
    const height = right.getByRole ('spinbutton', { name : 'Product height', exact : true });
    assert.equal ((await definition ()).draft.material, 'glass');
    let view = await rendered (), body = view.meshes.find (mesh => mesh.name === 'body');
    assert.ok (body.materials.some (material => material.transmission > .9 && material.ior >= 1.45));
    assert.ok (body.axisY.includes (4), 'default glass has a modeled inner base above the outer base');
    assert.ok (view.meshes.find (mesh => mesh.name === 'cap').axisY.length >= 2, 'cap has separate inner and outer top surfaces');
    await fitVisible ('new product automatically fits the visible viewport');

    // User typing commits after the debounce, without Enter, Apply or Generate.
    await height.fill ('220'); await changed ('right-panel height updates the object', value => value.draft.heightMm === 220);
    near ((await rendered ()).max[1] - (await rendered ()).min[1], 220, 'rendered height');
    const valid = await definition (), validGeometry = (await rendered ()).meshes.find (mesh => mesh.name === 'body').hash;
    await height.fill ('2'); await until ('invalid draft is marked', async () => await height.getAttribute ('aria-invalid') === 'true');
    assert.equal (await height.inputValue (), '2'); assert.deepEqual (await definition (), valid); assert.equal ((await rendered ()).meshes.find (mesh => mesh.name === 'body').hash, validGeometry);
    await height.fill ('220'); await height.press ('Enter');

    const canvas = page.locator ('#main_viewer canvas'), canvasBox = await canvas.boundingBox ();
    await page.mouse.move (canvasBox.x + canvasBox.width * .55, canvasBox.y + canvasBox.height * .45); await page.mouse.down ({ button : 'right' });
    await page.mouse.move (canvasBox.x + canvasBox.width * .55 + 95, canvasBox.y + canvasBox.height * .45 + 25, { steps : 10 }); await page.mouse.up ({ button : 'right' });
    const cameraBefore = await call ('camera.current.inspect'), pivotBefore = (await rendered ()).pivot;
    // Dispatch a burst through the actual input handlers while the first asynchronous rebuild is in flight.
    await height.evaluate (input => { for (const value of ['230', '240', '245']) { input.value = value; input.dispatchEvent (new Event ('input', { bubbles : true })); input.dispatchEvent (new KeyboardEvent ('keydown', { key : 'Enter', bubbles : true })); } });
    await changed ('last queued valid height wins', value => value.draft.heightMm === 245);
    assert.deepEqual (await call ('camera.current.inspect'), cameraBefore); assert.deepEqual ((await rendered ()).pivot, pivotBefore);
    await call ('history.undo'); assert.equal ((await definition ()).draft.heightMm, 220, 'one Undo restores the whole rapid-edit burst');
    assert.deepEqual (await call ('camera.current.inspect'), cameraBefore); assert.deepEqual ((await rendered ()).pivot, pivotBefore);
    await call ('history.redo'); assert.equal ((await definition ()).draft.heightMm, 245);
    console.log ('Live dimensions, invalid drafts, queued edits, one Undo and camera/pivot preservation passed.');

    for (const [preset, wall, base] of [['lightweight', 1.2, 2.4], ['standard', 2, 4], ['heavy', 3, 6]]) {
        await right.getByRole ('combobox', { name : 'Glass thickness', exact : true }).selectOption (preset);
        await changed ('glass ' + preset, value => value.draft.details.glassPreset === preset);
        body = (await rendered ()).meshes.find (mesh => mesh.name === 'body');
        assert.ok (body.axisY.includes (base), 'glass preset changes the actual inner base');
        assert.ok (body.axisY.every (y => y <= base + .001), 'glass shell has no disk across its open mouth');
        assert.ok (body.materials.some (material => Math.abs (material.thickness - wall) < .001), 'glass shader follows actual wall thickness');
    }
    await right.getByRole ('combobox', { name : 'Product material', exact : true }).selectOption ('amberGlass');
    await changed ('material dropdown updates selected bottle', value => value.draft.material === 'amberGlass');
    await setColor (right.getByLabel ('Product surface color', { exact : true }), '#b98742');
    await changed ('surface color updates selected bottle', value => value.draft.color === '#b98742');
    const bodyIndices = (await rendered ()).meshes.find (mesh => mesh.name === 'body').materialIndices;
    const engineBody = (await call ('material.list')).find (material => bodyIndices.includes (material.index));
    assert.ok (engineBody.transmission > .9); assert.deepEqual (engineBody.color, { r : 185, g : 135, b : 66 });
    const capHeight = right.getByRole ('spinbutton', { name : 'Cap height', exact : true });
    await capHeight.fill ('28'); await changed ('cap height', value => value.draft.bottleShape?.capHeightMm === 28);
    await right.getByRole ('spinbutton', { name : 'Cap thickness', exact : true }).fill ('1.4'); await changed ('cap wall', value => value.draft.details.capWallMm === 1.4);
    await right.getByRole ('combobox', { name : 'Cap material', exact : true }).selectOption ('aluminum'); await changed ('cap metal', value => value.draft.details.capMaterial === 'aluminum');
    await setColor (right.getByLabel ('Cap color', { exact : true }), '#226688'); await changed ('cap color', value => value.draft.details.capColor === '#226688');
    const cap = (await rendered ()).meshes.find (mesh => mesh.name === 'cap');
    near (cap.max[1] - cap.min[1], 28, 'actual cap height'); near (cap.axisY.at (-1) - cap.axisY[0], 1.4, 'actual cap roof thickness');
    assert.ok (cap.materials.some (material => material.metalness === 1));
    assert.deepEqual ((await call ('material.list')).find (material => cap.materialIndices.includes (material.index)).color, { r : 34, g : 102, b : 136 });
    console.log ('Glass presets, modeled bases/walls, live surface controls and actual cap construction/material passed.');

    await right.getByRole ('button', { name : 'Fit model', exact : true }).click (); await fitVisible ('explicit Fit in full viewer');
    await right.getByRole ('button', { name : 'Edit model', exact : true }).click ();
    const profile = page.getByRole ('region', { name : 'Live product profile', exact : true }); await profile.waitFor ();
    const leftBox = await profile.boundingBox (), splitBox = await canvas.boundingBox (); assert.ok (splitBox.x >= leftBox.x + leftBox.width - 2);
    await profile.getByRole ('button', { name : 'Fit model', exact : true }).click (); await fitVisible ('explicit Fit in split viewer');
    await page.screenshot ({ path : 'work/primary-live-integration/glass-cap-split.png', timeout : 120000 });
    await profile.getByRole ('button', { name : 'Close model editor', exact : true }).click (); await profile.waitFor ({ state : 'detached' });

    const cadProfiles = new Map ();
    for (const zone of ['front', 'cap-top']) {
        await right.getByRole ('button', { name : zone === 'front' ? 'Design front label in CAD' : 'Design cap top in CAD', exact : true }).click ();
        const dialog = page.getByRole ('dialog', { name : 'Label CAD · ' + zone, exact : true }); await dialog.waitFor ();
        assert.equal (await dialog.locator ('.packaging_canvas').count (), 1, 'uses the actual shared Packaging CAD editor');
        const opened = await call ('primary.label.cad.inspect'); assert.equal (opened.zone, zone); assert.equal (opened.objectId, objectId);
        await call ('packaging.path.select', { id : 'label-paper' });
        await setColor (dialog.getByLabel ('Artwork fill color', { exact : true }), '#19a7c3'); await dialog.getByRole ('button', { name : 'Set artwork fill', exact : true }).click ();
        const oldIds = new Set ((await call ('packaging.inspect')).paths.map (path => path.id));
        await call ('packaging.path.add', { type : 'artwork', closed : true, units : 'mm', points : [[-4, -3], [4, -3], [4, 3], [-4, 3]] });
        const path = (await call ('packaging.inspect')).paths.find (path => !oldIds.has (path.id)); assert.ok (path);
        await call ('packaging.path.edit', { id : path.id, units : 'mm', points : [[-5, -3], [5, -3], [5, 3], [-5, 3]] });
        await call ('packaging.path.select', { id : path.id }); await call ('packaging.artwork.style', { fill : '#f7bc32', stroke : 'none', strokeWidth : 0 });
        cadProfiles.set (zone, (await call ('primary.label.cad.inspect')).profile);
        const renderCount = (await rendered ()).renders;
        await dialog.getByRole ('button', { name : 'Apply to 3D', exact : true }).click ();
        await changed ('CAD ' + zone + ' applied to selected product', value => (value.artwork || []).some (art => art.zone === zone && art.cad?.paths.length === 3));
        assert.equal ((await rendered ()).renders, renderCount + 1, 'one CAD Apply performs one model rebuild');
        const label = await until ('actual ' + zone + ' label texture', async () => (await rendered ()).meshes.find (mesh => mesh.name === 'label-' + zone && mesh.materials.some (material => material.pixels)));
        assert.deepEqual (label.materials.find (material => material.pixels).pixels.center, [247, 188, 50, 255]);
        if (zone === 'cap-top') { near (label.max[1] - label.min[1], 0, 'cap-top artwork is a planar disc'); assert.ok (label.min[1] > cap.max[1], 'cap artwork sits above the physical cap'); assert.equal (label.materials.find (material => material.pixels).pixels.corner[3], 0, 'circular cut clips corner pixels'); }
        if (zone === 'cap-top') { await page.screenshot ({ path : 'work/primary-live-integration/cap-top-cad.png', timeout : 120000 }); }
        await dialog.getByRole ('button', { name : 'Close Label CAD · ' + zone, exact : true }).click (); await dialog.waitFor ({ state : 'detached' });
        await call ('history.undo'); assert.equal (((await definition ()).artwork || []).some (art => art.zone === zone), false, 'one Undo removes this CAD application');
        assert.equal ((await rendered ()).meshes.some (mesh => mesh.name === 'label-' + zone), false);
        await call ('history.redo'); assert.deepEqual ((await definition ()).artwork.find (art => art.zone === zone).cad, cadProfiles.get (zone));
    }
    await call ('view.background', { preset : 'light' }); await call ('primary.fit'); await fitVisible ('labeled glass bottle fit');
    await page.screenshot ({ path : 'work/primary-live-integration/glass-body-and-cap-labels.png', timeout : 120000 });
    console.log ('Front and cap CAD paths/style, shared modal Apply, rendered textures and single Undo/Redo passed.');

    await page.evaluate (() => { window.showSaveFilePicker = undefined; }); await call ('ui.save');
    await page.getByLabel ('Save name', { exact : true }).fill ('Primary live CAD'); const download = page.waitForEvent ('download');
    await page.getByRole ('button', { name : 'Save session file', exact : true }).click (); const archiveBytes = await readFile (await (await download).path ());
    await writeFile ('work/primary-live-integration/primary-live.auto3d', archiveBytes);
    const archive = OpenSessionArchive (archiveBytes); assert.equal (archive.document.objects.length, 1);
    const savedDefinition = JSON.parse (archive.document.objects[0].userData._auto3dPrimaryProduct);
    for (const [zone, cad] of cadProfiles) { assert.deepEqual (savedDefinition.artwork.find (art => art.zone === zone).cad, cad); }
    await page.getByRole ('button', { name : 'Close Save session', exact : true }).click ();
    await page.locator ('#open_file').setInputFiles ({ name : 'Primary live.auto3d', mimeType : 'application/octet-stream', buffer : archiveBytes });
    await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Opened '));
    await changed ('portable archive reopened', value => value.artwork.length === 2 && value.draft.details.capColor === '#226688');
    for (const zone of ['front', 'cap-top']) { assert.ok ((await rendered ()).meshes.some (mesh => mesh.name === 'label-' + zone)); }
    await call ('primary.label.cad.open', { zone : 'cap-top' });
    const restoredCAD = await call ('primary.label.cad.inspect'); assert.deepEqual (restoredCAD.profile, cadProfiles.get ('cap-top')); assert.equal (restoredCAD.conversion.kind, 'saved-cad');
    await page.getByRole ('button', { name : 'Close Label CAD · cap-top', exact : true }).click ();
    await call ('primary.fit'); await fitVisible ('restored product fit'); await page.screenshot ({ path : 'work/primary-live-integration/restored-labels.png', timeout : 120000 });
    assert.deepEqual (errors, []); console.log ('Actual-app Primary Products live editing, glass/caps, camera fit, vector CAD labels and archive round trip passed.');
} catch (error) {
    if (page && !page.isClosed ()) {
        await writeFile ('work/primary-live-integration/failure.txt', error.stack + '\n' + await page.locator ('body').innerText ()).catch (() => {});
        await page.screenshot ({ path : 'work/primary-live-integration/failure.png', timeout : 30000 }).catch (() => {});
    }
    throw error;
} finally {
    if (page && !page.isClosed ()) { await page.evaluate (() => { window.primaryLiveProbe?.restore (); delete window.primaryLiveProbe; }).catch (() => {}); }
    await browser.close ();
}
