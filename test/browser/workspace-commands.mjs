import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
await mkdir ('work', { recursive : true });
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 950 } }); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'workspace-test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 1 }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html');
    await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    assert.equal (await page.locator ('.workspace_panel.collapsed').count (), 1); assert.equal (await page.locator ('#upload_panel_toggle').getAttribute ('aria-expanded'), 'true');
    assert.equal (await page.locator ('.workspace_section[open]').count (), 0);
    assert.equal (await page.locator ('#header_buttons button[aria-label="Packaging design"]').count (), 0);
    await page.screenshot ({ path : 'work/workspace-clean-start.png' });
    await page.locator ('#open_file').setInputFiles ({ name : 'cube.off', mimeType : 'text/plain', buffer : Buffer.from ('OFF\n8 6 0\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n0 0 1\n1 0 1\n1 1 1\n0 1 1\n4 0 1 2 3\n4 4 7 6 5\n4 0 4 5 1\n4 1 5 6 2\n4 2 6 7 3\n4 3 7 4 0\n') });
    await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
    await call ('view.fit');
    await page.locator ('#main_viewer canvas').first ().click ({ button : 'right' });
    const stripLabels = await page.locator ('.scene_tools button').evaluateAll (nodes => nodes.map (node => node.getAttribute ('aria-label')));
    const menuLabels = await page.locator ('.auto3d_context_menu button').allTextContents ();
    /* The vertical strip omits menu-only actions (visibility, delete, add/save/export/library); undo/redo live in the toolbar history group. The context menu keeps every action. */
    const historyLabels = await page.locator ('.session_history_tools button').evaluateAll (nodes => nodes.map (node => node.getAttribute ('aria-label')));
    assert.deepEqual (historyLabels, ['Undo object edit (Ctrl+Z)', 'Redo object edit (Ctrl+Shift+Z)']);
    const menuOnlyLabels = ['Hide or show object (H)', 'Delete object', 'Add model', 'Save or open session (Ctrl+S)', 'Export', 'Model library'];
    for (const label of [...historyLabels, ...menuOnlyLabels]) { assert.ok (menuLabels.includes (label), label); }
    assert.deepEqual (menuLabels.filter (label => !menuOnlyLabels.includes (label) && !historyLabels.includes (label)), stripLabels);
    await page.getByRole ('menuitem', { name : 'Move (W)', exact : true }).click ();
    assert.equal (await page.getByRole ('button', { name : 'Move (W)', exact : true }).getAttribute ('aria-pressed'), 'true');
    await call ('object.tool', { mode : 'select' });
    await page.evaluate (() => { window.processingSeen = false; window.processingMessages = []; new MutationObserver (() => { const dialog = document.querySelector ('.processing_dialog[open]'); if (dialog) { window.processingSeen = true; window.processingMessages.push (dialog.textContent); } }).observe (document.body, { subtree : true, childList : true, characterData : true }); });
    const input = page.getByRole ('textbox', { name : 'Command or macro' }); await input.fill ('array model 4x4x6'); await input.press ('Enter');
    await page.locator ('.processing_dialog[open]').waitFor (); await page.screenshot ({ path : 'work/workspace-processing.png' });
    await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent === 'Array created · 96 objects');
    assert.equal ((await call ('scene.inspect')).objects.length, 96);
    assert.equal (await page.evaluate (() => window.processingSeen), true); assert.ok (await page.evaluate (() => window.processingMessages.some (message => /95 \/ 95/.test (message))));
    assert.equal (await page.locator ('.processing_dialog').count (), 0); assert.equal (await input.isEnabled (), true);
    await page.screenshot ({ path : 'work/workspace-array.png' });
    await input.fill ('undo'); await input.press ('Enter'); await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent === 'Completed · 1 command');
    assert.equal ((await call ('scene.inspect')).objects.length, 1);
    await input.fill ('array model 99x4x6'); await input.press ('Enter'); await page.waitForFunction (() => /Array counts/.test (document.querySelector ('.scene_status')?.textContent || '')); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    await call ('macro.save', { name : 'Frame model', definition : JSON.stringify ({ version : 1, steps : [{ id : 'fit', command : 'view.fit' }] }) });
    await input.fill ('run macro Frame model'); await input.press ('Enter'); await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent === 'Completed · 1 command');
    await call ('ui.ai'); assert.equal (await page.locator ('#ai_module_panel').isVisible (), true);
    await page.locator ('.ai_connection_badge').evaluate (node => { node.textContent = 'Meshy through Auto3D with a long connection description'; });
    await page.screenshot ({ path : 'work/workspace-ai.png' });
    assert.equal (await page.locator ('.ai_workspace_panel').evaluate (node => node.scrollWidth <= node.clientWidth + 1), true);
    assert.equal (await page.locator ('.ai_connection_badge').evaluate (node => node.scrollWidth <= node.clientWidth + 1), true);
    await call ('ui.packaging'); await page.screenshot ({ path : 'work/workspace-packaging-tab.png' });
    await page.getByRole ('button', { name : 'Open packaging designer', exact : true }).click (); await page.getByRole ('dialog').filter ({ has : page.getByText ('Packaging', { exact : true }) }).waitFor ();
    await page.keyboard.press ('Escape'); await page.locator ('.packaging_dialog').waitFor ({ state : 'detached' });
    await page.setViewportSize ({ width : 390, height : 844 }); await call ('ui.ai');
    assert.equal (await page.locator ('.ai_workspace_panel').evaluate (node => node.scrollWidth <= node.clientWidth + 1), true);
    await page.screenshot ({ path : 'work/workspace-mobile-ai.png' }); assert.deepEqual (errors, []);
    console.log ('Clean startup, shared context tools, 4×4×6 array feedback/undo, saved macros, and desktop/mobile independent AI/Packaging panels passed.');
} finally { await browser.close (); }
