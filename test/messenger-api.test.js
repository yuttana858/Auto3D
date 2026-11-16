import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { onRequest } from '../functions/api/messenger/[[path]].js';

const actor = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const conversation = '00000000-0000-4000-8000-000000000003';
const env = { SUPABASE_URL : 'https://fixture.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_fixture' };
const context = (path, method = 'GET', body, query = '') => ({ env, data : { user : { id : actor } }, params : { path }, request : new Request ('https://auto3d.test/api/messenger/' + path.join ('/') + query, { method, ...(body === undefined ? {} : { body : JSON.stringify (body) }) }) });

describe ('Messenger API actor boundary', () => {
    let original, calls;
    beforeEach (() => { original = globalThis.fetch; calls = []; globalThis.fetch = async (url, options) => { calls.push ({ url, options, body : options.body && JSON.parse (options.body) }); return Response.json (url.includes ('auto3d_conversation_list') ? [{ id : conversation }] : url.includes ('auto3d_conversation_create') ? conversation : url.includes ('auto3d_conversation_read') ? [] : { body : 'hello' }); }; });
    afterEach (() => { globalThis.fetch = original; });
    it ('refuses requests without verified identity and does not contact storage', async () => { const c = context (['conversations']); c.data = {}; assert.equal ((await onRequest (c)).status, 401); assert.equal (calls.length, 0); });
    it ('ignores forged actor fields by rejecting the entire create or send request', async () => { assert.equal ((await onRequest (context (['conversations'], 'POST', { kind : 'direct', title : '', members : [other], actor : other }))).status, 400); assert.equal ((await onRequest (context (['conversations', conversation, 'messages'], 'POST', { body : 'hi', origin : 'user', id : conversation, sender : other }))).status, 400); assert.equal (calls.length, 0); });
    it ('passes only the verified actor into transactional create and send functions', async () => { assert.equal ((await onRequest (context (['conversations'], 'POST', { kind : 'direct', title : '', members : [other] }))).status, 201); assert.equal (calls[0].body.p_actor, actor); assert.equal ((await onRequest (context (['conversations', conversation, 'messages'], 'POST', { body : 'hello', origin : 'user', id : conversation }))).status, 201); assert.deepEqual (calls[1].body, { p_actor : actor, p_conversation : conversation, p_body : 'hello', p_origin : 'user', p_id : conversation }); });
    it ('looks up an exact address with the verified actor and does not accept a forged owner', async () => { assert.equal ((await onRequest (context (['lookup'], 'POST', { email : 'x@example.com', actor : other }))).status, 400); assert.equal ((await onRequest (context (['lookup'], 'POST', { email : 'x@example.com' }))).status, 200); assert.deepEqual (calls[0].body, { p_actor : actor, p_email : 'x@example.com' }); });
    it ('uses authenticated membership for list and membership-checked cursor reads', async () => { const list = await (await onRequest (context (['conversations']))).json (); assert.equal (list.conversations[0].id, conversation); assert.equal (calls[0].body.p_actor, actor); const read = await onRequest (context (['conversations', conversation, 'messages'], 'GET', undefined, '?limit=25')); assert.equal (read.status, 200); assert.equal (calls[1].body.p_actor, actor); assert.equal (calls[1].body.p_limit, 25); });
    it ('rejects invalid or incomplete cursors before querying', async () => { assert.equal ((await onRequest (context (['conversations', conversation, 'messages'], 'GET', undefined, '?beforeTime=2026-01-01'))).status, 400); assert.equal ((await onRequest (context (['conversations', conversation, 'messages'], 'GET', undefined, '?limit=101'))).status, 400); assert.equal (calls.length, 0); });
    it ('leaves only the verified actor through the transactional function', async () => { assert.equal ((await onRequest (context (['conversations', conversation], 'DELETE'))).status, 200); assert.deepEqual (calls[0].body, { p_actor : actor, p_conversation : conversation }); });
});
