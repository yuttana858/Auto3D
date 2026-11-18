import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const id = '00000000-0000-4000-8000-000000000011', owner = '00000000-0000-4000-8000-000000000012'; let exists = false; const messages = []; let rejectWrites = false;
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1200, height : 900 } }); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : owner, email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.route ('**/api/messenger/**', async route => { const request = route.request (), path = new URL (request.url ()).pathname, method = request.method (); let json;
        if (path.endsWith ('/conversations') && method === 'GET') { json = { conversations : exists ? [{ id, kind : 'ai', title : 'AI history' }] : [] }; }
        else if (path.endsWith ('/conversations') && method === 'POST') { exists = true; json = { id }; }
        else if (path.endsWith ('/messages') && method === 'GET') { json = { messages : [...messages].reverse () }; }
        else if (path.endsWith ('/messages') && method === 'POST') { if (rejectWrites) { return route.fulfill ({ status : 503, json : { error : 'Offline' } }); } const data = request.postDataJSON (); messages.push ({ ...data, sender_id : owner, created_at : new Date ().toISOString () }); json = { message : messages.at (-1) }; }
        else { return route.fulfill ({ status : 404, json : { error : 'Not found' } }); } return route.fulfill ({ json }); });
    const ready = async () => page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'), null, { timeout : 60000 });
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await ready ();
    await page.getByLabel ('Command or macro').fill ('@agent create an RSC'); await page.getByRole ('button', { name : 'Run', exact : true }).click ();
    const reply = await page.evaluate (() => Auto3D.execute ('ui.command_bar.respond', { message : 'Done.' })); assert.equal (reply.ok, true);
    await page.getByRole ('button', { name : 'Open Messenger' }).click (); const dialog = page.getByRole ('dialog', { name : 'Messenger' }); await dialog.getByRole ('tab', { name : 'AI', exact : true }).click (); await dialog.getByText ('create an RSC', { exact : false }).waitFor (); await dialog.getByText ('Agent: Done.', { exact : false }).waitFor ();
    await page.waitForFunction (() => !document.querySelector ('.messenger_content')?.innerText.includes ('Saving AI history'), null, { timeout : 30000 }); assert.equal (messages.length, 2);
    await page.reload (); await ready (); await page.getByRole ('button', { name : 'Open Messenger' }).click (); await dialog.getByRole ('tab', { name : 'AI', exact : true }).click (); await dialog.getByText ('create an RSC', { exact : false }).waitFor (); await dialog.getByText ('Agent: Done.', { exact : false }).waitFor ();
    const history = await page.evaluate (() => Auto3D.execute ('messenger.ai.history', { limit : 10 })); assert.equal (history.ok, true); assert.equal (history.result.messages.length, 2);
    messages.unshift ({ id : '00000000-0000-4000-8000-000000000099', sender_id : owner, origin : 'user', body : 'Previous day', created_at : '2020-01-02T12:00:00.000Z' });
    await dialog.getByRole ('button', { name : 'History', exact : true }).click (); await dialog.getByText ('Previous day', { exact : false }).waitFor (); assert.equal (await dialog.locator ('.messenger_archive h3').count (), 2); assert.equal (await dialog.getByLabel ('Messenger message').isDisabled (), true); await dialog.getByRole ('button', { name : 'Close Messenger' }).click (); await page.getByRole ('button', { name : 'Open Messenger' }).click (); assert.equal (await dialog.getByLabel ('Messenger message').isDisabled (), false); assert.equal ((await page.evaluate (() => Auto3D.execute ('ui.messenger.history', { open : true }))).ok, true); assert.equal ((await page.evaluate (() => Auto3D.execute ('ui.messenger.history', { open : false }))).ok, true); await dialog.getByText ('Agent: Done.', { exact : false }).waitFor ();
    rejectWrites = true; await dialog.getByLabel ('Messenger message').fill ('unsaved'); await dialog.getByRole ('button', { name : 'Send', exact : true }).click (); await dialog.getByText (/AI history save could not be confirmed/).waitFor (); assert.equal (await dialog.getByRole ('button', { name : 'Retry saving' }).isVisible (), true); rejectWrites = false; await dialog.getByRole ('button', { name : 'Retry saving' }).click (); await page.waitForFunction (() => !document.querySelector ('.messenger_content')?.innerText.includes ('Saving AI history')); assert.equal (messages.length, 4); assert.deepEqual (errors, []); console.log ('Command-bar messages, agent replies, AI history reload and retry passed using a mock service.');
    // One prompt: a command typed in the Messenger AI tab runs like the command bar and both are saved as AI history.
    await page.waitForFunction (() => !document.querySelector ('.messenger_content')?.innerText.includes ('Saving AI history'), null, { timeout : 30000 });
    const before = messages.length; await dialog.getByLabel ('Messenger message').fill ('fit'); await dialog.getByRole ('button', { name : 'Send', exact : true }).click ();
    await dialog.locator ('.messenger_command', { hasText : 'fit' }).waitFor (); assert.equal (await dialog.getByLabel ('Messenger message').inputValue (), '');
    const bar = await page.evaluate (() => Auto3D.execute ('messenger.ai.inspect', { limit : 5 })); assert.equal (bar.ok, true); assert.ok (bar.result.entries.some (entry => entry.from === 'user' && entry.kind === 'command' && entry.text === 'fit' && entry.ok), JSON.stringify (bar.result.entries));
    await page.getByLabel ('Command or macro').fill ('fit'); await page.getByRole ('button', { name : 'Run', exact : true }).click ();
    await page.waitForFunction (count => document.querySelectorAll ('.messenger_command').length >= count, 2);
    await page.waitForFunction (() => !document.querySelector ('.messenger_content')?.innerText.includes ('Saving AI history'), null, { timeout : 30000 });
    assert.deepEqual (messages.slice (before).map (item => [item.body, item.origin]), [['[command] fit', 'user'], ['[command] fit', 'user']]);
    const replied = await page.evaluate (() => Auto3D.execute ('messenger.ai.respond', { message : 'View fitted.' })); assert.equal (replied.ok, true); await dialog.getByText ('Agent: View fitted.', { exact : false }).waitFor ();
    await dialog.getByRole ('button', { name : 'History', exact : true }).click (); await dialog.locator ('.messenger_archive .messenger_command', { hasText : 'fit' }).first ().waitFor ();
    await page.screenshot ({ path : 'work/messenger-ai-prompt.png' });
    assert.deepEqual (errors, []); console.log ('Messenger AI history, shared command prompt, saved commands and agent replies passed.');
} finally { await browser.close (); }
