import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryService, ValidateMetadata } from '../library-service.mjs';

const id = '577a8d6f-85d7-456d-bb75-4946af3c364b';
const metadata = { id, name : 'Bottle', category : 'Primary products', kind : 'model', objectCount : 1 };

function adapter ()
{
    const calls = [];
    return {
        calls,
        List : async () => [{ id }],
        Get : async (value) => value === id ? { id } : null,
        Download : async () => null,
        Publish : async (item, archive, thumbnail, actor) => { calls.push ({ item, archive, thumbnail, actor }); return { id : item.id, createdBy : actor.subject }; },
        Delete : async (value) => { calls.push ({ deleted : value }); return true; }
    };
}

const publisher = async () => ({ subject : 'user-1', roles : ['Auto3D.Publisher'] });
const admin = async () => ({ subject : 'admin-1', roles : ['Auto3D.Admin'] });
const reader = async () => ({ subject : 'reader-1', roles : ['Auto3D.Reader'] });

test ('validates publish metadata', () => {
    assert.equal (ValidateMetadata (metadata).name, 'Bottle');
    assert.throws (() => ValidateMetadata ({ ...metadata, id : '../bad' }), /Invalid library id/);
    assert.throws (() => ValidateMetadata ({ ...metadata, objectCount : 0 }), /Object count/);
});

test ('publishing requires an Entra publisher role', async () => {
    const store = adapter (); const service = new LibraryService (store, {}, publisher);
    const result = await service.Publish ('Bearer token', metadata, Buffer.from ('archive'), Buffer.from ('png'));
    assert.equal (result.createdBy, 'user-1');
    assert.equal (store.calls.length, 1);

    const denied = new LibraryService (adapter (), {}, reader);
    await assert.rejects (() => denied.Publish ('Bearer token', metadata, Buffer.from ('a'), Buffer.from ('b')), /Insufficient/);
});

test ('delete requires an admin role', async () => {
    const denied = new LibraryService (adapter (), {}, publisher);
    await assert.rejects (() => denied.Delete ('Bearer token', id), /Insufficient/);
    const store = adapter (); const allowed = new LibraryService (store, {}, admin);
    assert.equal (await allowed.Delete ('Bearer token', id), true);
    assert.equal (store.calls[0].deleted, id);
});

test ('publish rejects oversized archives before storage', async () => {
    const store = adapter (); const service = new LibraryService (store, {}, publisher);
    const large = { byteLength : 64 * 1024 * 1024 + 1 };
    await assert.rejects (() => service.Publish ('Bearer token', metadata, large, Buffer.from ('x')), /64 MB/);
    assert.equal (store.calls.length, 0);
});
