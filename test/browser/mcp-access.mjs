import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
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
    const page = await browser.newPage ({ viewport : { width : 1280, height : 900 } }), errors = [], results = []; let nextResult;
    page.on ('pageerror', error => errors.push (error.message));
    await page.route (origin + '/**', async route => {
        const url = new URL (route.request ().url ());
        if (url.pathname.startsWith ('/api/')) {
            let json = [];
            if (url.pathname.startsWith ('/api/auth/')) { json = { user : { id : 'test-owner', email : 'test@example.test' } }; }
            if (url.pathname === '/api/preferences') { json = { preferences : {}, folders : [] }; }
            if (url.pathname.startsWith ('/api/accounts/')) { json = { isAdmin : live }; }
            if (url.pathname === '/api/agent/config') { json = { pilot : true, mode : live ? 'live-admin' : 'staging', mcpUrl : origin + '/mcp' }; }
            if (url.pathname === '/api/agent/registrations') { json = route.request ().method () === 'POST' ? { revoked : true } : { registrations : [{ id : 'grant-a', name : 'Named review agent', harness : 'chatgpt', expiresAt : Date.now () + 60000, revokedAt : null }] }; }
            if (url.pathname.startsWith ('/api/agent/admin')) { json = { disabled : false, registrations : [] }; }
            await route.fulfill ({ json }); return;
        }
        const response = await route.fetch ({ url : 'http://127.0.0.1:' + server.address ().port + url.pathname + url.search }); await route.fulfill ({ response });
    });
    let wire, helloSeen; const hello = new Promise (resolve => { helloSeen = resolve; });
    await page.routeWebSocket (origin.replace ('https:', 'wss:') + '/api/agent/connect', ws => {
        wire = ws; ws.onMessage (text => {
            const message = JSON.parse (text);
            if (message.type === 'hello') { ws.send (JSON.stringify ({ type : 'hello_ack', connectionId : 'connection-a', expiresAt : Date.now () + 300000 })); helloSeen (); }
            if (message.type === 'result') { results.push (message); nextResult?.(); }
        });
    });
    await page.goto (origin + '/'); await page.getByRole ('button', { name : 'Welcome to Auto3D. Continue to sign in.' }).click ({ timeout : 3000 }).catch (() => {}); /* automated browsers skip the welcome screen */ await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    await page.getByRole ('button', { name : 'Preferences', exact : true }).click (); await page.getByRole ('button', { name : 'Agent access', exact : true }).click ();
    const dialog = page.getByRole ('dialog', { name : 'MCP connections', exact : true }); await dialog.waitFor (); await dialog.getByText ('Named review agent', { exact : false }).first ().waitFor (); /* registrations load after the dialog opens */ assert.ok (await dialog.getByText ('Named review agent', { exact : false }).count ()); assert.equal (await dialog.getByText ('chatgpt', { exact : false }).count (), 0);
    assert.equal (await dialog.locator ('input[type=checkbox]').isChecked (), false);
    assert.equal (await dialog.getByLabel ('App window code').count (), 0);
    assert.equal (await dialog.getByRole ('button', { name : 'Copy', exact : true }).count (), 0);
    await dialog.getByRole ('button', { name : 'Live Control' }).click (); await dialog.getByRole ('status').filter ({ hasText : 'Connected' }).waitFor ();
    await hello; /* the status can update before Playwright runs the WebSocket route handler */
    const tab = await call ('session.tabs.inspect');
    const received = new Promise (resolve => { nextResult = resolve; });
    wire.send (JSON.stringify ({ type : 'request', requestId : 'inspect-a', command : 'scene.inspect', sessionId : tab.activeId, arguments : {} }));
    await received; assert.equal (results[0]?.requestId, 'inspect-a'); assert.equal (results[0].result.ok, true);
    // While an agent is connected, command bar text that is not a command is sent to the agent, which can read it and reply above the box.
    const input = page.getByRole ('textbox', { name : 'Command or macro' }); await page.evaluate (() => document.querySelectorAll ('dialog[open]').forEach (open => open.close ()));
    await page.waitForFunction (() => !document.querySelector ('dialog[open]')); /* modal dialogs block the command bar until they fade out */
    await input.fill ('make the box taller please'); await input.press ('Enter');
    await page.waitForFunction (() => document.querySelector ('.scene_command_bar .scene_status').textContent === 'Sent to agent · waiting for a reply');
    const bar = await call ('ui.command_bar.inspect'); assert.equal (bar.agentConnected, true);
    const message = bar.entries.find (entry => entry.kind === 'message'); assert.equal (message?.text, 'make the box taller please');
    await call ('ui.command_bar.respond', { message : 'Working on it.', replyTo : message.id });
    assert.equal (await page.locator ('.scene_command_bar .scene_status').textContent (), 'Agent: Working on it.');
    await call ('agent.access.open'); await dialog.waitFor ();
    await dialog.getByRole ('button', { name : 'Disconnect', exact : true }).click (); assert.equal ((await call ('agent.access.inspect')).connected, false);
    await dialog.getByRole ('button', { name : 'Revoke', exact : true }).click ();
    await page.evaluate (() => document.querySelector ('dialog[aria-label="MCP connections"]').close ());
    await call ('admin.agents.open'); const admin = page.getByRole ('dialog', { name : 'Agent administration', exact : true }); await admin.getByLabel ('Pilot account ID').fill ('test-owner'); await admin.getByRole ('button', { name : 'Inspect account' }).click ();
    await admin.getByRole ('status').filter ({ hasText : 'Agent access enabled' }).waitFor ();
    assert.deepEqual (errors, []); console.log ('MCP browser controls, explicit connection, safe remote read, command bar messages and agent replies, disconnect, revoke and admin UI passed on generated staging assets.');
} finally { await browser.close (); await new Promise (resolve => server.close (resolve)); }
