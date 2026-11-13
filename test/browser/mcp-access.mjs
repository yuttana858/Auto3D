import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

// Generated staging assets, mocked identity/API/WebSocket. No live client claim.
const live = process.env.MCP_TEST_LIVE === '1';
const root = path.resolve (live ? 'build/pages' : 'build/mcp-pilot'), origin = live ? 'https://auto3d-5av.pages.dev' : 'https://auto3d-mcp-pilot.pages.dev';
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.ttf' : 'font/ttf', '.woff' : 'font/woff', '.png' : 'image/png', '.wasm' : 'application/wasm' };
const server = createServer (async (request, response) => {
    try {
        const url = new URL (request.url, 'http://localhost'), filename = path.resolve (root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
        if (!filename.startsWith (root + path.sep) || path.basename (filename).startsWith ('_')) { response.writeHead (403).end (); return; }
        response.setHeader ('Content-Type', types[path.extname (filename)] || 'application/octet-stream'); response.end (await readFile (filename));
    } catch { response.writeHead (404).end (); }
});
await new Promise (resolve => server.listen (0, '127.0.0.1', resolve));
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || (process.env.CI ? chromium.executablePath () : '/usr/bin/chromium'), args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1280, height : 900 }, permissions : ['clipboard-read', 'clipboard-write'] }), errors = [], results = []; let nextResult;
    let registrationScopes = ['auto3d.read', 'auto3d.write', 'auto3d.capture'];
    const windowCodes = ['ABCD-EFGH-JKLM-NPQR', 'QRST-UVWX-YZ23-4567', 'WXYZ-2345-6789-ABCD']; let codeIndex = 0;
    page.on ('pageerror', error => errors.push (error.message));
    await page.route (origin + '/**', async route => {
        const url = new URL (route.request ().url ());
        if (url.pathname.startsWith ('/api/')) {
            let json = [];
            if (url.pathname.startsWith ('/api/auth/')) { json = { user : { id : 'test-owner', email : 'test@example.test' } }; }
            if (url.pathname === '/api/preferences') { json = { preferences : {}, folders : [] }; }
            if (url.pathname.startsWith ('/api/accounts/')) { json = { isAdmin : live }; }
            if (url.pathname === '/api/agent/config') { json = { pilot : true, mode : live ? 'live-admin' : 'staging', mcpUrl : origin + '/mcp' }; }
            if (url.pathname === '/api/agent/registrations') { json = route.request ().method () === 'POST' ? { revoked : true } : { registrations : [{ id : 'grant-a', name : 'Named review agent', harness : 'chatgpt', scopes : registrationScopes, expiresAt : Date.now () + 60000, revokedAt : null }] }; }
            if (url.pathname.startsWith ('/api/agent/admin')) { json = { disabled : false, registrations : [] }; }
            await route.fulfill ({ json }); return;
        }
        const response = await route.fetch ({ url : 'http://127.0.0.1:' + server.address ().port + url.pathname + url.search }); await route.fulfill ({ response });
    });
    let wire, helloSeen; const hello = new Promise (resolve => { helloSeen = resolve; });
    await page.routeWebSocket (origin.replace ('https:', 'wss:') + '/api/agent/connect', ws => {
        wire = ws; ws.onMessage (text => {
            const message = JSON.parse (text);
            if (message.type === 'hello') { assert.equal (message.windowCode, undefined); ws.send (JSON.stringify ({ type : 'hello_ack', connectionId : 'connection-a', expiresAt : Date.now () + 300000, windowCode : windowCodes[codeIndex], windowCodeExpiresAt : Date.now () + 600000, windowCodeId : 'code-' + codeIndex })); helloSeen (); }
            if (message.type === 'window_code') { codeIndex++; ws.send (JSON.stringify ({ type : 'window_code', requestId : message.requestId, windowCode : windowCodes[codeIndex], windowCodeExpiresAt : Date.now () + 600000, windowCodeId : 'code-' + codeIndex })); }
            if (message.type === 'result') { results.push (message); nextResult?.(); }
        });
    });
    await page.goto (origin + '/'); await page.getByRole ('button', { name : 'Welcome to Auto3D. Continue to sign in.' }).click ({ timeout : 3000 }).catch (() => {}); /* automated browsers skip the welcome screen */ await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    await page.getByRole ('button', { name : 'Preferences', exact : true }).click (); await page.getByRole ('button', { name : 'Agent access', exact : true }).click ();
    const dialog = page.getByRole ('dialog', { name : 'MCP connections', exact : true }); await dialog.waitFor (); await dialog.getByText ('Named review agent', { exact : false }).first ().waitFor (); /* registrations load after the dialog opens */ assert.ok (await dialog.getByText ('Named review agent', { exact : false }).count ()); assert.equal (await dialog.getByText ('chatgpt', { exact : false }).count (), 0);
    assert.equal (await dialog.locator ('input[type=checkbox]').count (), 0);
    assert.match (await dialog.innerText (), /including read, write and screenshot access/);
    assert.match (await dialog.innerText (), /Named review agent · Full access/);
    const codeInput = dialog.getByLabel ('App window code'); assert.equal (await codeInput.inputValue (), '');
    assert.equal (await dialog.getByRole ('button', { name : 'Copy code', exact : true }).isDisabled (), true);
    assert.equal (await dialog.getByRole ('button', { name : 'New code', exact : true }).isDisabled (), true);
    await dialog.getByRole ('button', { name : 'Live Control' }).click (); await dialog.getByRole ('status').filter ({ hasText : 'Connected' }).waitFor ();
    await hello; /* the status can update before Playwright runs the WebSocket route handler */
    assert.equal ((await call ('agent.access.inspect')).screenshots, true);
    assert.equal (await codeInput.inputValue (), windowCodes[0]);
    const badge = page.getByRole ('button', { name : 'Agent connection and window code', exact : true }); assert.match (await badge.textContent (), new RegExp (windowCodes[0]));
    await dialog.getByRole ('button', { name : 'Copy code', exact : true }).click (); assert.equal (await page.evaluate (() => navigator.clipboard.readText ()), windowCodes[0]);
    await dialog.getByRole ('button', { name : 'New code', exact : true }).click ();
    await page.waitForFunction (code => document.querySelector ('dialog[aria-label="MCP connections"] input[aria-label="App window code"]').value === code, windowCodes[1]);
    assert.match (await badge.textContent (), new RegExp (windowCodes[1]));
    wire.send (JSON.stringify ({ type : 'access_changed', windowCodeUsed : 'code-1' }));
    await page.waitForFunction (async () => (await Auto3D.execute ('agent.access.inspect', {})).result.windowCodeState === 'used');
    assert.equal (await codeInput.inputValue (), ''); assert.equal (await dialog.getByRole ('button', { name : 'Copy code', exact : true }).isDisabled (), true);
    await dialog.getByRole ('button', { name : 'New code', exact : true }).click ();
    await page.waitForFunction (code => document.querySelector ('dialog[aria-label="MCP connections"] input[aria-label="App window code"]').value === code, windowCodes[2]);
    assert.equal (await badge.getAttribute ('data-capture-private'), '');
    assert.equal (await codeInput.evaluate (input => Boolean (input.closest ('[data-capture-private]'))), true);
    await mkdir ('work', { recursive : true }); await dialog.screenshot ({ path : 'work/window-code-controls-' + (live ? 'live-assets' : 'pilot-assets') + '.png' });
    const tab = await call ('session.tabs.inspect');
    const remote = async (command, args = {}, writeAuthorized = false) => {
        const requestId = 'request-' + results.length, received = new Promise (resolve => { nextResult = resolve; });
        wire.send (JSON.stringify ({ type : 'request', requestId, command, sessionId : tab.activeId, arguments : args, writeAuthorized }));
        await received; const response = results.at (-1); assert.equal (response.requestId, requestId); assert.equal (response.result?.ok, true, JSON.stringify (response.error)); return response.result.result;
    };
    const initial = await remote ('scene.inspect');
    // Exercise real generation through the live bridge, then capture the box without a screenshot switch.
    const generated = await remote ('packaging.fefco.preset', { code : '0201', basis : 'inside', length : 304.8, width : 304.8, height : 304.8, thickness : 3, closure : 'closed' }, true);
    assert.equal (generated.code, '0201'); assert.ok (generated.objectId);
    const scene = await remote ('scene.inspect'); assert.equal (scene.objects.length, initial.objects.length + 1); assert.equal (scene.selectedObjectId, generated.objectId);
    const dimensions = await remote ('packaging.dimensions.inspect', {}, true);
    for (const axis of ['length', 'width', 'height']) { assert.ok (Math.abs (dimensions.inside[axis] - 304.8) < 0.000001, axis); }
    const capture = await remote ('capture.image', { scope : 'viewport', maxSize : 800 });
    assert.equal (capture.content[0].type, 'image'); assert.equal (capture.content[0].mimeType, 'image/png'); assert.match (capture.content[0].data, /^iVBORw0KGgo/);
    assert.ok (capture.width <= 800 && capture.height <= 800);
    await mkdir ('work', { recursive : true }); await writeFile ('work/unified-agent-rsc-' + (live ? 'live-assets' : 'pilot-assets') + '.png', Buffer.from (capture.content[0].data, 'base64'));
    // While an agent is connected, command bar text that is not a command is sent to the agent, which can read it and reply above the box.
    const input = page.getByRole ('textbox', { name : 'Command or macro' }); await page.evaluate (() => document.querySelectorAll ('dialog[open]').forEach (open => open.close ()));
    await page.waitForFunction (() => !document.querySelector ('dialog[open]')); /* modal dialogs block the command bar until they fade out */
    await page.getByRole ('button', { name : 'Preferences', exact : true }).click ();
    const preferences = page.getByRole ('dialog', { name : 'Preferences', exact : true }); assert.equal (await preferences.getByLabel ('App window code').inputValue (), windowCodes[2]);
    await preferences.getByRole ('button', { name : 'Close Preferences', exact : true }).click (); await preferences.waitFor ({ state : 'detached' });
    await page.setViewportSize ({ width : 390, height : 844 }); const rect = await badge.boundingBox (); assert.ok (rect.x >= 0 && rect.x + rect.width <= 391, JSON.stringify (rect));
    await page.setViewportSize ({ width : 1280, height : 900 });
    await input.fill ('make the box taller please'); await input.press ('Enter');
    await page.waitForFunction (() => document.querySelector ('.scene_command_bar .scene_status').textContent === 'Sent to agent · waiting for a reply');
    const bar = await call ('ui.command_bar.inspect'); assert.equal (bar.agentConnected, true);
    const message = bar.entries.find (entry => entry.kind === 'message'); assert.equal (message?.text, 'make the box taller please');
    await call ('ui.command_bar.respond', { message : 'Working on it.', replyTo : message.id });
    assert.equal (await page.locator ('.scene_command_bar .scene_status').textContent (), 'Agent: Working on it.');
    registrationScopes = ['auto3d.read'];
    await call ('agent.access.open'); await dialog.waitFor ();
    await dialog.getByText ('Named review agent · Reconnect this agent to enable all tools and screenshots', { exact : false }).waitFor ();
    await dialog.getByRole ('button', { name : 'Disconnect', exact : true }).click (); assert.equal ((await call ('agent.access.inspect')).connected, false);
    assert.equal (await codeInput.inputValue (), ''); assert.equal (await badge.isVisible (), false);
    await dialog.getByRole ('button', { name : 'Revoke', exact : true }).click ();
    await page.evaluate (() => document.querySelector ('dialog[aria-label="MCP connections"]').close ());
    await call ('admin.agents.open'); const admin = page.getByRole ('dialog', { name : 'Agent administration', exact : true }); await admin.getByLabel ('Pilot account ID').fill ('test-owner'); await admin.getByRole ('button', { name : 'Inspect account' }).click ();
    await admin.getByRole ('status').filter ({ hasText : 'Agent access enabled' }).waitFor ();
    assert.deepEqual (errors, []); console.log ('Server-issued window codes in header/Preferences/connection controls, clipboard copy, renewal/used states, mobile fit, unified access, real 12-inch RSC generation, PNG capture, restricted-grant guidance, command bar replies, disconnect, revoke and admin UI passed.');
} finally { await browser.close (); await new Promise (resolve => server.close (resolve)); }
