import assert from 'node:assert/strict';
import { AccessCookie } from '../functions/_lib/auth.js';
import { ValidateModalSettings, ReadModalConnection, TestModalConnection, ModalProfile } from '../functions/_lib/modalconnection.js';
import { onRequest } from '../functions/api/connections/modal.js';
import { ModalConnectionRequest, RemoveModalConnection } from '../source/website/modalconnection.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const access = 'head.' + Buffer.from (JSON.stringify ({ session_id : owner })).toString ('base64url') + '.signature';
const settings = (purpose = 'runtime') => ({ workspace : 'acme', environment : 'main', app : 'cloud-3d-studio', endpoint : purpose === 'runtime' ? 'https://acme--cloud-3d-studio-cad-gateway.modal.run' : '', tokenId : purpose === 'runtime' ? 'wk-fixture123456' : 'ak-fixture123456', tokenSecret : purpose === 'runtime' ? 'ws-privatefixture123456' : 'as-privatefixture123456' });
const identity = () => ({ service : 'cloud-3d-studio', protocol : 1, workspace : 'acme', environment : 'main', app : 'cloud-3d-studio', version : '0.2.0', conversionReady : false });
const env = () => ({ SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_fixture', AUTO3D_MODAL_PROFILE : 'preview', CF_PAGES_BRANCH : 'feature' });
function context (environment, method = 'GET', body, headers = {})
{
    return { env : environment, data : { user : { id : owner } }, request : new Request ('https://auto3d.test/api/connections/modal', { method, headers : { Origin : 'https://auto3d.test', Cookie : AccessCookie + '=' + access, 'X-Auto3D-Account' : owner, 'Content-Type' : 'application/json', ...headers }, ...(body !== undefined ? { body : JSON.stringify (body) } : {}) }) };
}
describe ('Supabase Vault Modal credential bridge', () => {
    let original, records, calls, admin, active, upstream;
    beforeEach (() => {
        original = globalThis.fetch; records = new Map (); calls = []; admin = active = true; upstream = () => Response.json (identity ());
        globalThis.fetch = async (url, init = {}) => {
            url = String (url); calls.push ({ url, init });
            assert.notEqual (init.redirect, 'error', 'server fetch must support workerd');
            if (url.endsWith ('/user')) { return Response.json ({ id : owner, email : 'admin@example.com', email_confirmed_at : '2026-10-08' }); }
            if (url.endsWith ('auto3d_session_active')) { return Response.json (active); }
            if (url.includes ('auto3d_admin_emails')) { return Response.json (admin ? [{ email : 'admin@example.com' }] : []); }
            if (url.includes ('/rpc/auto3d_modal_connection_')) {
                const body = JSON.parse (init.body), key = body.p_profile + '/' + body.p_purpose, record = records.get (key);
                assert.equal (init.headers.apikey, 'sb_secret_fixture');
                if (url.endsWith ('_read')) { return Response.json (record ?? null); }
                if ((record?.revision ?? null) !== body.p_expected_revision) { return Response.json ({ message : 'private database detail' }, { status : 409 }); }
                if (url.endsWith ('_save')) {
                    const revision = crypto.randomUUID (); records.set (key, { schema : 1, profile : body.p_profile, purpose : body.p_purpose, settings : body.p_settings, revision });
                    return Response.json ({ revision });
                }
                if (url.endsWith ('_delete')) { records.delete (key); return Response.json ({}); }
            }
            if (url.startsWith ('https://acme--')) { return upstream (url, init); }
            throw new Error ('Unexpected test request');
        };
    });
    afterEach (() => { globalThis.fetch = original; });
    const save = (environment, purpose = 'runtime', revision = null) => onRequest (context (environment, 'PUT', { purpose, revision, settings : settings (purpose) }));

    it ('requires an explicit server profile and prevents cross-environment fallback', () => {
        assert.equal (ModalProfile (env ()), 'preview');
        for (const value of [{}, { AUTO3D_MODAL_PROFILE : 'production', CF_PAGES_BRANCH : 'draft' }, { AUTO3D_MODAL_PROFILE : 'preview', CF_PAGES_BRANCH : 'main' }]) { assert.throws (() => ModalProfile (value), error => error.code === 'MODAL_PROFILE_MISSING'); }
    });
    it ('rejects swapped token types, missing pairs and arbitrary outbound destinations', () => {
        assert.deepEqual (ValidateModalSettings (settings (), 'runtime'), settings ());
        for (const value of [{ ...settings (), tokenId : settings ('deployment').tokenId }, { ...settings (), tokenSecret : '' }, { ...settings (), extra : true }]) { assert.throws (() => ValidateModalSettings (value, 'runtime')); }
        for (const endpoint of ['http://acme--gateway.modal.run', 'https://127.0.0.1', 'https://acme--gateway.modal.run.evil.test', 'https://x.modal.run', 'https://acme--gateway.modal.run/path', 'https://acme--gateway.modal.run?x=1', 'https://user:secret@acme--gateway.modal.run', 'https://acme--gateway.modal.run:443']) { assert.throws (() => ValidateModalSettings ({ ...settings (), endpoint }, 'runtime')); }
    });
    it ('saves complete pairs separately and returns only credential-free metadata', async () => {
        const environment = env ();
        let response = await save (environment); assert.equal (response.status, 200); assert.ok (!(await response.text ()).includes (settings ().tokenSecret));
        assert.equal ((await save (environment, 'deployment')).status, 200);
        response = await onRequest (context (environment)); const dto = await response.json ();
        assert.equal (dto.runtime.saved, true); assert.equal (dto.deployment.saved, true); assert.equal (dto.profile, 'preview');
        const text = JSON.stringify (dto); for (const purpose of ['runtime', 'deployment']) { assert.ok (!text.includes (settings (purpose).tokenId)); assert.ok (!text.includes (settings (purpose).tokenSecret)); }
        assert.equal (records.size, 2);
    });
    it ('blocks non-admins, revoked sessions, account mismatch and foreign-origin mutations before storage', async () => {
        const environment = env ();
        admin = false; assert.equal ((await save (environment)).status, 403); admin = true;
        active = false; assert.equal ((await save (environment)).status, 401); active = true;
        assert.equal ((await onRequest (context (environment, 'PUT', {}, { Origin : 'https://evil.test' }))).status, 403);
        assert.equal ((await onRequest (context (environment, 'GET', undefined, { 'X-Auto3D-Account' : other }))).status, 409);
        assert.equal (records.size, 0); assert.ok (!calls.some (call => call.url.includes ('auto3d_modal_connection_')));
    });
    it ('bounds and strictly validates mutation bodies without storing partial credentials', async () => {
        const environment = env ();
        for (const body of [{ purpose : 'runtime', revision : null }, { purpose : 'other', revision : null, settings : settings () }, { purpose : 'runtime', revision : 'bad', settings : settings () }, { purpose : 'runtime', revision : null, settings : { ...settings (), tokenSecret : '' } }, { purpose : 'runtime', revision : null, settings : settings (), key : 'extra' }]) {
            assert.equal ((await onRequest (context (environment, 'PUT', body))).status, 400);
        }
        assert.equal ((await onRequest (context (environment, 'PUT', { padding : 'x'.repeat (9000) }))).status, 413);
        assert.equal (records.size, 0);
    });
    it ('protects rotation and removal against stale administrator windows', async () => {
        const environment = env (); const initial = await (await save (environment)).json ();
        assert.equal ((await save (environment)).status, 409);
        const next = await (await save (environment, 'runtime', initial.revision)).json (); assert.notEqual (initial.revision, next.revision);
        assert.equal ((await onRequest (context (environment, 'DELETE', { purpose : 'runtime', revision : initial.revision }))).status, 409);
        assert.equal ((await onRequest (context (environment, 'DELETE', { purpose : 'runtime', revision : next.revision }))).status, 200);
        assert.equal (records.size, 0);
    });
    it ('uses only saved runtime tokens on the server and verifies the target without conversion', async () => {
        const environment = env (); await save (environment); await save (environment, 'deployment');
        upstream = (url, init) => {
            assert.equal (url, settings ().endpoint + '/connection'); assert.equal (init.headers['Modal-Key'], settings ().tokenId); assert.equal (init.headers['Modal-Secret'], settings ().tokenSecret); assert.equal (init.redirect, 'manual');
            return Response.json ({ ...identity (), secret : settings ().tokenSecret });
        };
        const response = await onRequest (context (environment, 'POST', {})); assert.equal (response.status, 200);
        const dto = await response.json (); assert.equal (dto.connected, true); assert.equal (dto.conversionReady, false); assert.ok (!JSON.stringify (dto).includes (settings ().tokenSecret));
        assert.equal (calls.filter (call => call.url.startsWith ('https://acme--')).length, 1);
    });
    it ('distinguishes auth, missing endpoint, network, mismatched identity and malformed responses', async () => {
        const environment = env (); await save (environment);
        for (const [handler, code] of [
            [() => Response.json ({ detail : settings ().tokenSecret }, { status : 403 }), 'MODAL_AUTH_REJECTED'],
            [() => new Response (null, { status : 404 }), 'MODAL_ENDPOINT_UNAVAILABLE'],
            [() => new Response (null, { status : 302, headers : { Location : 'https://evil.test' } }), 'MODAL_NETWORK_FAILED'],
            [() => { throw new Error (settings ().tokenSecret); }, 'MODAL_NETWORK_FAILED'],
            [() => Response.json ({ ...identity (), environment : 'wrong' }), 'MODAL_TARGET_MISMATCH'],
            [() => Response.json ({ ...identity (), conversionReady : true }), 'MODAL_RESPONSE_INVALID'],
            [() => new Response ('x'.repeat (17000)), 'MODAL_RESPONSE_INVALID']
        ]) {
            upstream = handler; const response = await onRequest (context (environment, 'POST', {})); assert.equal (response.status, 502);
            const dto = await response.json (); assert.equal (dto.code, code); assert.ok (!JSON.stringify (dto).includes (settings ().tokenSecret));
        }
    });
    it ('fails closed on corrupt/copied Vault records and never substitutes deployment tokens', async () => {
        const environment = env (); await save (environment, 'deployment');
        await assert.rejects (() => TestModalConnection (environment), error => error.code === 'MODAL_NOT_CONFIGURED');
        records.set ('preview/runtime', { schema : 1, profile : 'production', purpose : 'runtime', settings : settings (), revision : crypto.randomUUID () });
        await assert.rejects (() => ReadModalConnection (environment, 'runtime'), error => error.code === 'MODAL_STORAGE_UNAVAILABLE');
        assert.ok (!calls.some (call => call.url.startsWith ('https://acme--')));
    });
});

describe ('Modal client and agent contract', () => {
    let original; beforeEach (() => { original = globalThis.fetch; }); afterEach (() => { globalThis.fetch = original; });
    const website = () => ({ auth : { user : { id : owner } }, accountReady : true, sessionEditor : { readOnly : false } });
    it ('does not echo response errors and drops credential fields from status', async () => {
        const site = website (); globalThis.fetch = async () => Response.json ({ error : settings ().tokenSecret, code : 'MODAL_AUTH_REJECTED' }, { status : 502 });
        await assert.rejects (() => ModalConnectionRequest (site, 'POST', {}), error => !error.message.includes (settings ().tokenSecret) && error.code === 'unavailable');
        globalThis.fetch = async () => Response.json ({ profile : 'preview', runtime : { saved : true, tokenSecret : settings ().tokenSecret }, deployment : { saved : false } });
        assert.ok (!JSON.stringify (await ModalConnectionRequest (site)).includes (settings ().tokenSecret));
    });
    it ('refuses account changes and read-only writes', async () => {
        const site = website (); site.sessionEditor.readOnly = true;
        await assert.rejects (() => ModalConnectionRequest (site, 'PUT', {}), /read-only/);
        globalThis.fetch = async () => { site.auth.user.id = other; return Response.json ({}); };
        await assert.rejects (() => ModalConnectionRequest (site), /Sign in again/);
    });
    it ('offers strict credential-free commands and awaits the shared removal service', async () => {
        const site = website (), registry = CreateAgentCommands (site); let deleted = false;
        globalThis.fetch = async (url, init) => {
            if (init.method === 'DELETE') { deleted = true; const body = JSON.parse (init.body); assert.ok (['runtime', 'deployment'].includes (body.purpose)); assert.equal (body.revision, null); return Response.json ({ saved : false }); }
            return Response.json ({ profile : 'preview', runtime : { saved : false }, deployment : { saved : false } });
        };
        assert.equal ((await registry.Execute ('admin.modal.inspect', { tokenSecret : 'never-accepted' })).ok, false);
        assert.equal ((await registry.Execute ('admin.modal.remove', { purpose : 'runtime' })).ok, true); assert.equal (deleted, true);
        assert.equal ((await registry.Execute ('admin.modal.remove', { purpose : 'unknown' })).ok, false);
        assert.equal (registry.Catalog ().filter (command => command.id.startsWith ('admin.modal.')).length, 4);
        assert.equal ((await RemoveModalConnection (site, 'deployment')).saved, false);
    });
});
