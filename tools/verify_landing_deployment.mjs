import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const origin = new URL (process.argv[2]);
const request = (path, options = {}) => fetch (new URL (path, origin), { cache : 'no-store', signal : AbortSignal.timeout (15000), ...options });
const version = await (await request ('/version.json?landing=' + Date.now ())).json ();
const expected = JSON.parse (await readFile (new URL ('../package.json', import.meta.url), 'utf8')).version;
assert.equal (version.version, expected);
const script = await (await request (version.script)).text ();
for (const marker of ['entry_frame_flash', 'entry_heading_ink', 'entry_login', 'entry_intro_mark', 'entry_agent', 'Engineering intelligence.', 'Flat pulp sheet', 'visiblePoints', 'engineering-print-v1', 'entry_materials', 'Printed liner', 'Corrugated core', 'landing.demo.playback', 'auth.continue', '/api/auth/']) {
    assert.ok (script.includes (marker), 'Missing landing/login feature: ' + marker);
}
assert.ok (!script.includes ('Sign-in fields are disabled here.'), 'Preview credentials must not ship');
const css = await (await request ('/o3dv/o3dv.website.min.css?v=' + version.assetDigest)).text ();
for (const marker of ['entry_frame_flash', '--entry-login-flash', 'entry_heading_ink', 'entry_agent', 'entry_material_label']) { assert.ok (css.includes (marker), 'Missing presentation style: ' + marker); }
const session = await request ('/api/auth/session');
assert.equal (session.status, 200); assert.deepEqual (await session.json (), { user : null });
assert.ok ((session.headers.get ('cache-control') || '').includes ('no-store'));
// Empty credentials are rejected before contacting the identity provider or creating a session.
const invalid = await request ('/api/auth/login', { method : 'POST', headers : { Origin : origin.origin, 'Content-Type' : 'application/json' }, body : '{}' });
assert.equal (invalid.status, 400); assert.match ((await invalid.json ()).error, /valid email and password/);
assert.ok (!invalid.headers.get ('set-cookie'));
const protectedResource = await request ('/api/personal/items');
assert.equal (protectedResource.status, 401);
assert.ok ((protectedResource.headers.get ('cache-control') || '').includes ('no-store'));
console.log ('Landing release verified: ' + expected + '; full card entrance, packaging sequence, printed finishes, material leaders and existing account routes present; unsigned workspace access denied.');
