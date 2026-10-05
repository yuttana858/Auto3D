import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { CreateServer } from '../server.mjs';

const id = '577a8d6f-85d7-456d-bb75-4946af3c364b';

async function withServer (service, action)
{
    const server = CreateServer (service); server.listen (0, '127.0.0.1'); await once (server, 'listening');
    try { await action ('http://127.0.0.1:' + server.address ().port); } finally { server.close (); await once (server, 'close'); }
}

test ('serves public library reads', async () => {
    const service = { List : async () => [{ id, name : 'Model' }], Get : async () => ({ id }), Download : async () => null };
    await withServer (service, async (base) => {
        const list = await fetch (base + '/api/library/items'); assert.equal (list.status, 200); assert.equal ((await list.json ())[0].id, id);
        const item = await fetch (base + '/api/library/items/' + id); assert.equal (item.status, 200); assert.equal ((await item.json ()).id, id);
    });
});

test ('returns 404 for unknown routes', async () => {
    await withServer ({}, async (base) => { assert.equal ((await fetch (base + '/nope')).status, 404); });
});

test ('accepts multipart publishing and forwards bearer identity', async () => {
    let received;
    const service = { Publish : async (authorization, metadata, archive, thumbnail) => { received = { authorization, metadata, archive, thumbnail }; return { id : metadata.id }; } };
    await withServer (service, async (base) => {
        const form = new FormData (); form.set ('metadata', JSON.stringify ({ id, name : 'A', category : 'Accessories', kind : 'model', objectCount : 1 }));
        form.set ('archive', new Blob ([Buffer.from ('abc')], { type : 'application/octet-stream' }), 'session.auto3d');
        form.set ('thumbnail', new Blob ([Buffer.from ('png')], { type : 'image/png' }), 'thumbnail.png');
        const response = await fetch (base + '/api/library/items', { method : 'POST', headers : { Authorization : 'Bearer test' }, body : form });
        assert.equal (response.status, 201); assert.equal (received.authorization, 'Bearer test'); assert.equal (received.archive.toString (), 'abc');
    });
});
