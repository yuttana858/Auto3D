import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Full built application, isolated API mocks; no live Meshy calls or credentials.
const root = process.cwd ();
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const viewport of [{ width : 1440, height : 1000 }, { width : 390, height : 844 }]) {
        const page = await browser.newPage ({ viewport, reducedMotion : 'reduce' }); let saved = false, submitted = 0, checked = 0, sharedSaved = false, sharedWrites = 0; const isAdmin = viewport.width > 500;
        const key = 'msy_browser_fixture_123456789', sharedKey = 'msy_shared_browser_fixture_12345'; const errors = [];
        page.on ('pageerror', error => errors.push (error.message));
        await page.route ('https://auto3d.test/**', async route => {
            const request = route.request (), url = new URL (request.url ()), name = url.pathname;
            if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : name.endsWith ('logout') ? null : { id : 'owner', email : 'test@example.com' } } }); }
            if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
            if (name.startsWith ('/api/accounts/')) { return isAdmin ? route.fulfill ({ json : { isAdmin : true, requests : [] } }) : route.fulfill ({ status : 403, json : { error : 'Administrator access required.' } }); }
            if (name === '/api/ai/shared-credential') {
                assert.equal (request.headers ()['x-auto3d-account'], 'owner');
                if (request.method () !== 'GET') { assert.ok (isAdmin, 'non-admin UI must not write the shared key'); sharedWrites++; }
                if (request.method () === 'PUT') { assert.deepEqual (request.postDataJSON (), { key : sharedKey }); sharedSaved = true; }
                if (request.method () === 'DELETE') { sharedSaved = false; }
                return route.fulfill ({ json : { saved : sharedSaved, available : true } });
            }
            if (name === '/api/ai/credentials') {
                assert.equal (request.headers ()['x-auto3d-account'], 'owner');
                if (request.method () === 'PUT') { assert.deepEqual (request.postDataJSON (), { key }); saved = true; submitted++; }
                if (request.method () === 'DELETE') { saved = false; }
                return route.fulfill ({ json : { saved, available : true } });
            }
            if (name === '/api/ai/balance') { checked++; return route.fulfill ({ json : { balance : 42 } }); }
            if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
            try {
                const relative = decodeURIComponent (name).replace ('/build/website_dev/', '/build/website/');
                const file = path.resolve (root, '.' + relative); assert.ok (file.startsWith (root + path.sep));
                return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' });
            } catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
        });
        await page.goto ('https://auto3d.test/website/index.html');
        await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        const call = async id => { const response = await page.evaluate (id => window.Auto3D.execute (id, {}), id); assert.equal (response.ok, true, JSON.stringify (response)); return response.result; };
        await page.getByRole ('button', { name : 'Preferences', exact : true }).click ();
        await page.getByRole ('button', { name : 'Manage Meshy key', exact : true }).click ();
        const dialog = page.getByRole ('dialog', { name : 'Meshy connection', exact : true });
        await dialog.getByText ('No personal key saved. You can generate with the shared organization key when an administrator has saved one.', { exact : true }).waitFor ();
        const input = dialog.getByLabel ('Meshy API key', { exact : true });
        assert.equal (await input.getAttribute ('type'), 'password'); assert.equal (await dialog.getAttribute ('data-capture-private'), '');
        await input.fill (key); await dialog.getByRole ('button', { name : 'Save key', exact : true }).click ();
        await dialog.getByText ('Key saved. Test the saved connection to check it with Meshy.', { exact : true }).waitFor ();
        assert.equal (await input.inputValue (), ''); assert.equal (submitted, 1);
        await dialog.getByRole ('button', { name : 'Test saved connection', exact : true }).click ();
        await dialog.getByText ('Connected · 42 credits available.', { exact : true }).waitFor (); assert.equal (checked, 1);
        const storage = await page.evaluate (() => JSON.stringify ([Object.entries (localStorage), Object.entries (sessionStorage)])); assert.equal (storage.includes (key), false);
        assert.equal ((await page.content ()).includes (key), false); assert.equal (JSON.stringify (await call ('diagnostics.list')).includes (key), false);
        await mkdir ('work/ai-key-review', { recursive : true }); await page.screenshot ({ path : 'work/ai-key-review/' + viewport.width + '.png' });
        await dialog.getByRole ('button', { name : 'Close Meshy connection', exact : true }).click (); await dialog.waitFor ({ state : 'hidden' });
        await call ('ai.connection.open'); await dialog.getByText ('A key is saved for your account. Enter a new key to replace it.', { exact : true }).waitFor (); assert.equal (await input.inputValue (), '');
        await dialog.getByRole ('button', { name : 'Remove key', exact : true }).click ();
        await dialog.getByText ('Your saved key was removed. The shared organization key is used when one is saved.', { exact : true }).waitFor (); assert.equal (saved, false);
        const sharedInput = dialog.getByLabel ('Shared Meshy API key', { exact : true });
        if (isAdmin) {
            await dialog.getByText ('No shared key saved.', { exact : true }).waitFor (); assert.equal (await sharedInput.getAttribute ('type'), 'password');
            await sharedInput.fill (sharedKey); await dialog.getByRole ('button', { name : 'Save shared key', exact : true }).click ();
            await dialog.getByText ('Shared key saved. Every account without its own key now uses it.', { exact : true }).waitFor (); assert.equal (await sharedInput.inputValue (), ''); assert.equal (sharedSaved, true);
            assert.deepEqual (await call ('ai.shared_connection.inspect'), { shared : true, available : true });
            assert.equal ((await page.content ()).includes (sharedKey), false);
            await dialog.getByRole ('button', { name : 'Remove shared key', exact : true }).click (); await dialog.getByText ('Shared key removed. Accounts without their own key can no longer generate.', { exact : true }).waitFor (); assert.equal (sharedSaved, false);
        } else { await page.waitForTimeout (300); assert.equal (await sharedInput.isVisible (), false); assert.equal (sharedWrites, 0); }
        await input.fill (key); await call ('auth.sign_out'); await dialog.waitFor ({ state : 'hidden' });
        assert.equal ((await page.content ()).includes (key), false); assert.deepEqual (errors, []);
        await page.close ();
    }
    console.log ('Meshy credential desktop/mobile UI passed: private masked entry, save, test, reopen, removal, admin shared key save/remove, hidden for non-admins, storage/log exclusion, logout cleanup.');
} finally { await browser.close (); }
