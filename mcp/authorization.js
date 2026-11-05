import { OAuthAuthorizationServer, OAuthError } from '@cloudflare/workers-oauth-provider';
import { RequireAdmin } from '../functions/_lib/accounts.js';
import { AgentName, Identifier, Json, PilotConfig, ReadBytes, ReadJson, Scopes, ValidScopes } from './common.js';
import { ActiveRegistration, BrowserIdentity } from './identity.js';
import { CompleteAgentConsent } from './consent-completion.js';

const Escape = value => String (value).replace (/[&<>"']/g, char => '&#' + char.charCodeAt (0) + ';');
const Encode = value => new TextEncoder ().encode (value);
const NormalizeWindowCode = value => typeof value === 'string' ? value.trim ().toUpperCase ().replace (/-/g, '') : '';
const ValidWindowCode = value => /^[A-HJ-NP-Z2-9]{16}$/.test (NormalizeWindowCode (value));
function Page (html, headers = new Headers (), status = 200, validatedRedirectUri = null)
{
    headers = new Headers (headers); headers.set ('Content-Type', 'text/html; charset=utf-8'); headers.set ('Cache-Control', 'no-store');
    let formAction = '\'self\'';
    if (validatedRedirectUri) {
        // Chromium applies form-action to the POST's redirect too. Only use the
        // callback already validated by the OAuth provider, never raw query data.
        const callback = new URL (validatedRedirectUri);
        if (!['https:', 'http:'].includes (callback.protocol) || callback.username || callback.password) { throw new Error ('Invalid validated callback.'); }
        formAction += ' ' + callback.origin;
    }
    headers.set ('Content-Security-Policy', 'default-src \'none\'; form-action ' + formAction + '; frame-ancestors \'none\'; base-uri \'none\'');
    // no-referrer makes browser form POSTs serialize their Origin as "null".
    // Keep the same-origin Origin check working without leaking OAuth URLs cross-site.
    headers.set ('X-Content-Type-Options', 'nosniff'); headers.set ('Referrer-Policy', 'same-origin');
    return new Response ('<!doctype html><html><meta charset="utf-8"><title>Auto3D agent access</title><main>' + html + '</main></html>', { status, headers });
}
async function ConsentKey (env)
{
    const secret = env.AUTO3D_MCP_CONSENT_SECRET;
    if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test (secret)) { throw new Error ('Consent key unavailable.'); }
    return crypto.subtle.importKey ('raw', Encode (secret), { name : 'HMAC', hash : 'SHA-256' }, false, ['sign', 'verify']);
}
async function Binding (env, handle, accountId, expiresAt)
{
    const signature = new Uint8Array (await crypto.subtle.sign ('HMAC', await ConsentKey (env), Encode (JSON.stringify ([handle, accountId, expiresAt]))));
    return expiresAt + '.' + [...signature].map (byte => byte.toString (16).padStart (2, '0')).join ('');
}
export function AuthorizationProvider (env)
{
    const config = PilotConfig (env);
    return new OAuthAuthorizationServer ({
        issuer : config.issuer, resources : [config.resource], scopesSupported : [...Scopes],
        clientIdMetadataDocumentEnabled : true, clientRegistrationEndpoint : config.issuer + '/register',
        accessTokenTTL : 600, refreshTokenTTL : 86400, refreshTokenIdleTTL : 86400,
        tokenExchangeCallback : async options => {
            try { await ActiveRegistration (options.env, options.userId, options.props.registrationId); }
            catch { throw new OAuthError ('invalid_grant', { description : 'Agent access was revoked or expired.' }); }
        }
    });
}
export async function Consent (request, env, provider, identity = BrowserIdentity)
{
    if (!['GET', 'POST'].includes (request.method)) { return Page ('Method not allowed.', undefined, 405); }
    const config = PilotConfig (env);
    if (request.url.length > 8192) { return Page ('Request too large.', undefined, 400); }
    if (request.method === 'POST' && request.headers.get ('Origin') !== config.origin) { return Page ('Invalid origin.', undefined, 403); }
    const user = await identity (request, env);
    if (!user) {
        const params = [...new URL (request.url).searchParams];
        if (params.length > 30 || request.method !== 'GET') { return Page ('Sign in and start the connection again.', undefined, 401); }
        const hidden = params.map (([name, value]) => '<input type="hidden" name="' + Escape (name) + '" value="' + Escape (value) + '">').join ('');
        return Page ('<h1>Connect Auto3D</h1><p>Sign in to Auto3D in another tab, then continue here. An existing sign-in also needs this same-site continuation.</p><a href="/" target="_blank" rel="noopener noreferrer">Open Auto3D</a><p>After continuing, enter the app window code on the permissions page to pair this agent with your open Auto3D window.</p><form method="get">' + hidden + '<button type="submit">Continue to permissions</button></form>', undefined, 401);
    }
    const oauth = provider.getOAuthApi (env);
    if (request.method === 'GET') {
        if (request.url.length > 8192) { return Page ('Request too large.', undefined, 400); }
        const authRequest = await oauth.parseAuthRequest (request), details = await oauth.describeConsent (authRequest);
        if (!ValidScopes (authRequest.scope)) { return Page ('Only pilot read, write and optional screenshot access are supported.', undefined, 400); }
        const consent = await oauth.beginConsent (authRequest), expiresAt = Date.now () + 600000;
        const binding = await Binding (env, consent.handle, user.id, expiresAt);
        const writeWarning = authRequest.scope.includes ('auto3d.write') ? '<p><strong>Write access:</strong> this grant can use the full 250-command catalog, including tools that change the app and account or administrator controls. Account and administrator operations remain subject to Auto3D authorization.</p>' : '<p>Without write access, this grant can use only the basic read-only app tools.</p>';
        const captureWarning = authRequest.scope.includes ('auto3d.capture') ? '<p>Screenshot access is also requested. The connected app window must separately allow screenshots.</p>' : '';
        return Page ('<h1>Connect an agent</h1><p>Account: ' + Escape (user.email || user.id) + '</p><p>Client: ' + Escape (details.clientName) + '</p><p>' + (details.clientDomain ? 'Client domain: ' + Escape (details.clientDomain) : 'The client name is self-reported.') + '</p><p>Redirect host: ' + Escape (details.redirectHost) + '</p>' + (details.redirectIsLoopback ? '<p>A local application will receive this authorization.</p>' : '') + '<p>Permissions: ' + authRequest.scope.map (Escape).join (', ') + '. Read the session you select. Expires in 24 hours. You can revoke it in Agent access.</p>' + writeWarning + captureWarning + '<form method="post"><input type="hidden" name="handle" value="' + Escape (consent.handle) + '"><input type="hidden" name="binding" value="' + binding + '"><label>Registration name <input name="name" required maxlength="80" value="' + Escape (String (details.clientName).slice (0, 80)) + '"></label><label>Harness <select name="harness"><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option><option value="desktop">Desktop OAuth client</option><option value="cli">CLI with OAuth and PKCE</option><option value="other-oauth">Other OAuth client</option></select></label><label>App window code <input name="appWindowCode" required maxlength="19" autocomplete="off" placeholder="ABCD-EFGH-JKLM-NPQR"></label><p>Connect this app window in Agent access, then paste its current code to pair it with this agent. You can also allow access without pairing and select a session later.</p><button name="decision" value="approve">Allow and pair</button><button name="decision" value="approve-manual" formnovalidate>Allow without pairing</button><button name="decision" value="deny" formnovalidate>Deny</button></form>', consent.headers, 200, details.redirectUri);
    }
    if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test (request.headers.get ('Content-Type') || '')) { return Page ('Invalid form.', undefined, 400); }
    const form = new URLSearchParams (new TextDecoder ().decode (await ReadBytes (request, 8192)));
    const keys = ['handle', 'binding', 'name', 'harness', 'appWindowCode', 'decision'];
    if ([...form.keys ()].some (key => !keys.includes (key)) || keys.some (key => form.getAll (key).length !== 1)) { return Page ('Invalid form.', undefined, 400); }
    const handle = form.get ('handle'), parts = form.get ('binding').split ('.'), expiresAt = Number (parts[0]);
    if (handle.length > 512 || !Number.isSafeInteger (expiresAt) || expiresAt <= Date.now () || expiresAt > Date.now () + 600000 || !/^[a-f0-9]{64}$/.test (parts[1] || '') || parts.length !== 2) { return Page ('Consent expired.', undefined, 403); }
    const signature = Uint8Array.from (parts[1].match (/../g), byte => parseInt (byte, 16));
    if (!await crypto.subtle.verify ('HMAC', await ConsentKey (env), signature, Encode (JSON.stringify ([handle, user.id, expiresAt])))) { return Page ('Account changed. Start again.', undefined, 403); }
    if (form.get ('decision') === 'deny') { const denied = await oauth.denyConsent (request, handle); return new Response (null, { status : 302, headers : denied.headers }); }
    const decision = form.get ('decision');
    if (!['approve', 'approve-manual'].includes (decision)) { return Page ('Invalid decision.', undefined, 400); }
    const name = AgentName (form.get ('name')), harness = form.get ('harness'), appWindowCode = form.get ('appWindowCode');
    if (decision === 'approve' && !appWindowCode) { return Page ('Enter the current app window code to pair automatically, or choose Allow without pairing.', undefined, 400); }
    if (decision === 'approve' && !ValidWindowCode (appWindowCode)) { return Page ('The app window code is invalid. Copy the complete current code from Agent access, or choose Allow without pairing.', undefined, 400); }
    const broker = env.AUTO3D_AGENT_BROKER.getByName (user.id);
    if (decision === 'approve' && !await broker.CheckWindowCode ({ accountId : user.id, code : appWindowCode })) {
        return Page ('That window code is unavailable. In Auto3D, reconnect the app window and copy its new code. Use your browser Back button to return to the permission form and enter it, or choose Allow without pairing.', undefined, 400);
    }
    const approved = await oauth.approveConsent (request, handle);
    if (!ValidScopes (approved.request.scope)) { return Page ('Invalid scopes.', undefined, 403); }
    const registrationId = crypto.randomUUID ();
    const record = await broker.Register ({ accountId : user.id, id : registrationId, name, harness, clientId : approved.request.clientId, scopes : approved.request.scope, expiresAt : Date.now () + 86400000 });
    const result = await CompleteAgentConsent ({ broker, oauth, accountId : user.id, registrationId, record, approved, name, harness, decision, appWindowCode });
    if (result.error === 'pair') { return Page ('Could not pair with that app window. The code may be expired, already used, or disconnected. Reconnect the app window to generate a new code, then restart authorization.', undefined, 400); }
    if (result.error === 'completion') { return Page ('Agent authorization could not be completed. Reconnect the app window to generate a new code, then restart authorization.', undefined, 503); }
    approved.headers.set ('Location', result.redirectTo); return new Response (null, { status : 302, headers : approved.headers });
}
export async function ManageRegistrations (request, env)
{
    const url = new URL (request.url), config = PilotConfig (env);
    if (!['GET', 'POST'].includes (request.method)) { return Json ({ error : 'Method not allowed.' }, 405); }
    if (request.method === 'POST' && request.headers.get ('Origin') !== config.origin) { return Json ({ error : 'Invalid origin.' }, 403); }
    const user = await BrowserIdentity (request, env); if (!user) { return Json ({ error : 'Sign in.' }, 401); }
    if (request.headers.get ('X-Auto3D-Account') !== user.id) { return Json ({ error : 'Account changed.' }, 409); }
    const admin = url.pathname === '/api/agent/admin';
    if (admin) { await RequireAdmin ({ request, env }); }
    if ([...url.searchParams.keys ()].some (key => !admin || key !== 'accountId') || url.searchParams.getAll ('accountId').length > 1) { return Json ({ error : 'Invalid query.' }, 400); }
    let body = null;
    if (request.method === 'POST') { body = await ReadJson (request); }
    const accountId = admin ? Identifier (body?.accountId || url.searchParams.get ('accountId')) : user.id;
    if (!config.accounts.includes (accountId)) { return Json ({ error : 'Pilot account unavailable.' }, 403); }
    const broker = env.AUTO3D_AGENT_BROKER.getByName (accountId);
    if (request.method === 'GET') { return Json (await broker.Registrations (accountId)); }
    const allowed = admin ? ['accountId', 'id', 'action', 'disabled'] : ['id', 'action'];
    if (Object.keys (body).some (key => !allowed.includes (key))) { return Json ({ error : 'Invalid action.' }, 400); }
    if (body.action === 'revoke' && body.disabled === undefined) { return Json (await broker.RevokeRegistration ({ accountId, id : Identifier (body.id) })); }
    if (admin && body.action === 'disable' && body.id === undefined && typeof body.disabled === 'boolean') { return Json (await broker.DisableAgents ({ accountId, disabled : body.disabled })); }
    return Json ({ error : 'Invalid action.' }, 400);
}
