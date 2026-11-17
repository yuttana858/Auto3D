import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd ();
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const [width, admin] of [[1440, true], [390, true], [390, false]]) {
        const page = await browser.newPage ({ viewport : { width, height : 1000 }, reducedMotion : 'reduce' });
        let user = { id : 'owner', email : 'admin@example.com' }, saves = 0, tests = 0;
        const errors = [], state = { profile : 'preview', runtime : { saved : false, revision : null }, deployment : { saved : false, revision : null } };
        const tokenId = 'wk-browserfixture123456', tokenSecret = 'ws-privatebrowserfixture123456';
        page.on ('pageerror', error => errors.push (error.message));
        await page.route ('https://auto3d.test/**', async route => {
            const request = route.request (), pathname = new URL (request.url ()).pathname;
            if (pathname.startsWith ('/api/auth/')) { if (pathname.endsWith ('logout')) { user = null; } return route.fulfill ({ json : { user } }); }
            if (pathname === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
            if (pathname.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : admin, requests : [] } }); }
            if (pathname === '/api/connections/modal') {
                assert.equal (admin, true); assert.equal (request.headers ()['x-auto3d-account'], 'owner');
                if (request.method () === 'GET') { return route.fulfill ({ json : state }); }
                const body = request.postDataJSON ();
                if (request.method () === 'POST') { tests++; assert.deepEqual (body, {}); return route.fulfill ({ json : { connected : true, workspace : 'acme', environment : 'main', app : 'cloud-3d-studio', version : '0.2.0', conversionReady : false } }); }
                if (request.method () === 'PUT') {
                    saves++; assert.equal (body.revision, state[body.purpose].revision);
                    assert.equal (body.settings.tokenId, body.purpose === 'runtime' ? tokenId : tokenId.replace ('wk-', 'ak-'));
                    assert.equal (body.settings.tokenSecret, body.purpose === 'runtime' ? tokenSecret : tokenSecret.replace ('ws-', 'as-'));
                    const { tokenId : id, tokenSecret : secret, ...metadata } = body.settings;
                    state[body.purpose] = { saved : true, revision : '00000000-0000-4000-8000-000000000001', ...metadata };
                } else { assert.equal (request.method (), 'DELETE'); state[body.purpose] = { saved : false, revision : null }; }
                return route.fulfill ({ json : { profile : 'preview', purpose : body.purpose, saved : state[body.purpose].saved, revision : state[body.purpose].revision } });
            }
            if (pathname.startsWith ('/api/') || pathname.startsWith ('/mcp/')) { return route.fulfill ({ status : 404, json : { error : 'Not in fixture' } }); }
            try {
                const relative = decodeURIComponent (pathname).replace ('/build/website_dev/', '/build/website/');
                const filename = path.resolve (root, '.' + relative); assert.ok (filename.startsWith (root + path.sep));
                return route.fulfill ({ body : await readFile (filename), contentType : types[path.extname (filename)] || 'application/octet-stream' });
            } catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
        });
        await page.goto ('https://auto3d.test/website/index.html');
        await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        const call = id => page.evaluate (id => window.Auto3D.execute (id, {}), id);
        await page.getByRole ('button', { name : 'Preferences', exact : true }).click ();
        const entry = page.getByRole ('button', { name : 'Manage Modal connections', exact : true });
        if (!admin) {
            assert.equal (await entry.isVisible (), false); assert.equal ((await call ('admin.modal.open')).ok, false); assert.equal (saves, 0); await page.close (); continue;
        }
        await entry.click ();
        const dialog = page.getByRole ('dialog', { name : 'Modal connections', exact : true });
        await dialog.getByText ('No connection saved for this purpose.', { exact : true }).waitFor ();
        assert.equal (await dialog.getAttribute ('data-capture-private'), '');
        const idInput = dialog.getByLabel ('Modal token ID', { exact : true }), secretInput = dialog.getByLabel ('Modal token secret', { exact : true });
        assert.equal (await idInput.getAttribute ('type'), 'password'); assert.equal (await secretInput.getAttribute ('type'), 'password');
        const fill = async purpose => {
            await dialog.getByLabel ('Modal workspace slug', { exact : true }).fill ('acme');
            if (purpose === 'runtime') { await dialog.getByLabel ('Modal gateway URL', { exact : true }).fill ('https://acme--cloud-3d-studio-cad-gateway.modal.run'); }
            await idInput.fill (purpose === 'runtime' ? tokenId : tokenId.replace ('wk-', 'ak-'));
            await secretInput.fill (purpose === 'runtime' ? tokenSecret : tokenSecret.replace ('ws-', 'as-'));
        };
        await fill ('runtime'); await dialog.getByRole ('button', { name : 'Save connection', exact : true }).click ();
        await dialog.getByText ('Connection saved in Supabase Vault. Test the saved app connection next.', { exact : true }).waitFor ();
        assert.equal (await idInput.inputValue (), ''); assert.equal (await secretInput.inputValue (), '');
        await dialog.getByRole ('button', { name : 'Test saved app connection', exact : true }).click ();
        await dialog.getByText ('Connected to acme / main. Native CAD verification is pending.', { exact : true }).waitFor (); assert.equal (tests, 1);
        await dialog.getByLabel ('Connection purpose', { exact : true }).selectOption ('deployment');
        assert.equal (await dialog.getByLabel ('Modal gateway URL', { exact : true }).isVisible (), false);
        await fill ('deployment'); await dialog.getByRole ('button', { name : 'Save connection', exact : true }).click ();
        await dialog.getByText ('Connection saved in Supabase Vault. Use the Vault runner to verify the deployment tokens.', { exact : true }).waitFor (); assert.equal (saves, 2);
        const storage = await page.evaluate (() => JSON.stringify ([Object.entries (localStorage), Object.entries (sessionStorage)]));
        for (const secret of [tokenId, tokenSecret, tokenId.replace ('wk-', 'ak-'), tokenSecret.replace ('ws-', 'as-')]) { assert.ok (!storage.includes (secret)); assert.ok (!(await page.content ()).includes (secret)); }
        assert.ok (!JSON.stringify (await call ('diagnostics.list')).includes (tokenSecret));
        await mkdir ('work/modal-connection', { recursive : true }); await page.screenshot ({ path : 'work/modal-connection/' + width + '.png' });
        await dialog.getByRole ('button', { name : 'Close Modal connections', exact : true }).click ();
        assert.equal ((await call ('admin.modal.open')).ok, true);
        await dialog.getByText ('A connection is saved. Enter both token fields to replace it.', { exact : true }).waitFor ();
        assert.equal (await secretInput.inputValue (), '');
        await dialog.getByRole ('button', { name : 'Remove saved connection', exact : true }).click ();
        await dialog.getByText ('Saved connection removed. Revoke the token separately in Modal if needed.', { exact : true }).waitFor ();
        assert.equal (state.runtime.saved, false); assert.equal (state.deployment.saved, true);
        await idInput.fill (tokenId); await secretInput.fill (tokenSecret); assert.equal ((await call ('auth.sign_out')).ok, true);
        await dialog.waitFor ({ state : 'hidden' }); assert.deepEqual (errors, []); await page.close ();
    }
    console.log ('Modal connections passed: desktop/mobile admin entry, masked pairs, purpose isolation, save/test/remove/reopen, private capture marker, storage/log exclusion, logout and non-admin gates.');
} finally { await browser.close (); }
