import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/audience/[[path]].js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { AudienceHash, AudienceOptions, AudienceCode } from '../functions/_lib/audienceshares.js';
import { NewShareCode } from '../source/website/audiencesharing.js';
const owner = '11111111-1111-4111-8111-111111111111', item = '22222222-2222-4222-8222-222222222222';
describe ('Protected audience sharing', () => {
    let savedFetch, env, shares, files, attempts, reads;
    beforeEach (() => {
        savedFetch = global.fetch; shares = []; files = new Map (); attempts = 0; reads = 0;
        files.set ('users/' + owner + '/' + item + '/session.auto3d', new Uint8Array ([80, 75, 3, 4, 7]));
        env = { SUPABASE_URL : 'https://fixture.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test', AUTO3D_AUDIENCE_SHARING_READY : 'true', AUTO3D_AUDIENCE_SECRET : 'a'.repeat (40), AUTO3D_LIBRARY_R2 : { async get (key) { reads++; return files.has (key) ? { body : files.get (key) } : null; }, async put (key, value) { files.set (key, new Uint8Array (await new Response (value).arrayBuffer ())); }, async delete (key) { files.delete (key); } } };
        global.fetch = async (url, options = {}) => {
            const parsed = new URL (url); const body = options.body ? JSON.parse (options.body) : null;
            if (parsed.pathname.endsWith ('auto3d_personal_library')) { return Response.json (parsed.searchParams.get ('user_id') === 'eq.' + owner ? [{ id : item, name : 'REDCON fixture', archive_key : 'users/' + owner + '/' + item + '/session.auto3d' }] : []); }
            if (parsed.pathname.endsWith ('auto3d_reserve_audience_share')) { shares.push ({ token : body.p_token, owner_id : body.p_owner, name : body.p_name, source : body.p_source, source_item_id : body.p_item, code_hash : body.p_hash, archive_key : 'audience/' + body.p_owner + '/' + body.p_token + '/session.auto3d', status : 'pending', expires_at : new Date (Date.now () + body.p_days * 86400000).toISOString (), allow_download : body.p_download }); return Response.json (null); }
            if (parsed.pathname.endsWith ('auto3d_verify_audience_share')) { const row = shares.find (s => s.token === body.p_token && s.status === 'ready' && Date.parse (s.expires_at) > Date.now ()); if (!row) { return Response.json ([]); } if (attempts >= 5) { return Response.json ([{ retry_after : 1800 }]); } if (row.code_hash !== body.p_hash) { attempts++; return Response.json (attempts === 5 ? [{ retry_after : 1800 }] : []); } return Response.json ([{ archive_key : row.archive_key, name : row.name, allow_download : row.allow_download, retry_after : 0 }]); }
            assert.ok (parsed.pathname.endsWith ('auto3d_audience_shares'), url);
            const selected = shares.filter (row => ['token', 'owner_id', 'status'].every (key => !parsed.searchParams.has (key) || parsed.searchParams.get (key) === 'eq.' + row[key]));
            if (options.method === 'PATCH') { selected.forEach (s => Object.assign (s, body)); }
            if (options.method === 'DELETE') { shares = shares.filter (s => !selected.includes (s)); }
            return Response.json (selected);
        };
    });
    afterEach (() => { global.fetch = savedFetch; });
    const context = (env, method, path = [], body, user = { id : owner }) => ({ env, data : { user }, params : { path }, request : new Request ('https://app.test/api/audience' + (path.length ? '/' + path.join ('/') : ''), { method, headers : { Origin : 'https://app.test', 'CF-Connecting-IP' : '192.0.2.1', 'Content-Type' : 'application/json' }, body : body === undefined ? undefined : JSON.stringify (body) }) });
    it ('creates an independent private snapshot with a generated four-digit code and QR-ready mini link', async () => {
        const response = await onRequest (context (env, 'POST', [], { source : 'account', itemId : item })); assert.equal (response.status, 201); const result = await response.json ();
        assert.match (result.code, /^\d{4}$/); assert.match (result.url, /^https:\/\/app.test\/mini.html\?share=/); assert.equal (result.codeRequired, true); assert.equal (result.allowDownload, false);
        assert.notEqual (shares[0].code_hash, result.code); assert.equal (shares[0].code_hash, await AudienceHash (env, 'code:' + result.token + ':' + result.code)); assert.ok (files.has (shares[0].archive_key));
        const info = await (await onRequest (context (env, 'GET', [result.token], undefined, null))).json (); assert.equal (info.name, 'REDCON fixture'); assert.equal ('archive_key' in info, false); assert.equal ('code_hash' in info, false); assert.equal ('owner_id' in info, false);
        assert.equal ((await onRequest (context (env, 'POST', [result.token, 'archive'], { code : result.code }, null))).status, 200);
        assert.equal ((await onRequest (context (env, 'POST', [result.token, 'download'], { code : result.code }, null))).status, 403);
    });
    it ('fails closed without readiness, rejects foreign ownership and validates codes before file access', async () => {
        const request = context (env, 'POST', [], { source : 'account', itemId : item, code : '0000' });
        env.AUTO3D_AUDIENCE_SHARING_READY = 'false'; assert.equal ((await onRequest (request)).status, 503); assert.equal (reads, 0);
        env.AUTO3D_AUDIENCE_SHARING_READY = 'true'; assert.equal ((await onRequest (context (env, 'POST', [], { source : 'account', itemId : item, code : '0000' }, { id : item }))).status, 404); assert.equal (reads, 0);
        for (const body of [{ source : 'account', itemId : item, code : 1234 }, { source : 'account', itemId : item, code : '123' }, { source : 'account', itemId : item, owner_id : item }, { source : 'device', itemId : 'x', expiresDays : 100 }]) { assert.equal ((await onRequest (context (env, 'POST', [], body))).status, 400); }
        assert.equal (shares.length, 0);
    });
    it ('returns lockout status without reading private bytes and revokes owner snapshots', async () => {
        const result = await (await onRequest (context (env, 'POST', [], { source : 'account', itemId : item, code : '0123' }))).json (); reads = 0;
        for (let i = 0; i < 4; i++) { assert.equal ((await onRequest (context (env, 'POST', [result.token, 'archive'], { code : '9999' }, null))).status, 401); }
        const lock = await onRequest (context (env, 'POST', [result.token, 'archive'], { code : '9999' }, null)); assert.equal (lock.status, 429); assert.equal (lock.headers.get ('Retry-After'), '1800'); assert.equal (reads, 0);
        assert.equal ((await onRequest (context (env, 'DELETE', [result.token], undefined, { id : item }))).status, 404);
        assert.equal ((await onRequest (context (env, 'DELETE', [result.token]))).status, 200); assert.equal (files.has (shares[0].archive_key), false);
        assert.equal ((await onRequest (context (env, 'GET', [result.token], undefined, null))).status, 404);
    });
    it ('does not resurrect a link revoked while its snapshot is uploading', async () => {
        const put = env.AUTO3D_LIBRARY_R2.put; env.AUTO3D_LIBRARY_R2.put = async (key, value) => { shares[0].status = 'revoked'; return put (key, value); };
        const response = await onRequest (context (env, 'POST', [], { source : 'account', itemId : item, code : '0123' })); assert.equal (response.status, 409);
        assert.equal (shares.length, 0); assert.equal ([...files.keys ()].some (key => key.startsWith ('audience/')), false);
    });
    it ('opens only exact audience challenge routes to guests, keeping owner and other APIs authenticated', async () => {
        const token = '33333333-3333-4333-8333-333333333333'; const invoke = c => middleware ({ ...c, next : async () => new Response ('next') });
        assert.equal ((await invoke (context (env, 'GET', [token], undefined, null))).status, 200);
        assert.equal ((await invoke (context (env, 'POST', [token, 'archive'], { code : '0000' }, null))).status, 200);
        assert.equal ((await invoke (context (env, 'GET', [], undefined, null))).status, 401);
        assert.equal ((await invoke (context (env, 'DELETE', [token], undefined, null))).status, 401);
        const foreign = context (env, 'POST', [token, 'archive'], { code : '0000' }, null); foreign.request.headers.set ('Origin', 'https://foreign.test'); assert.equal ((await invoke (foreign)).status, 403);
        env.AUTO3D_AUDIENCE_SHARING_READY = 'false'; assert.equal ((await invoke (context (env, 'GET', [token], undefined, null))).status, 401);
    });
    it ('generates leading-zero-safe codes and rejects unsupported options', () => { for (let i = 0; i < 50; i++) { assert.match (NewShareCode (), /^\d{4}$/); assert.match (AudienceCode (), /^\d{4}$/); } assert.throws (() => AudienceOptions ({ source : 'account', itemId : item, code : '' })); });
});
