import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { onRequest as personal } from '../../functions/api/personal/[[path]].js';
import { onRequest as preferences } from '../../functions/api/preferences.js';
const A = '00000000-0000-4000-8000-000000000001'; const B = '00000000-0000-4000-8000-000000000002';
let user = { id : A, email : 'a@example.com' }; const profiles = new Map (); let rows = []; const files = new Map ();
const env = { SUPABASE_URL : 'https://fixture.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_fixture', AUTO3D_LIBRARY_R2 : { async put (key, value) { files.set (key, await new Response (value).arrayBuffer ()); }, async get (key) { return files.has (key) ? { body : files.get (key) } : null; }, async delete (keys) { keys.forEach ((key) => files.delete (key)); } } };
const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
    const parsed = new URL (url); const body = options.body ? JSON.parse (options.body) : null;
    if (parsed.pathname.endsWith ('auto3d_preferences')) {
        const owner = body?.user_id || parsed.searchParams.get ('user_id')?.slice (3);
        if (!profiles.has (owner)) { profiles.set (owner, { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] }); }
        const profile = profiles.get (owner); if (options.method === 'PATCH') { Object.assign (profile, body); }
        return options.method === 'POST' ? new Response (null, { status : 201 }) : Response.json ([profile]);
    }
    if (parsed.pathname.endsWith ('auto3d_reserve_personal_item')) { rows.push ({ id : body.p_id, user_id : body.p_user_id, name : body.p_name, category : body.p_category, kind : body.p_kind, object_count : body.p_object_count, file_size : body.p_file_size, archive_key : 'users/' + body.p_user_id + '/' + body.p_id + '/session.auto3d', thumbnail_key : 'users/' + body.p_user_id + '/' + body.p_id + '/thumbnail.png', status : 'pending', created_at : new Date ().toISOString (), updated_at : new Date ().toISOString () }); return Response.json (null); }
    assert.ok (parsed.pathname.endsWith ('auto3d_personal_library'));
    const match = (row) => ['user_id', 'id', 'status'].every ((key) => !parsed.searchParams.has (key) || parsed.searchParams.get (key) === 'eq.' + row[key]); const selected = rows.filter (match);
    if (options.method === 'PATCH') { selected.forEach ((row) => Object.assign (row, body)); }
    if (options.method === 'DELETE') { rows = rows.filter ((row) => !match (row)); return new Response (null, { status : 204 }); }
    return Response.json (selected);
};
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const context = await browser.newContext ({ viewport : { width : 1440, height : 1000 } }); const errors = [];
    await context.route ('**/api/auth/**', async (route) => {
        const action = route.request ().url ().split ('/').pop ();
        if (action === 'logout') { user = null; } if (action === 'login') { const body = route.request ().postDataJSON (); user = { id : body.email.startsWith ('b@') ? B : A, email : body.email }; }
        await route.fulfill ({ json : { user } });
    });
    await context.route ('**/api/accounts/admin', (route) => route.fulfill ({ json : { isAdmin : false } }));
    const handle = async (route, handler, path = []) => {
        const r = route.request (); const response = await handler ({ env, data : user ? { user } : {}, params : { path }, request : new Request (r.url (), { method : r.method (), headers : await r.allHeaders (), body : ['GET', 'HEAD'].includes (r.method ()) ? undefined : r.postDataBuffer () }) });
        await route.fulfill ({ status : response.status, headers : Object.fromEntries (response.headers), body : Buffer.from (await response.arrayBuffer ()) });
    };
    await context.route ('**/api/preferences', (route) => handle (route, preferences));
    await context.route ('**/api/personal/**', (route) => handle (route, personal, new URL (route.request ().url ()).pathname.split ('/').slice (3)));
    const page = await context.newPage (); page.setDefaultTimeout (20000); page.on ('pageerror', (e) => errors.push (e.message));
    const ready = async () => { await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked')); };
    const command = (id, args = {}) => page.evaluate (async ({ id, args }) => { const result = await window.Auto3D.execute (id, args); if (!result.ok) { throw new Error (JSON.stringify (result)); } return result; }, { id, args });
    await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' }); await ready ();
    await command ('preferences.units', { units : 'standard' }); await command ('preferences.theme', { theme : 'dark' });
    assert.equal (profiles.get (A).preferences.units, 'standard'); assert.equal (profiles.get (A).preferences.theme, 2); assert.ok (profiles.get (A).preferences.view);
    await page.locator ('#open_file').setInputFiles ('test/testfiles/off/cube.off'); await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Added '));
    const save = await command ('library.account.save', { name : 'Cloud cube', category : 'Projects/Concepts' }); assert.equal (rows.length, 1); assert.equal (files.size, 2);
    await command ('ui.library'); await page.getByRole ('button', { name : 'Open Cloud cube', exact : true }).waitFor (); assert.equal (await page.locator ('.library_card img').evaluate ((img) => img.src.startsWith ('blob:')), true);
    await page.getByRole ('button', { name : 'Open Cloud cube', exact : true }).click (); await page.waitForFunction (() => !document.querySelector ('.library_dialog[open]'));
    await command ('library.account.rename', { id : save.result.item.id, name : 'Renamed cloud cube' });
    await command ('library.account.move', { id : save.result.item.id, category : 'Archive' });
    await command ('ui.save'); await page.getByLabel ('Save name', { exact : true }).fill ('UI cloud save'); await page.getByLabel ('Save destination', { exact : true }).selectOption ('account');
    await page.getByRole ('button', { name : 'Save to library', exact : true }).click (); await page.waitForFunction (() => !document.querySelector ('dialog[aria-label="Save session"]')); assert.equal (rows.length, 2);
    await command ('ui.library'); const dialog = page.getByRole ('dialog', { name : 'Model library' }); const deleteButton = dialog.getByRole ('button', { name : 'Delete UI cloud save', exact : true }); await deleteButton.waitFor ();
    await context.route ('**/api/personal/items/*', route => route.request ().method () === 'DELETE' ? route.fulfill ({ status : 503, json : { error : 'Fixture delete failed.' } }) : route.fallback ());
    page.once ('dialog', prompt => prompt.accept ()); await deleteButton.click (); await dialog.getByRole ('status').filter ({ hasText : 'Fixture delete failed' }).waitFor (); assert.equal (rows.length, 2); assert.equal (await deleteButton.isEnabled (), true);
    await context.unroute ('**/api/personal/items/*'); page.once ('dialog', prompt => prompt.accept ()); await deleteButton.click (); await deleteButton.waitFor ({ state : 'detached' }); assert.equal (rows.length, 1); await dialog.getByRole ('button', { name : 'Close Model library' }).click ();
    await context.route ('**/api/personal/items', (route) => route.fulfill ({ status : 503, json : { error : 'Fixture storage offline.' } }));
    await command ('ui.save'); const portable = page.getByRole ('button', { name : 'Save session file', exact : true }); assert.equal (await portable.isEnabled (), true); await page.getByRole ('dialog', { name : 'Save session', exact : true }).getByRole ('button', { name : 'Close Save session', exact : true }).click (); await context.unroute ('**/api/personal/items');
    await page.reload ({ waitUntil : 'domcontentloaded' }); await ready (); const inspected = await command ('preferences.inspect'); assert.deepEqual (inspected.result, { units : 'standard', theme : 'dark' });
    assert.equal ((await command ('library.account.list')).result.items.length, 1);
    await command ('auth.sign_out'); await page.locator ('#auth_gate').waitFor ();
    await page.locator ('#auth_gate').getByLabel ('Email', { exact : true }).fill ('b@example.com'); await page.locator ('#auth_gate').getByLabel ('Password', { exact : true }).fill ('fixture-password'); await page.locator ('#auth_gate').getByRole ('button', { name : 'Sign in', exact : true }).click (); await ready ();
    assert.deepEqual ((await command ('preferences.inspect')).result, { units : 'metric', theme : 'light' }); assert.deepEqual ((await command ('library.account.list')).result.items, []);
    const forbidden = await page.evaluate ((id) => fetch ('/api/personal/items/' + id + '/archive').then ((r) => r.status), save.result.item.id); assert.equal (forbidden, 404);
    assert.deepEqual (errors, []); console.log ('Browser account preferences persist, cloud archive/thumbnail round-trip, rename/move, and account isolation passed.');
} finally { await browser.close (); global.fetch = originalFetch; }
