import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/share/[[path]].js';
const id = '577a8d6f-85d7-456d-bb75-4946af3c364b';
const context = (body, path = []) => ({ env : {}, params : { path }, request : new Request ('https://app.example/api/share', { method : 'POST', body : typeof body === 'string' ? body : JSON.stringify (body) }) });
describe ('Share request boundary', () => {
    it ('rejects PIN link creation before any database write when protection is not configured', async () => {
        const fetch = global.fetch; let calls = 0; global.fetch = async () => { calls++; throw new Error ('unexpected fetch'); };
        try { assert.equal ((await onRequest (context ({ itemId : id, code : '0123' }))).status, 503); assert.equal (calls, 0); }
        finally { global.fetch = fetch; }
    });
    it ('bounds bodies and rejects malformed fields and numeric PINs before storage access', async () => {
        for (const body of ['{', 'null', '[]', { itemId : id, code : 1234 }, { itemId : id, allowDownload : 'true' }, { itemId : id, extra : true }]) { assert.equal ((await onRequest (context (body))).status, 400); }
        assert.equal ((await onRequest (context ('x'.repeat (5000)))).status, 413);
        assert.equal ((await onRequest (context ({ code : '1234', extra : true }, [id, 'archive']))).status, 400);
    });
});
