import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const origin = new URL (process.argv[2]);
const request = (path, options = {}) => fetch (new URL (path, origin), { cache : 'no-store', signal : AbortSignal.timeout (15000), ...options });
const version = await (await request ('/version.json?meshy=' + Date.now ())).json ();
const expectedVersion = JSON.parse (await readFile (new URL ('../package.json', import.meta.url), 'utf8')).version;
assert.equal (version.version, expectedVersion);
const script = await (await request (version.script)).text ();
for (const marker of ['Manage Meshy key', '/api/ai/credentials', '/api/ai/shared-credential', 'ai.connection.open', 'ai.shared_connection.inspect', 'ai.creation.revise', 'multi-image-to-3d']) { assert.ok (script.includes (marker), 'Missing Meshy UI/command: ' + marker); }
for (const [path, method] of ['/api/ai/credentials', '/api/ai/shared-credential'].flatMap (path => ['GET', 'PUT', 'DELETE'].map (method => [path, method]))) {
    // No cookie or key: mutations must fail before any credential record is touched.
    const response = await request (path, { method, headers : { Origin : origin.origin, 'Content-Type' : 'application/json' }, ...(method === 'PUT' ? { body : '{}' } : {}) });
    assert.equal (response.status, 401, method + ' ' + path + ' must require authentication');
    assert.ok ((response.headers.get ('cache-control') || '').includes ('no-store'));
    const body = await response.json (); assert.equal (typeof body.error, 'string');
}
console.log ('Meshy live deployment verified: ' + expectedVersion + ' UI/commands present; personal and shared key GET/PUT/DELETE require authentication and return no-store.');
