import { strict as assert } from 'node:assert';
import { CreateAccountActiveCheck, CreateBrowserConnectionIdentity, CreateBrowserIdentity, CreateResourceVerifier } from '../agent-mcp/identity.js';

const resource = 'https://auto3d.example/mcp';
const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const grantId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe ('MCP verified identity', function () {
    it ('accepts only a valid resource-scoped provider result for an active account', async function () {
        let active = true; let result = { audience : resource, userId, props : { grantId, authorizedAt : 90000 }, scope : ['auto3d.read'], expiresAt : 200 };
        const verify = CreateResourceVerifier ({ resource, validateToken : async (audience, token) => { assert.equal (audience, resource); assert.equal (token, 'opaque-token'); return result; }, isAccountActive : async (id, issued) => { assert.equal (id, userId); assert.equal (issued, 90000); return active; }, now : () => 100000 });
        assert.deepEqual (await verify ('opaque-token'), { accountId : userId, grantId, scopes : ['auto3d.read'], expiresAt : 200000, client : { name : 'Agent', domain : null } });
        active = false; await assert.rejects (() => verify ('opaque-token')); active = true;
        for (const change of [{ audience : 'https://foreign.example/mcp' }, { userId : 'foreign' }, { props : {} }, { scope : ['auto3d.write'] }, { scope : ['auto3d.read', 'auto3d.write'] }, { expiresAt : 100 }]) { const saved = result; result = { ...result, ...change }; await assert.rejects (() => verify ('opaque-token')); result = saved; }
    });
    it ('does not trust a browser account header and respects the logout cookie', async function () {
        const identity = CreateBrowserIdentity ({});
        assert.equal (await identity (new Request ('https://auto3d.example', { headers : { 'X-Auto3D-Account' : userId } })), null);
        assert.equal (await identity (new Request ('https://auto3d.example', { headers : { Cookie : '__Host-auto3d-access=token; __Host-auto3d-logged-out=1' } })), null);
    });
    it ('invalidates grants for disabled, reset, banned, deleted or unavailable accounts', async function () {
        const original = globalThis.fetch; let user = { id : userId, email_confirmed_at : '2026-01-01T00:00:00Z' }, rows = [];
        globalThis.fetch = async url => String (url).includes ('/auth/v1/admin/users/') ? new Response (JSON.stringify (user), { headers : { 'Content-Type' : 'application/json' } }) : new Response (JSON.stringify (rows), { headers : { 'Content-Type' : 'application/json' } });
        try {
            const active = CreateAccountActiveCheck ({ SUPABASE_URL : 'https://supabase.example', SUPABASE_SECRET_KEY : 'sb_secret_test' }, { now : () => Date.parse ('2026-11-01T00:00:00Z') });
            const issued = Date.parse ('2026-10-01T00:00:00Z'); assert.equal (await active (userId, issued), true);
            rows = [{ disabled : true }]; assert.equal (await active (userId, issued), false);
            rows = [{ disabled : false, sessions_after : '2026-10-02T00:00:00Z' }]; assert.equal (await active (userId, issued), false);
            rows = []; user = { ...user, banned_until : '2027-01-01T00:00:00Z' }; assert.equal (await active (userId, issued), false);
            user = { ...user, banned_until : null, deleted_at : '2026-10-01T00:00:00Z' }; assert.equal (await active (userId, issued), false);
            globalThis.fetch = async () => { throw new Error ('Unavailable'); }; await assert.rejects (() => active (userId, issued));
        } finally { globalThis.fetch = original; }
    });

    it ('binds a connection to the verified authentication session without exposing the token', async () => {
        const original = globalThis.fetch; const sessionId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; const payload = Buffer.from (JSON.stringify ({ session_id : sessionId })).toString ('base64url'); const token = 'header.' + payload + '.signature';
        globalThis.fetch = async url => String (url).includes ('/auth/v1/user') ? new Response (JSON.stringify ({ id : userId, email : 'user@example.test' })) : new Response ('true');
        try {
            const identity = CreateBrowserConnectionIdentity ({ SUPABASE_URL : 'https://supabase.example', SUPABASE_SECRET_KEY : 'sb_secret_test' });
            const user = await identity (new Request ('https://auto3d.example', { headers : { Cookie : '__Host-auto3d-access=' + token } })); assert.equal (user.id, userId); assert.match (user.sessionFingerprint, /^[0-9a-f]{64}$/); assert.ok (!JSON.stringify (user).includes (token)); assert.ok (!JSON.stringify (user).includes (sessionId));
        } finally { globalThis.fetch = original; }
    });

});
