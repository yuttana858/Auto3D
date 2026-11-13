import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Command bar close/reopen from the tool strip, its agent command, and the MCP connections list.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 900 } }); const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
    await page.route ('**/api/auth/**', (route) => route.fulfill ({ json : { user : { id : 'browser-user', email : 'user@example.com' } } }));
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { theme : 1, units : 'metric' }, folders : [] } }));
    await page.route ('**/api/accounts/**', (route) => route.fulfill ({ json : { isAdmin : false } }));
    await page.route ('**/api/personal/items', (route) => route.fulfill ({ json : [] }));
    const registrations = [
        { id : 'revoked', name : 'Revoked agent', harness : 'chatgpt', revokedAt : Date.now () - 1000, expiresAt : Date.now () + 600000 },
        { id : 'expired', name : 'Expired agent', harness : 'codex', revokedAt : null, expiresAt : Date.now () - 1000 },
        { id : 'active', name : 'Active agent', harness : 'claude', revokedAt : null, expiresAt : Date.now () + 600000 }
    ];
    await page.route ('**/api/agent/**', (route) => route.fulfill ({ json : new URL (route.request ().url ()).pathname === '/api/agent/config' ? { pilot : true, mode : 'staging', mcpUrl : 'https://example.test/mcp' } : { registrations } }));
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));

    const bar = page.locator ('.scene_command_bar'), toggle = page.getByRole ('toolbar', { name : 'Object tools' }).getByRole ('button', { name : 'Command bar', exact : true });
    assert.equal (await bar.isVisible (), true); assert.equal (await toggle.getAttribute ('aria-pressed'), 'true');
    // The Command bar button is the last control at the bottom of the tool strip.
    const strip = await page.getByRole ('toolbar', { name : 'Object tools' }).boundingBox (), button = await toggle.boundingBox ();
    assert.equal (await page.locator ('.scene_tools > :last-child').getAttribute ('aria-label'), 'Command bar'); assert.ok (strip.y + strip.height - (button.y + button.height) < 12);

    await page.getByRole ('button', { name : 'Close command bar', exact : true }).click ();
    assert.equal (await bar.isVisible (), false); assert.equal (await toggle.getAttribute ('aria-pressed'), 'false');
    await toggle.click (); assert.equal (await bar.isVisible (), true); assert.equal (await toggle.getAttribute ('aria-pressed'), 'true');
    assert.equal (await page.evaluate (() => document.activeElement?.getAttribute ('aria-label')), 'Command or macro');

    const run = (args) => page.evaluate ((value) => window.Auto3D.execute ('ui.command_bar', value), args);
    assert.deepEqual ((await run ({ visible : false })).result, { visible : false }); assert.equal (await bar.isVisible (), false);
    assert.equal ((await run ({ visible : 'no' })).ok, false); assert.equal (await bar.isVisible (), false);
    // Closing is remembered on this device.
    await page.reload (); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    assert.equal (await bar.isVisible (), false); assert.equal (await toggle.getAttribute ('aria-pressed'), 'false');
    assert.deepEqual ((await run ({})).result, { visible : true }); assert.equal (await bar.isVisible (), true);

    // The command bar is a message channel: non-command text and @agent text go to agents, replies show above the box.
    const input = page.getByRole ('textbox', { name : 'Command or macro' }), status = page.locator ('.scene_status');
    const inspect = (args = {}) => page.evaluate ((value) => window.Auto3D.execute ('ui.command_bar.inspect', value), args);
    const start = (await inspect ()).result.lastId;
    // Without a connected agent, unknown text stays a command error so typos are visible.
    await input.fill ('please make the box 400 wide'); await input.press ('Enter');
    await page.waitForFunction (() => document.querySelector ('.scene_status').textContent.startsWith ('Unknown command'));
    await input.fill ('@agent what is selected?'); await input.press ('Enter');
    await page.waitForFunction (() => document.querySelector ('.scene_status').textContent.startsWith ('No agent connected'));
    await input.fill ('fit'); await input.press ('Enter'); await page.waitForFunction (() => document.querySelector ('.scene_status').textContent.startsWith ('Completed'));
    const read = (await inspect ({ after : start })).result; assert.equal (read.agentConnected, false);
    const messages = read.entries.filter (entry => entry.kind === 'message');
    assert.deepEqual (messages.map (entry => [entry.from, entry.text]), [['user', 'what is selected?']]);
    assert.ok (read.entries.some (entry => entry.kind === 'command' && entry.text === 'please make the box 400 wide' && entry.ok === false));
    assert.ok (read.entries.some (entry => entry.kind === 'command' && entry.text === 'fit' && entry.ok === true));
    assert.ok (read.entries.some (entry => entry.kind === 'status' && entry.from === 'app' && entry.text.startsWith ('Completed')));
    assert.ok (!read.entries.some (entry => entry.kind === 'status' && entry.text.startsWith ('No agent connected')), 'messages the bar shows itself are not logged as app status');
    assert.equal ((await inspect ({ after : read.lastId })).result.entries.length, 0);
    await run ({ visible : false });
    const reply = await page.evaluate ((id) => window.Auto3D.execute ('ui.command_bar.respond', { message : 'Nothing is selected yet.', replyTo : id }), messages[0].id);
    assert.equal (reply.ok, true, JSON.stringify (reply)); assert.equal (await bar.isVisible (), true);
    assert.equal (await status.textContent (), 'Agent: Nothing is selected yet.'); assert.equal (await status.getAttribute ('data-tone'), 'agent');
    const after = (await inspect ({ after : read.lastId })).result.entries; assert.deepEqual (after.map (entry => [entry.from, entry.kind, entry.replyTo]), [['agent', 'response', messages[0].id]]);
    assert.equal ((await page.evaluate (() => window.Auto3D.execute ('ui.command_bar.respond', { message : 'x', replyTo : 999999 }))).ok, false);
    assert.equal ((await page.evaluate (() => window.Auto3D.execute ('ui.command_bar.respond', { message : '' }))).ok, false);
    assert.equal (await status.textContent (), 'Agent: Nothing is selected yet.');
    // A later app status replaces the agent styling.
    await input.fill ('fit'); await input.press ('Enter'); await page.waitForFunction (() => document.querySelector ('.scene_status').textContent.startsWith ('Completed'));
    assert.equal (await status.getAttribute ('data-tone'), null);
    // selection.clear deselects, the same as clicking empty space.
    const cleared = await page.evaluate (() => window.Auto3D.execute ('selection.clear', {})); assert.deepEqual (cleared.result, { selectedObjectIds : [] });
    assert.equal ((await page.evaluate (() => window.Auto3D.execute ('scene.inspect', {}))).result.selectedObjectId, null);

    // MCP connections lists only usable registrations and names the connect action Live Control.
    assert.equal ((await page.evaluate (() => window.Auto3D.execute ('agent.access.open', {}))).ok, true);
    const dialog = page.getByRole ('dialog', { name : 'MCP connections', exact : true }); await dialog.getByText ('Active agent · Reconnect this agent to enable all tools and screenshots', { exact : false }).waitFor ();
    assert.equal (await dialog.getByText ('Revoked agent').count (), 0); assert.equal (await dialog.getByText ('Expired agent').count (), 0);
    assert.equal (await dialog.getByRole ('button', { name : 'Live Control', exact : true }).count (), 1);
    // Screenshots are included by the unified connection policy; there is no separate preference.
    assert.equal (await dialog.getByRole ('checkbox').count (), 0);
    assert.match (await dialog.innerText (), /including read, write and screenshot access/);
    assert.equal ((await page.evaluate (() => window.Auto3D.execute ('agent.access.inspect', {}))).result.permissionPolicy, 'full-access-v1'); assert.equal (await dialog.getByRole ('button', { name : 'Connect this window' }).count (), 0);
    registrations.splice (2, 1); await dialog.getByRole ('button', { name : 'Close MCP connections' }).click ();
    await page.waitForFunction (() => !document.querySelector ('dialog[aria-label="MCP connections"]')); /* closing dialogs fade out before removal */
    await page.evaluate (() => window.Auto3D.execute ('agent.access.open', {})); const reopened = page.getByRole ('dialog', { name : 'MCP connections', exact : true }); await reopened.getByText ('No active connections.', { exact : true }).waitFor ();
    assert.equal (await reopened.getByRole ('checkbox').count (), 0);

    assert.deepEqual (errors, []); console.log ('Command bar close/reopen, agent messages and replies, selection.clear, ui.command_bar, unified access messaging and MCP active-connection list passed.');
} finally { await browser.close (); }
