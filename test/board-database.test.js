import assert from 'node:assert/strict';
import { DefaultBoardDatabase, ValidateBoardDatabase, ExportBoardCSV, ImportBoardCSV } from '../modules/packaging/src/boarddatabase.js';
import { onRequest } from '../functions/api/packaging/boards.js';
import { AccountBoardDatabase } from '../source/website/boarddatabase.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import * as module from '../modules/packaging/src/boarddatabase.js';
const revision = '00000000-0000-4000-8000-000000000001';
describe ('Board database CSV and account persistence', () => {
    it ('Round trips exact measured caliper, multiline/quoted labels and every supported flute without style allowance factors', () => {
        const records = DefaultBoardDatabase (); records[1].name = 'B, "measured"\nlot 2'; records[1].caliperMm = 3.123456789; const csv = ExportBoardCSV (records); assert.deepEqual (ImportBoardCSV (csv), records); assert.deepEqual (records.map (record => record.flute), ['E', 'B', 'C', 'EB', 'BC', 'ACA', 'BCB']); assert.equal ('insideFactors' in records[0], false);
        for (const bad of [csv.replace ('caliperMm', 'unsupported'), csv + '"broken', csv.replace ('3.123456789', ''), csv.replace ('3.123456789', '-1'), ExportBoardCSV (records).replace ('"nominal-b"', '"nominal-e"')]) { assert.throws (() => ImportBoardCSV (bad)); }
        assert.throws (() => ValidateBoardDatabase ([{ ...records[0], flute : 'A' }])); assert.throws (() => ValidateBoardDatabase ([]));
    });
    it ('Scopes reads/writes to the authenticated owner and rejects stale revisions without touching other preferences', async () => {
        const original = global.fetch; const calls = []; let saved = null; const env = { SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test' }; const records = DefaultBoardDatabase ();
        global.fetch = async (url, options) => { calls.push ({ url, options }); const parsed = new URL (url); const method = options.method;
            if (method === 'POST') { return new Response (null, { status : 204 }); }
            if (method === 'PATCH') { const expected = parsed.searchParams.get ('board_database->>revision'); if (saved && expected !== saved.revision || !saved && parsed.searchParams.get ('board_database') !== 'is.null') { return Response.json ([]); } const body = JSON.parse (options.body); assert.deepEqual (Object.keys (body), ['board_database']); saved = body.board_database; return Response.json ([{ board_database : saved }]); }
            return Response.json (saved ? [{ board_database : saved }] : []);
        };
        const context = (method, body, id = 'owner-a') => ({ env, data : id ? { user : { id } } : {}, request : new Request ('https://app.example/api/packaging/boards', { method, headers : { Origin : 'https://app.example', ...(body ? { 'Content-Type' : 'application/json' } : {}) }, ...(body ? { body : JSON.stringify (body) } : {}) }) });
        try {
            assert.equal ((await onRequest (context ('GET', null, null))).status, 401); const initial = await (await onRequest (context ('GET'))).json (); assert.equal (initial.revision, null); assert.equal (initial.records.length, 7);
            const response = await onRequest (context ('PUT', { records, revision : null })); assert.equal (response.status, 200); const result = await response.json (); assert.equal (result.records[0].flute, 'E'); assert.equal ((await onRequest (context ('PUT', { records, revision : null }))).status, 409); assert.equal ((await onRequest (context ('PUT', { records : [{ ...records[0], caliperMm : -1 }], revision : result.revision }))).status, 400);
            assert.ok (calls.filter (call => call.options.method !== 'POST').every (call => new URL (call.url).searchParams.get ('user_id') === 'eq.owner-a'));
            const foreign = context ('PUT', { records, revision : result.revision }); foreign.request = new Request (foreign.request, { headers : { Origin : 'https://evil.example' } }); assert.equal ((await onRequest (foreign)).status, 403);
        } finally { global.fetch = original; }
    });
    it ('Exposes strict CSV save commands with nullable revisions and rejects invalid owners/types before execution', async () => {
        const calls = []; const website = { auth : { user : { id : 'owner' } }, sessionEditor : { packaging : { SaveBoardCSV : (csv, revision) => { calls.push ({ csv, revision }); return { saved : true }; } } } }; const registry = CreateAgentCommands (website); const csv = ExportBoardCSV (DefaultBoardDatabase ());
        assert.equal ((await registry.Execute ('packaging.boards.save_csv', { csv, revision : null })).ok, true); for (const args of [{ csv, revision : 42 }, { csv, revision : {} }, { csv, owner : 'another-account' }]) { assert.equal ((await registry.Execute ('packaging.boards.save_csv', args)).ok, false); } assert.equal (calls.length, 1); assert.equal (calls[0].revision, null);
    });
    it ('Keeps the client catalog unchanged on failed saves and rejects late responses after account switching', async () => {
        const original = global.fetch; const website = { auth : { user : { id : 'a' } }, accountReady : true, sessionEditor : { readOnly : false } }; const store = new AccountBoardDatabase (website, module); let release;
        global.fetch = async () => Response.json ({ revision, records : DefaultBoardDatabase () });
        try { await store.Load (); const before = store.Inspect (); global.fetch = async () => Response.json ({ error : 'changed' }, { status : 409 }); await assert.rejects (() => store.Save (DefaultBoardDatabase ()), /changed/); assert.deepEqual (store.Inspect (), before);
            global.fetch = async () => { await new Promise (resolve => { release = resolve; }); return Response.json ({ revision, records : DefaultBoardDatabase () }); }; const pending = store.Load (true); await Promise.resolve (); website.auth.user = { id : 'b' }; release (); await assert.rejects (() => pending, /Account changed/); assert.equal (store.owner, 'a');
        } finally { global.fetch = original; }
    });
});
