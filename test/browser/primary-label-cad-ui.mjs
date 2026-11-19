import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// Bundle the real shared CAD modal without requiring a built/deployed website.
const fixture = await build ({ stdin : { sourcefile : 'label-cad-ui-fixture.js', resolveDir : process.cwd (), contents : `
    import { PackagingWorkspace } from './source/website/packagingworkspace.js';
    import { NewPackagingDesign, ValidatePackaging } from './modules/packaging/src/profile.js';
    import { NewLabelCAD, ValidateLabelCAD } from './modules/primary-products/src/labelcad.js';
    const initial = NewPackagingDesign (); initial.name = 'Original box profile';
    const canvas = document.createElement ('canvas'); canvas.width = 320; canvas.height = 180;
    const baseRender = () => {}; const viewer = { onRender : baseRender, SetRenderHandler (handler) { this.onRender = handler; }, Render () { this.onRender?.({}); }, GetCanvas () { return canvas; } };
    const editor = { website : { auth : { user : { id : 'label-ui-owner' } }, preferences : { units : 'metric' }, accountReady : true, viewer }, document : { packaging : initial, objects : [] }, history : { Push () {} }, selected : null, readOnly : false, busy : false, Status (message) { this.status = message; }, Undo () {}, Redo () {}, Download () {}, library : { SaveDialog () {} } };
    const workspace = new PackagingWorkspace (editor); editor.packaging = workspace;
    let cad = NewLabelCAD (40, 30); cad.paths.push ({ ...cad.paths[0], id : 'label-paper', type : 'artwork', fill : '#ffffff', stroke : 'none', strokeWidth : 0 });
    const counts = { change : 0, apply : 0 };
    const adapter = title => ({ title, description : 'Editable label cut and artwork layers.', status : 'Label CAD fixture', design : () => ValidatePackaging ({ version : 1, name : title, grade : 'Label stock', thickness : .1, paths : cad.paths }), change : profile => { cad = ValidateLabelCAD ({ ...cad, paths : profile.paths }); counts.change++; return { updated : true }; }, apply : async () => { counts.apply++; return { applied : true }; } });
    window.fixture = { editor, workspace, counts, baseRender, current : () => structuredClone (cad), original : JSON.stringify (initial), open : title => workspace.OpenExternal (adapter (title)) };
` }, bundle : true, format : 'esm', platform : 'browser', write : false, loader : { '.svg' : 'dataurl', '.woff' : 'dataurl', '.ttf' : 'dataurl' }, logLevel : 'silent' });
const css = await readFile ('source/website/css/packaging.css', 'utf8');
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1300, height : 950 } }), errors = [], modules = [];
    page.on ('pageerror', error => errors.push (error.message));
    await page.route ('https://label-ui.test/**', async route => {
        const name = new URL (route.request ().url ()).pathname;
        if (name === '/') { return route.fulfill ({ contentType : 'text/html', body : '<!doctype html><style>:root{--ov_background_color:#fff;--ov_foreground_color:#123740;--ov_border_color:#aaa}[hidden]{display:none!important}.workspace_dialog_header{display:flex;justify-content:space-between;align-items:center}body{margin:0}</style><link rel="stylesheet" href="/packaging.css"><script type="module" src="/fixture.js"></script>' }); }
        if (name === '/fixture.js') { return route.fulfill ({ contentType : 'text/javascript', body : fixture.outputFiles[0].text }); }
        if (name === '/packaging.css') { return route.fulfill ({ contentType : 'text/css', body : css }); }
        if (name.startsWith ('/packaging/')) { modules.push (name); return route.fulfill ({ contentType : name.endsWith ('.css') ? 'text/css' : 'text/javascript', body : name.endsWith ('.css') ? '' : 'export const PackagingAPIVersion=1;export class EngineeringPanel { Refresh(){} }' }); }
        return route.fulfill ({ status : 404, body : 'Unexpected fixture request' });
    });
    await page.goto ('https://label-ui.test/'); await page.waitForFunction (() => window.fixture);
    await page.evaluate (() => fixture.open ('Label CAD · front'));
    const dialog = page.getByRole ('dialog', { name : 'Label CAD · front', exact : true });
    await dialog.getByRole ('heading', { name : 'Label CAD · front', exact : true }).waitFor ();
    assert.deepEqual (await dialog.getByRole ('combobox', { name : 'Line type', exact : true }).locator ('option').evaluateAll (options => options.map (option => option.value)), ['cut', 'artwork']);
    assert.equal (await dialog.getByRole ('button', { name : 'Measurement layer', exact : true }).isVisible (), false);
    assert.equal (await dialog.getByRole ('button', { name : 'Crease and perforation settings', exact : true }).isVisible (), false);
    assert.equal (await dialog.getByRole ('spinbutton', { name : 'Board thickness', exact : true }).isVisible (), false);
    assert.equal (await dialog.getByRole ('combobox', { name : 'CAD apply mode', exact : true }).isVisible (), false);
    assert.equal (await dialog.getByRole ('button', { name : 'Extrude board into scene', exact : true }).count (), 0);
    assert.equal (await dialog.getByRole ('button', { name : 'Save profile and session…', exact : true }).count (), 0);
    assert.deepEqual (modules, [], 'External label CAD must not load the packaging generation module.');
    await dialog.getByRole ('combobox', { name : 'Selected path', exact : true }).selectOption ('label-paper');
    await dialog.getByLabel ('Artwork fill color', { exact : true }).evaluate (input => { input.value = '#aa2255'; });
    await dialog.getByRole ('button', { name : 'Set artwork fill', exact : true }).click ();
    await page.waitForFunction (() => fixture.current ().paths[1].fill === '#aa2255');
    await dialog.getByText ('Edit selected path points', { exact : true }).click ();
    const point = dialog.getByRole ('spinbutton', { name : 'Path point 1 X', exact : true }); await point.fill ('-19'); await point.press ('Tab');
    await page.waitForFunction (() => fixture.current ().paths[1].points[0][0] === -19);
    assert.equal (await page.evaluate (() => fixture.counts.change), 2);
    await dialog.getByRole ('button', { name : 'Apply to 3D', exact : true }).click (); await page.waitForFunction (() => fixture.counts.apply === 1);
    assert.equal (await page.evaluate (() => JSON.stringify (fixture.editor.document.packaging) === fixture.original), true, 'Editing label CAD must preserve the unrelated board profile.');
    await dialog.getByRole ('button', { name : 'Close Label CAD · front', exact : true }).click ();
    await page.waitForFunction (() => !fixture.workspace.dialog && fixture.workspace.externalProfile === null);
    assert.equal (await page.evaluate (() => fixture.editor.website.viewer.onRender === fixture.baseRender), true);
    assert.equal (await page.evaluate (() => JSON.stringify (fixture.workspace.Design ()) === fixture.original), true);

    // Open another target while the first modal is still fading out.
    await page.evaluate (() => { fixture.open ('Label CAD · old'); fixture.open ('Label CAD · current'); });
    await page.getByRole ('dialog', { name : 'Label CAD · old', exact : true }).waitFor ({ state : 'detached' });
    const current = page.getByRole ('dialog', { name : 'Label CAD · current', exact : true });
    assert.equal (await current.isVisible (), true);
    assert.equal (await page.evaluate (() => fixture.workspace.externalProfile.title), 'Label CAD · current');
    await current.getByRole ('button', { name : 'Apply to 3D', exact : true }).click (); await page.waitForFunction (() => fixture.counts.apply === 2);
    await current.getByRole ('button', { name : 'Close Label CAD · current', exact : true }).click (); await page.waitForFunction (() => !fixture.workspace.dialog);
    assert.equal (await page.evaluate (() => fixture.editor.website.viewer.onRender === fixture.baseRender), true, 'Replacing a fading modal must restore the original viewer callback after final close.');
    assert.deepEqual (modules, []);
    await page.evaluate (() => fixture.workspace.Open ()); const packaging = page.getByRole ('dialog', { name : 'Packaging', exact : true });
    assert.equal (await packaging.getByRole ('button', { name : 'Measurement layer', exact : true }).isVisible (), true);
    assert.equal (await packaging.getByRole ('combobox', { name : 'Line type', exact : true }).locator ('option[value="score"]').count (), 1);
    assert.equal (await packaging.getByRole ('button', { name : 'Extrude board into scene', exact : true }).isVisible (), true);
    await packaging.getByRole ('button', { name : 'Close Packaging', exact : true }).click (); await page.waitForFunction (() => !fixture.workspace.dialog);
    assert.deepEqual (errors, []);
    console.log ('Shared Packaging CAD label modal, controls, dispatch and lifecycle: pass');
} finally { await browser.close (); }
