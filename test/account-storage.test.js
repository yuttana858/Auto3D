import { Blob as NativeBlob } from 'node:buffer';
import assert from 'node:assert/strict';
import { onRequest as library } from '../functions/api/personal/[[path]].js';
import { onRequest as preferences } from '../functions/api/preferences.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { AccessCookie } from '../functions/_lib/auth.js';
import { AccountLibrary } from '../source/website/accountlibrary.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
const A = '00000000-0000-4000-8000-000000000001'; const B = '00000000-0000-4000-8000-000000000002';
const env = { SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test' };
const png = new NativeBlob ([new Uint8Array ([137,80,78,71,13,10,26,10,0])]);
function upload (extra = false) { const form = new FormData (); for (const [key, value] of Object.entries ({ name : 'Concept', category : 'Projects', kind : 'session', objects : '1' })) { form.append (key, value); } form.append ('archive', new Blob ([new Uint8Array ([80,75,3,4,0])]), 's.auto3d'); form.append ('thumbnail', png, 't.png'); if (extra) { form.append ('user_id', B); } return form; }
function context (path = ['items'], method = 'GET', body, user = A) { return { params : { path }, data : user ? { user : { id : user } } : {}, env, request : new Request ('https://app.example/api/personal/' + path.join ('/'), { method, body, headers : body && !(body instanceof FormData) ? { 'Content-Type' : 'application/json' } : {} }) }; }
describe ('Private account storage', () => {
    let fetchOriginal; let blobOriginal; let calls; let files; let rows; let profile;
    beforeEach (() => {
        fetchOriginal = global.fetch; blobOriginal = global.Blob; global.Blob = NativeBlob; calls = []; files = new Map (); rows = []; profile = { preferences : { units : 'standard', theme : 2 }, folders : ['Uncategorized'] };
        env.AUTO3D_LIBRARY_R2 = { async put (key, stream) { files.set (key, await new Response (stream).arrayBuffer ()); }, async get (key) { return files.has (key) ? { body : files.get (key) } : null; }, async delete (keys) { keys.forEach ((key) => files.delete (key)); } };
        global.fetch = async (url, options = {}) => {
            const parsed = new URL (url); const body = options.body ? JSON.parse (options.body) : null; calls.push ({ url, method : options.method, body });
            if (parsed.pathname.endsWith ('auto3d_reserve_personal_item')) { rows.push ({ id : body.p_id, user_id : body.p_user_id, name : body.p_name, category : body.p_category, kind : body.p_kind, object_count : body.p_object_count, file_size : body.p_file_size, archive_key : 'users/' + body.p_user_id + '/' + body.p_id + '/session.auto3d', thumbnail_key : 'users/' + body.p_user_id + '/' + body.p_id + '/thumbnail.png', status : 'pending' }); return Response.json (null); }
            if (parsed.pathname.endsWith ('auto3d_preferences')) { if (options.method === 'PATCH') { Object.assign (profile, body); } return options.method === 'POST' ? new Response (null, { status : 201 }) : Response.json ([profile]); }
            assert.ok (parsed.pathname.endsWith ('auto3d_personal_library'));
            const match = (row) => ['user_id', 'id', 'status'].every ((key) => !parsed.searchParams.has (key) || parsed.searchParams.get (key) === 'eq.' + row[key]);
            const selected = rows.filter (match);
            if (options.method === 'PATCH') { selected.forEach ((row) => Object.assign (row, body)); }
            if (options.method === 'DELETE') { rows = rows.filter ((row) => !match (row)); return new Response (null, { status : 204 }); }
            return Response.json (selected);
        };
    });
    afterEach (() => { global.fetch = fetchOriginal; global.Blob = blobOriginal; });
    it ('requires authentication and rejects client-supplied ownership before storage', async () => {
        assert.equal ((await library (context (['items'], 'GET', undefined, null))).status, 401);
        assert.equal ((await library (context (['items'], 'POST', upload (true)))).status, 400); assert.equal (calls.length, 0); assert.equal (files.size, 0);
    });
    it ('saves immutable owned files and denies every known-ID read/update/delete to another user', async () => {
        const saved = await library (context (['items'], 'POST', upload ())); assert.equal (saved.status, 201); const item = await saved.json (); assert.equal (files.size, 2);
        assert.equal ((await (await library (context ())).json ()).length, 1);
        assert.deepEqual (await (await library (context (['items'], 'GET', undefined, B))).json (), []);
        for (const [path, method, body] of [[[item.id], 'GET'], [[item.id, 'archive'], 'GET'], [[item.id, 'thumbnail'], 'GET'], [[item.id], 'DELETE'], [[item.id], 'PATCH', JSON.stringify ({ name : 'stolen' })]]) { assert.equal ((await library (context (['items', ...path], method, body, B))).status, 404); }
        const archive = await library (context (['items', item.id, 'archive'])); assert.equal (archive.status, 200); assert.equal (archive.headers.get ('Cache-Control'), 'private, no-store'); assert.equal ((await archive.arrayBuffer ()).byteLength, 5);
        assert.equal ((await library (context (['items', item.id], 'PATCH', JSON.stringify ({ name : 'Revised', category : 'Archive' })))).status, 200);
        assert.equal (rows[0].name, 'Revised'); assert.equal ((await library (context (['items', item.id], 'DELETE'))).status, 200); assert.equal (files.size, 0); assert.equal (rows.length, 0);
    });
    it ('saves profile-only sessions without relaxing model count or owner checks', async () => {
        const flat = upload (); flat.set ('objects', '0'); const response = await library (context (['items'], 'POST', flat)); assert.equal (response.status, 201); const item = await response.json (); assert.equal (item.objects, 0);
        assert.equal ((await library (context (['items', item.id, 'archive'], 'GET', undefined, B))).status, 404);
        for (const [kind, count] of [['model', '0'], ['session', '-1'], ['session', '1001']]) { const invalid = upload (); invalid.set ('objects', count); invalid.set ('kind', kind); assert.equal ((await library (context (['items'], 'POST', invalid))).status, 400); }
    });
    it ('cleans up a failed upload and never lists partial records', async () => {
        const put = env.AUTO3D_LIBRARY_R2.put; env.AUTO3D_LIBRARY_R2.put = async (key, data) => { if (key.endsWith ('.png')) { throw new Error ('R2 unavailable'); } return put (key, data); };
        assert.equal ((await library (context (['items'], 'POST', upload ()))).status, 503); assert.equal (files.size, 0); assert.equal (rows.length, 0);
    });
    it ('keeps failed deletions retryable while retaining owner checks', async () => {
        const item = await (await library (context (['items'], 'POST', upload ()))).json ();
        const remove = env.AUTO3D_LIBRARY_R2.delete; env.AUTO3D_LIBRARY_R2.delete = async () => { throw new Error ('temporary failure'); };
        assert.equal ((await library (context (['items', item.id], 'DELETE'))).status, 503); assert.equal (rows[0].status, 'ready');
        env.AUTO3D_LIBRARY_R2.delete = remove; assert.equal ((await library (context (['items', item.id], 'DELETE'))).status, 200); assert.equal (rows.length, 0);
    });
    it ('reserves quota before storing bytes and rejects oversized bodies', async () => {
        global.fetch = async () => Response.json ({ code : 'P0001' }, { status : 400 });
        assert.equal ((await library (context (['items'], 'POST', upload ()))).status, 409); assert.equal (files.size, 0);
        const c = context (['items'], 'POST', upload ()); c.request.headers.set ('Content-Length', String (100 * 1024 * 1024)); assert.equal ((await library (c)).status, 413);
    });
    it ('keeps preferences and folders independent and excludes credentials and owner fields', async () => {
        const pref = (body) => preferences ({ ...context ([], 'PUT', JSON.stringify (body)), params : {} });
        assert.equal ((await pref ({ folders : ['Projects/Concepts'] })).status, 200); assert.deepEqual (profile.preferences, { units : 'standard', theme : 2 });
        assert.equal ((await pref ({ preferences : { units : 'metric', theme : 1 } })).status, 200); assert.ok (profile.folders.includes ('Projects/Concepts'));
        assert.equal ((await pref ({ preferences : { units : 'metric', theme : 1, viewportQuality : 'fast' } })).status, 200); assert.equal (profile.preferences.viewportQuality, 'fast');
        assert.equal ((await pref ({ preferences : { units : 'metric', theme : 1, viewportQuality : 'invalid' } })).status, 400); assert.equal (profile.preferences.viewportQuality, 'fast');
        for (const body of [{ user_id : B }, { preferences : { units : 'metric', theme : 1, apiKey : 'secret' } }, { folders : ['../other'] }]) { assert.equal ((await pref (body)).status, 400); }
        assert.ok (calls.filter ((call) => call.method === 'PATCH').every ((call) => call.url.includes ('user_id=eq.' + A)));
    });
    it ('blocks requests captured for another account even with a valid current session', async () => {
        const token = 'head.' + Buffer.from (JSON.stringify ({ session_id : A })).toString ('base64url') + '.signature';
        global.fetch = async (url) => Response.json (url.endsWith ('/user') ? { id : B, email : 'b@example.com' } : true);
        const response = await middleware ({ env, data : {}, request : new Request ('https://app.example/api/preferences', { headers : { Cookie : AccessCookie + '=' + token, 'X-Auto3D-Account' : A } }), next : () => { throw new Error ('must not continue'); } }); assert.equal (response.status, 409);
    });
    it ('discards a private response when the browser account changes during download', async () => {
        const auth = { user : { id : A } }; let release;
        const client = new AccountLibrary (auth, async () => ({ ok : true, arrayBuffer : async () => new Promise ((resolve) => { release = resolve; }) }));
        const downloading = client.Archive ({ id : A }); await new Promise ((resolve) => setImmediate (resolve)); auth.user = { id : B }; release (new ArrayBuffer (1)); await assert.rejects (() => downloading, /Account changed/);
    });
    it ('includes HTTP status for both JSON and non-JSON Library failures', async () => {
        const auth = { user : { id : A } };
        const json = new AccountLibrary (auth, async () => Response.json ({ error : 'Storage unavailable.' }, { status : 503 }));
        await assert.rejects (() => json.List (), /Storage unavailable\. \(HTTP 503\)/);
        const html = new AccountLibrary (auth, async () => new Response ('upstream failure', { status : 502 }));
        await assert.rejects (() => html.List (), /Account Library request failed\. \(HTTP 502\)/);
    });
    it ('uses shared Library methods for strict commands/macros and respects read-only', async () => {
        const events = []; const storage = { List : async () => [], Update : async (id, changes) => { events.push (id); return changes; }, Remove : async () => ({ removed : true }) };
        const editor = { readOnly : false, library : { accountStorage : storage, SaveAccount : async (name) => ({ name }) } };
        const registry = CreateAgentCommands ({ sessionEditor : editor });
        const macro = await registry.RunMacro ({ version : 1, steps : [{ id : 'save', command : 'library.account.save', arguments : { name : 'Concept' } }, { id : 'list', command : 'library.account.list', arguments : {} }] }); assert.equal (macro.ok, true);
        assert.equal ((await registry.Execute ('library.account.rename', { id : A, name : 'Updated', user_id : B })).ok, false); assert.equal (events.length, 0);
        editor.readOnly = true; assert.equal ((await registry.Execute ('library.account.delete', { id : A })).ok, false); assert.equal ((await registry.Execute ('library.account.list')).ok, true);
    });
});
