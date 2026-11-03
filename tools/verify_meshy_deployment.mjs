import assert from 'node:assert/strict';
const origin = new URL (process.argv[2]);
const request = (path, options = {}) => fetch (new URL (path, origin), { cache : 'no-store', signal : AbortSignal.timeout (15000), ...options });
const version = await (await request ('/version.json?meshy=' + Date.now ())).json ();
assert.equal (version.version, '0.47.3');
const script = await (await request (version.script)).text ();
for (const marker of ['Manage Meshy key', '/api/ai/credentials', 'ai.connection.open']) { assert.ok (script.includes (marker), 'Missing Meshy UI/command: ' + marker); }
for (const method of ['GET', 'PUT', 'DELETE']) {
    // No cookie or key: mutations must fail before any credential record is touched.
    const response = await request ('/api/ai/credentials', { method, headers : { Origin : origin.origin, 'Content-Type' : 'application/json' }, ...(method === 'PUT' ? { body : '{}' } : {}) });
    assert.equal (response.status, 401, method + ' must require authentication');
    assert.ok ((response.headers.get ('cache-control') || '').includes ('no-store'));
    const body = await response.json (); assert.equal (typeof body.error, 'string');
}
console.log ('Meshy live deployment verified: 0.47.3 UI/commands present; GET/PUT/DELETE require authentication and return no-store.');
