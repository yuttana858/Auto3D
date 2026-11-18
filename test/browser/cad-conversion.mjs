import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

// Public synthetic box generated/reimported by Cloud 3D Studio 0.5.0; no customer CAD.
const glb = Buffer.from ((await readFile ('test/testfiles/cad-conversion-box.glb.b64', 'utf8')).trim (), 'base64');
const appearance = { schemaVersion : 1, sourceFormat : 'step', colors : { detected : 2, glb : 'preserved', step : 'preserved' }, transparency : { detected : 1, glb : 'preserved', step : 'preserved' }, materials : { detected : 0, glb : 'not_present', step : 'not_present' }, imageTextures : { detected : null, status : 'not_exposed_by_reader' }, stl : 'geometry_only', validation : 'passed' };
const diagnosticReport = { schemaVersion : 1, versions : { worker : '0.4.0', reader : '0.3.17', occt : '7.9.3.1.1' }, outcome : 'error_detected', phase : 'build_geometry', failureCode : 'invalid_geometry', readerCode : 'occt.construction_failed', exception : 'Standard_ConstructionError', frames : ['conversion:292'], checks : { sourceRead : 'passed', geometryBuild : 'failed', geometryValidation : 'not_run', stepExport : 'not_run', stepReimport : 'not_run' } };
const root = process.cwd (), types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.png' : 'image/png', '.svg' : 'image/svg+xml', '.woff' : 'font/woff', '.ttf' : 'font/ttf' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage ({ viewport : { width, height : 1000 }, reducedMotion : 'reduce', acceptDownloads : true });
        page.setDefaultTimeout (45000);
        const owner = '00000000-0000-4000-8000-000000000001', jobs = new Map (), errors = []; let uploads = 0, downloaded = 0;
        page.on ('pageerror', error => errors.push (error.message));
        await page.route ('https://auto3d.test/**', async route => {
            const request = route.request (), url = new URL (request.url ()), pathname = url.pathname;
            if (pathname.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : owner, email : 'synthetic@example.com' } } }); }
            if (pathname === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
            if (pathname.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false, requests : [] } }); }
            if (pathname.startsWith ('/api/conversions')) {
                assert.equal (request.headers ()['x-auto3d-account'], owner);
                const parts = pathname.slice ('/api/conversions'.length).split ('/').filter (Boolean);
                if (parts[0] === 'capabilities') { return route.fulfill ({ json : { ready : true, version : '0.4.0', diagnosticProtocol : 1 } }); }
                if (!parts.length && request.method () === 'GET') { return route.fulfill ({ json : { jobs : [...jobs.values ()] } }); }
                if (!parts.length) {
                    const body = request.postDataJSON (); assert.equal (body.sourceUnit, 'mm'); assert.equal (body.extension, 'x_t'); assert.ok (body.origin.windowId && body.origin.tabId);
                    const job = { id : randomUUID (), revision : 1, state : 'awaiting_upload', stage : 'awaiting_upload', source : { name : body.sourceName, bytes : body.sourceBytes, sha256 : body.sourceSha256, extension : body.extension, unit : body.sourceUnit }, origin : body.origin, artifacts : {}, summary : null, createdAt : new Date ().toISOString (), updatedAt : new Date ().toISOString () };
                    jobs.set (job.id, job); return route.fulfill ({ status : 201, json : { job } });
                }
                const job = jobs.get (parts[0]); assert.ok (job);
                if (parts[1] === 'source') { uploads++; assert.equal (createHash ('sha256').update (request.postDataBuffer ()).digest ('hex'), job.source.sha256); return route.fulfill ({ json : { uploaded : true } }); }
                if (parts[1] === 'submit') {
                    assert.equal (uploads, 1); job.state = 'queued'; job.stage = 'queued'; job.revision++;
                    Object.assign (job, { state : 'running', stage : 'converting', progress : { phase : 'read_source', completed : null, total : null, unit : null } });
                    return route.fulfill ({ json : { job } });
                }
                if (parts[1] === 'artifacts') { downloaded++; return route.fulfill ({ body : glb, contentType : 'model/gltf-binary', headers : { 'Content-Length' : String (glb.length) } }); }
                if (parts[1] === 'diagnose') {
                    assert.equal (request.postDataJSON ().revision, job.revision);
                    Object.assign (job, { state : 'running', stage : 'converting', purpose : 'diagnostic', progress : { phase : 'read_source', completed : null, total : null, unit : null }, diagnostics : { status : 'running', canRun : false, report : null, errorCode : null } }); job.revision++;
                    return route.fulfill ({ json : { job } });
                }
                if (request.method () === 'DELETE') { jobs.delete (job.id); return route.fulfill ({ json : { deleted : true } }); }
                return route.fulfill ({ json : { job } });
            }
            if (pathname.startsWith ('/api/') || pathname.startsWith ('/mcp/')) { return route.fulfill ({ status : 404, json : {} }); }
            try { const filename = path.resolve (root, '.' + decodeURIComponent (pathname).replace ('/build/website_dev/', '/build/website/')); assert.ok (filename.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (filename), contentType : types[path.extname (filename)] || 'application/octet-stream' }); }
            catch { return route.fulfill ({ status : 404, body : '' }); }
        });
        await page.goto ('https://auto3d.test/website/index.html');
        await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked') && !document.querySelector ('#startup_splash'));
        const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => window.Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
        await page.locator ('#open_file').setInputFiles ([{ name : 'one.x_t', mimeType : 'application/octet-stream', buffer : Buffer.from ('public-one') }, { name : 'two.step', mimeType : 'application/octet-stream', buffer : Buffer.from ('public-two') }]);
        const dialog = page.getByRole ('dialog', { name : 'Convert CAD', exact : true });
        await dialog.getByText ('Multiple source files were selected. Choose one CAD file below; the other selected models have not been imported or uploaded.', { exact : true }).waitFor ();
        assert.equal ((await call ('conversion.inspect')).stagedFile, null); assert.equal (uploads, 0);
        await dialog.getByText ('CAD service ready · STEP/STL in mm · GLB in meters.', { exact : true }).waitFor ();
        await dialog.getByLabel ('Source CAD file · up to 50 MiB', { exact : true }).setInputFiles ({ name : 'public-calibration.x_t', mimeType : 'application/octet-stream', buffer : Buffer.from ('public calibration placeholder') });
        assert.equal (uploads, 0); assert.equal (await dialog.getByRole ('button', { name : 'Convert privately', exact : true }).isDisabled (), true);
        await dialog.getByLabel ('Parasolid coordinate units', { exact : true }).selectOption ('mm');
        await dialog.getByRole ('button', { name : 'Convert privately', exact : true }).click ();
        const phaseBar = dialog.getByRole ('progressbar', { name : 'Reading CAD format', exact : true }); await phaseBar.waitFor ();
        assert.equal (await phaseBar.getAttribute ('aria-valuenow'), null);
        await phaseBar.evaluate (node => { node.dataset.progressIdentity = 'retained'; });
        const active = [...jobs.values ()][0]; Object.assign (active, { progress : { phase : 'build_mesh', completed : 3, total : 12, unit : 'faces' } });
        const measured = dialog.getByRole ('progressbar', { name : 'Building browser mesh', exact : true });
        await page.waitForFunction (() => document.querySelector ('.cad_conversion_job [role="progressbar"]')?.getAttribute ('aria-valuenow') === '25');
        assert.equal (await measured.getAttribute ('data-progress-identity'), 'retained', 'polling must preserve the animated bar');
        assert.ok ((await dialog.innerText ()).includes ('3 / 12 faces'));
        active.progress.completed = 9;
        await page.waitForFunction (() => document.querySelector ('.cad_conversion_job [role="progressbar"]')?.getAttribute ('aria-valuenow') === '75');
        assert.equal (await measured.getAttribute ('data-progress-identity'), 'retained');
        Object.assign (active, { state : 'ready', stage : 'ready', revision : 3, artifacts : { step : { bytes : 100, units : 'mm' }, glb : { bytes : glb.length, units : 'm' }, stl : { bytes : 100, units : 'mm' }, manifest : { bytes : 100, units : null } }, summary : { dimensionsMm : [40, 30, 20], topology : { solids : 1 }, producerVersion : '0.5.0', appearance }, updatedAt : new Date ().toISOString () });
        await dialog.getByRole ('button', { name : 'Add to current session', exact : true }).waitFor ({ timeout : 15000 }).catch (async error => { console.log ({ width, uploads, jobs : [...jobs.values ()], ui : await dialog.innerText (), errors }); throw error; }); assert.equal (uploads, 1);
        assert.equal (await dialog.getByRole ('progressbar', { name : 'Ready · independently validated', exact : true }).getAttribute ('aria-valuenow'), '100');
        assert.equal ((await call ('scene.inspect')).objects.length, 0, 'completed jobs must never import themselves');
        const appearanceResult = await call ('conversion.appearance', { jobId : active.id }); assert.deepEqual (appearanceResult.report, appearance);
        await dialog.getByText ('Appearance report', { exact : true }).click ();
        await dialog.getByText ('Source colors: 2 · GLB preserved · STEP preserved.', { exact : true }).waitFor ();
        await dialog.getByText ('STL contains geometry only; use GLB to retain supported appearance.', { exact : true }).waitFor ();
        await dialog.getByRole ('button', { name : 'Add to current session', exact : true }).click ();
        await dialog.getByText ('Added to the current session. Undo is available.', { exact : true }).waitFor ();
        const scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 1); assert.deepEqual (scene.objects[0].scale, [1, 1, 1]);
        assert.ok (scene.objects[0].userData.cadConversion.includes ('0.5.0')); assert.ok (!JSON.stringify (scene).includes ('Modal-Secret'));
        await mkdir ('work/cad-conversion', { recursive : true }); await page.screenshot ({ path : 'work/cad-conversion/' + width + '.png' });
        const [download] = await Promise.all ([page.waitForEvent ('download'), dialog.getByRole ('button', { name : 'GLB · m', exact : true }).click ()]); assert.equal (download.suggestedFilename (), 'model.glb'); assert.equal (downloaded, 2);
        await dialog.getByRole ('button', { name : 'Close Convert CAD', exact : true }).click ();
        await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 0);
        await call ('history.redo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
        if (width === 1440) {
            const input = page.getByLabel ('W dimension in mm', { exact : true });
            if (await input.count ()) { assert.ok (Math.abs (Number (await input.inputValue ()) - 40) < 0.001); }
        }
        Object.assign (active, { state : 'failed', stage : 'failed', purpose : 'conversion', errorCode : 'invalid_geometry', artifacts : {}, summary : null, progress : { phase : 'build_geometry', completed : null, total : null, unit : null }, diagnostics : { status : 'not_run', canRun : true, report : null, errorCode : null } });
        await call ('conversion.open');
        await dialog.getByRole ('button', { name : 'Diagnose on server', exact : true }).click ();
        await dialog.getByRole ('progressbar', { name : 'Server diagnostic · Reading CAD format', exact : true }).waitFor ();
        assert.equal ((await call ('conversion.diagnostics', { jobId : active.id })).status, 'running');
        Object.assign (active, { state : 'failed', stage : 'failed', purpose : 'conversion', progress : { phase : 'build_geometry', completed : null, total : null, unit : null }, diagnostics : { status : 'completed', canRun : true, report : diagnosticReport, errorCode : null } });
        await dialog.getByText ('Server diagnostic report', { exact : true }).click ();
        await dialog.getByText ('Build geometry · failed', { exact : true }).waitFor ();
        assert.ok ((await dialog.innerText ()).includes ('occt.construction_failed'));
        assert.equal ((await call ('conversion.diagnostics', { jobId : active.id })).report.exception, 'Standard_ConstructionError');
        assert.equal (uploads, 1, 'diagnosis reuses the existing upload'); assert.equal (downloaded, 2, 'report inspection never downloads source or output geometry');
        assert.equal (await dialog.getByRole ('button', { name : 'Add to current session', exact : true }).count (), 0);
        assert.equal ((await call ('scene.inspect')).objects.length, 1, 'diagnostic report must not create a model');
        await page.screenshot ({ path : 'work/cad-conversion/diagnostics-' + width + '.png' });
        assert.deepEqual (errors, []); await page.close ();
    }
    console.log ('CAD desktop/mobile passed: explicit private upload, required units, real calibration GLB import, account-bound transfer, downloads, one-step Undo/Redo and no automatic scene changes.');
} finally { await browser.close (); }
