import assert from 'node:assert/strict';
import { onRequest, OwnerLabel } from '../functions/api/macros.js';
import { ValidateMacroShape, ValidateMacroName } from '../source/website/macroshape.js';
import { BrowserMacroKey } from '../source/website/macrolibrary.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { ExecuteCommandText } from '../source/website/commandtext.js';

const env = { SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test' };
const fit = { version : 1, steps : [{ id : 'fit', command : 'view.fit', arguments : {} }] };
const revision = '00000000-0000-4000-8000-0000000000aa';

function Storage ()
{
    const store = new Map (), previous = globalThis.localStorage;
    globalThis.localStorage = { getItem : key => store.has (key) ? store.get (key) : null, setItem : (key, value) => store.set (key, String (value)), removeItem : key => store.delete (key) };
    return { store, restore : () => { globalThis.localStorage = previous; } };
}

// In-memory stand-in for /api/macros with the same owner/administrator rules as the database.
function FakeServer (admins = [])
{
    const rows = [], calls = [];
    const fetch = async (url, options = {}) => {
        const method = options.method || 'GET', actor = options.headers['X-Auto3D-Account'], body = options.body ? JSON.parse (options.body) : null; calls.push ({ url, method, actor, body });
        const reply = (json, status = 200) => new Response (JSON.stringify (json), { status, headers : { 'Content-Type' : 'application/json' } });
        if (fetch.down) { return reply ({ error : 'Macro library unavailable. Retry shortly.' }, 503); }
        const find = name => rows.find (row => row.name.toLowerCase () === name.toLowerCase ()), admin = admins.includes (actor);
        if (method === 'GET') { return reply ({ isAdmin : admin, macros : rows.map (row => ({ name : row.name, macro : row.macro, savedBy : row.owner, mine : row.owner === actor, canEdit : row.owner === actor || admin, revision : row.revision, updatedAt : 'now' })) }); }
        const row = find (body.name);
        if (row && row.owner !== actor && !admin) { return reply ({ error : 'Only the person who saved this macro, or an administrator, can replace it.' }, 403); }
        if (method === 'DELETE') { if (!row) { return reply ({ error : 'No shared macro with that name.' }, 404); } rows.splice (rows.indexOf (row), 1); return reply ({ deleted : row.name }); }
        if (row && body.revision && body.revision !== row.revision) { return reply ({ error : 'This macro changed in another session.' }, 409); }
        const next = { name : body.name, macro : body.macro, owner : row?.owner || actor, revision : crypto.randomUUID () };
        if (row) { Object.assign (row, next); } else { rows.push (next); }
        return reply ({ name : next.name, revision : next.revision, savedBy : next.owner, created : !row });
    };
    return { rows, calls, fetch };
}
function Registry (user = 'owner')
{
    const website = { auth : { user : { id : user } }, accountReady : true, sessionEditor : { document : { objects : [] } } };
    return { website, registry : CreateAgentCommands (website) };
}

describe ('Shared macro library', () => {
    it ('validates macro names and shape the same way in the browser and the API', () => {
        assert.equal (ValidateMacroName ('demo1'), 'demo1');
        for (const bad of ['', ' padded', 'padded ', 'x'.repeat (101), 'tab\there', 7]) { assert.throws (() => ValidateMacroName (bad), /1–100 characters/); }
        assert.deepEqual (ValidateMacroShape (fit), fit);
        for (const bad of [{ version : 2, steps : fit.steps }, { version : 1, steps : [] }, { ...fit, extra : true }, { version : 1, steps : [{ id : 'a', command : 'view.fit', script : 'x' }] },
            { version : 1, steps : [{ id : 'a', command : 'View.Fit' }] }, { version : 1, steps : [{ id : 'a', command : 'view.fit' }, { id : 'a', command : 'view.fit' }] },
            { version : 1, steps : [{ id : 'a', command : 'view.fit', arguments : [] }] }, { version : 1, steps : [{ id : 'a', command : 'view.fit', arguments : { text : 'x'.repeat (70000) } }] }]) { assert.throws (() => ValidateMacroShape (bad)); }
        assert.equal (OwnerLabel ({ name : ' Sam ', email : 'sam@example.com' }), 'Sam'); assert.equal (OwnerLabel ({ email : 'sam.lee@example.com' }), 'sam.lee'); assert.equal (OwnerLabel ({}), 'Auto3D user');
    });
    it ('API lists every macro, passes only the verified user to the database and maps refusals', async () => {
        const original = global.fetch, calls = []; let next = null;
        global.fetch = async (url, options) => {
            const path = new URL (url).pathname, body = options.body ? JSON.parse (options.body) : null; calls.push ({ path, body });
            if (next) { const response = next; next = null; return response; }
            if (path.endsWith ('/auto3d_macros')) { return Response.json ([{ name : 'demo1', definition : fit, owner_id : 'owner-a', owner_label : 'Sam', revision, updated_at : 't' }, { name : 'other', definition : fit, owner_id : 'owner-b', owner_label : 'Lee', revision, updated_at : 't' }]); }
            if (path.endsWith ('/auto3d_macro_is_admin')) { return Response.json (false); }
            if (path.endsWith ('/auto3d_macro_save')) { return Response.json ([{ name : body.p_name, revision, owner_label : body.p_label, updated_at : 't', created : true }]); }
            if (path.endsWith ('/auto3d_macro_delete')) { return Response.json (body.p_name); }
            return new Response ('{}', { status : 500 });
        };
        const context = (method, body, user = { id : 'owner-a', email : 'sam@example.com' }) => ({ env, data : user ? { user } : {}, request : new Request ('https://app.example/api/macros', { method, headers : { Origin : 'https://app.example', 'Content-Type' : 'application/json' }, ...(body ? { body : JSON.stringify (body) } : {}) }) });
        try {
            assert.equal ((await onRequest (context ('GET', null, null))).status, 401);
            const listed = await (await onRequest (context ('GET'))).json ();
            assert.equal (listed.isAdmin, false); assert.deepEqual (listed.macros.map (m => [m.name, m.savedBy, m.mine, m.canEdit]), [['demo1', 'Sam', true, true], ['other', 'Lee', false, false]]);
            assert.equal (JSON.stringify (listed).includes ('owner-b'), false, 'owner IDs stay on the server');
            // The actor comes from the verified session, never the body; extra fields are refused.
            const saved = await onRequest (context ('PUT', { name : 'demo2', macro : fit }));
            assert.equal (saved.status, 200); const rpc = calls.find (call => call.path.endsWith ('/auto3d_macro_save')).body;
            assert.equal (rpc.p_actor, 'owner-a'); assert.equal (rpc.p_label, 'sam'); assert.equal (rpc.p_revision, null);
            assert.equal ((await onRequest (context ('PUT', { name : 'demo2', macro : fit, owner : 'owner-b' }))).status, 400);
            assert.equal ((await onRequest (context ('PUT', { name : 'demo2', macro : fit, revision : 'stale' }))).status, 400);
            assert.equal ((await onRequest (context ('PUT', { name : 'demo2', macro : { version : 1, steps : [] } }))).status, 400);
            assert.equal ((await onRequest (context ('POST', { name : 'demo2', macro : fit }))).status, 405);
            for (const [code, status, message] of [['42501', 403, /Only the person/], ['40001', 409, /another session/], ['P0002', 404, /No shared macro/], ['XX000', 503, /unavailable/]]) {
                next = Response.json ({ code, message : code === 'XX000' ? 'internal detail' : code === '42501' ? 'Only the person who saved this macro, or an administrator, can replace it.' : code === '40001' ? 'This macro changed in another session.' : 'No shared macro with that name.' }, { status : 400 });
                const response = await onRequest (context ('DELETE', { name : 'other' })), result = await response.json ();
                assert.equal (response.status, status); assert.match (result.error, message); assert.doesNotMatch (result.error, /internal detail/);
            }
            assert.equal ((await (await onRequest (context ('DELETE', { name : 'demo2' }))).json ()).deleted, 'demo2');
        } finally { global.fetch = original; }
    });
    it ('commands save to the shared library, list browser-only macros and never fall back to browser storage', async () => {
        const { store, restore } = Storage (), server = FakeServer (), original = global.fetch; global.fetch = server.fetch;
        try {
            store.set (BrowserMacroKey, JSON.stringify ([{ name : 'Old local', macro : fit }, { name : 'demo1', macro : fit }]));
            const { registry } = Registry ('owner');
            const saved = await registry.Execute ('macro.save', { name : 'demo1', definition : JSON.stringify ({ version : 1, steps : [{ id : 'board', command : 'packaging.boards.select', arguments : { id : 'account-board-7' } }] }) });
            assert.equal (saved.ok, true, JSON.stringify (saved)); assert.equal (saved.result.location, 'shared'); assert.equal (saved.result.warnings.length, 1);
            // The shared copy replaced the browser copy with the same name.
            assert.deepEqual (JSON.parse (store.get (BrowserMacroKey)).map (item => item.name), ['Old local']);
            const list = (await registry.Execute ('macro.list')).result;
            assert.deepEqual (list.map (item => [item.name, item.location, item.canEdit]), [['demo1', 'shared', true], ['Old local', 'browser', true]]);
            assert.equal ((await registry.Execute ('macro.save', { name : 'bad', definition : JSON.stringify ({ version : 1, steps : [{ id : 'x', command : 'no.such' }] }) })).ok, false);
            // Typed "run macro" finds shared macros.
            const run = await ExecuteCommandText (registry, 'run macro DEMO1').catch (error => error); assert.doesNotMatch (String (run?.message || ''), /No saved macro/);
            // Export works for either location; a stale revision is refused.
            assert.equal ((await registry.Execute ('macro.export', { name : 'old local' })).result.location, 'browser');
            assert.equal ((await registry.Execute ('macro.save', { name : 'demo1', definition : JSON.stringify (fit), revision : '00000000-0000-4000-8000-000000000999' })).ok, false);
            // API down: the save fails and nothing is written to the browser instead.
            server.fetch.down = true; const before = store.get (BrowserMacroKey);
            const failed = await registry.Execute ('macro.save', { name : 'offline', definition : JSON.stringify (fit) });
            assert.equal (failed.ok, false); assert.match (failed.error.message, /unavailable/); assert.equal (store.get (BrowserMacroKey), before);
            const inspect = (await registry.Execute ('macro.library.inspect')).result; assert.equal (inspect.available, false); assert.deepEqual (inspect.browserOnly, ['Old local']);
            server.fetch.down = false;
            assert.equal ((await registry.Execute ('macro.delete', { name : 'old local' })).result.location, 'browser'); assert.equal (JSON.parse (store.get (BrowserMacroKey)).length, 0);
        } finally { global.fetch = original; restore (); }
    });
    it ('only the owner or an administrator changes a shared macro; everyone can run it', async () => {
        const { restore } = Storage (), server = FakeServer (['admin']), original = global.fetch; global.fetch = server.fetch;
        try {
            await Registry ('owner').registry.Execute ('macro.save', { name : 'demo1', definition : JSON.stringify (fit) });
            const other = Registry ('other').registry;
            const listed = (await other.Execute ('macro.list')).result[0]; assert.equal (listed.canEdit, false); assert.equal (listed.savedBy, 'owner');
            assert.equal ((await other.Execute ('macro.export', { name : 'demo1' })).ok, true);
            const replace = await other.Execute ('macro.save', { name : 'DEMO1', definition : JSON.stringify (fit) }); assert.equal (replace.ok, false); assert.match (replace.error.message, /Only the person/);
            const remove = await other.Execute ('macro.delete', { name : 'demo1' }); assert.equal (remove.ok, false); assert.match (remove.error.message, /Only owner/);
            assert.equal (server.calls.filter (call => call.method === 'DELETE').length, 0, 'refused locally before calling the API');
            const admin = Registry ('admin').registry; assert.equal ((await admin.Execute ('macro.library.inspect')).result.isAdmin, true);
            assert.equal ((await admin.Execute ('macro.delete', { name : 'demo1' })).result.location, 'shared'); assert.equal (server.rows.length, 0);
        } finally { global.fetch = original; restore (); }
    });
    it ('moves browser macros to the shared library without overwriting shared names', async () => {
        const { store, restore } = Storage (), server = FakeServer (), original = global.fetch; global.fetch = server.fetch;
        try {
            await Registry ('someone').registry.Execute ('macro.save', { name : 'demo1', definition : JSON.stringify (fit) });
            store.set (BrowserMacroKey, JSON.stringify ([{ name : 'pallet run', macro : fit }, { name : 'Demo1', macro : fit }, { name : 'bad macro', macro : { version : 1, steps : [] } }]));
            const result = (await Registry ('owner').registry.Execute ('macro.library.upload_browser')).result;
            assert.deepEqual (result.uploaded, ['pallet run']); assert.deepEqual (result.skipped.map (item => item.name).sort (), ['Demo1', 'bad macro']);
            assert.equal (server.rows.find (row => row.name === 'demo1').owner, 'someone', 'a shared macro is never overwritten');
            assert.deepEqual (JSON.parse (store.get (BrowserMacroKey)).map (item => item.name).sort (), ['Demo1', 'bad macro']);
        } finally { global.fetch = original; restore (); }
    });
});
