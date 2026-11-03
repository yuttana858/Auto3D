import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { BrowserOAuthRuntime } from '../fixtures/mcp-browser-runtime.mjs';

let callbackUrl;
// Real cross-origin redirect target, confined to loopback. Browser routing does
// not intercept redirect chains reliably, so do not mock the callback navigation.
const callbackServer = createServer ((request, response) => { callbackUrl = new URL (request.url, 'http://127.0.0.1'); response.setHeader ('Content-Type', 'text/plain'); response.end ('Callback received'); });
await new Promise (resolve => callbackServer.listen (0, '127.0.0.1', resolve));
const callback = 'http://127.0.0.1:' + callbackServer.address ().port + '/callback';
const { runtime, origin, clientId, accessCookie } = await BrowserOAuthRuntime (callback);
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || (process.env.CI ? chromium.executablePath () : '/usr/bin/chromium'), args : ['--no-sandbox'] });
try {
    const context = await browser.newContext ();
    await context.addCookies ([{ name : '__Host-auto3d-access', value : accessCookie, url : origin, secure : true, httpOnly : true, sameSite : 'Strict' }]);
    const page = await context.newPage (); let posted; const errors = [];
    page.on ('console', message => { if (message.type () === 'error') { errors.push (message.text ()); } });
    await page.route (origin + '/**', async route => {
        const request = route.request (), headers = await request.allHeaders ();
        if (request.method () === 'POST') { posted = { origin : headers.origin, form : new URLSearchParams (request.postData ()) }; }
        const response = await runtime.dispatchFetch (request.url (), { method : request.method (), headers, body : request.method () === 'POST' ? request.postData () : undefined, redirect : 'manual' });
        await route.fulfill ({ status : response.status, headers : Object.fromEntries (response.headers), body : await response.text () });
    });
    const verifier = 'v'.repeat (43), challenge = Buffer.from (await crypto.subtle.digest ('SHA-256', new TextEncoder ().encode (verifier))).toString ('base64url');
    const params = new URLSearchParams ({ client_id : clientId, redirect_uri : callback, response_type : 'code', resource : origin + '/mcp', scope : 'auto3d.read offline_access', state : 'browser-fixture-state', code_challenge : challenge, code_challenge_method : 'S256' });
    await page.goto (origin + '/oauth/authorize?' + params);
    await Promise.all ([page.waitForURL (url => url.origin === new URL (callback).origin && url.pathname === new URL (callback).pathname), page.getByRole ('button', { name : 'Allow', exact : true }).click ()]);
    assert.equal (posted.origin, origin); assert.match (posted.form.get ('binding'), /^\d+\.[a-f0-9]{64}$/);
    assert.equal (callbackUrl.searchParams.get ('state'), 'browser-fixture-state'); assert.equal (callbackUrl.searchParams.get ('iss'), origin + '/oauth');
    assert.ok (callbackUrl.searchParams.get ('code'));
    assert.equal (errors.some (message => message.includes ('Content Security Policy')), false, 'CSP must allow the validated OAuth callback after the form POST.');
    const token = await runtime.dispatchFetch (origin + '/oauth/oauth/token', { method : 'POST', headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams ({ grant_type : 'authorization_code', client_id : clientId, redirect_uri : callback, code : callbackUrl.searchParams.get ('code'), code_verifier : verifier, resource : origin + '/mcp' }).toString () });
    assert.equal (token.status, 200, 'The code returned to the browser client must exchange successfully.');
    assert.equal (typeof (await token.json ()).access_token, 'string');
    console.log ('Chromium consent form -> validated cross-origin callback -> S256 code exchange passed, with browser-managed consent cookies and canonical Origin.');
} finally { await browser.close (); await runtime.dispose (); await new Promise (resolve => callbackServer.close (resolve)); }
