import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';

// AI Generative shows "Sending request…", then "Request processing · NN%", then completion, and scrolls once to the new creation.
const png = await readFile ('website/assets/images/3dviewer_net_logo.png');
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 900 } }); const errors = []; page.on ('pageerror', e => errors.push (e.message));
    await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'ai-progress', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    for (const path of ['accounts/**', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.route ('**/api/personal/items', r => r.fulfill ({ json : [] }));
    await page.route ('https://assets.meshy.ai/**', r => r.fulfill ({ body : png, contentType : 'image/png' }));
    // Twelve finished creations push a new one out of view; the submit and polls are held so each phase can be observed.
    const history = Array.from ({ length : 12 }, (_, index) => ({ id : 'old-' + index, prompt : 'Earlier concept ' + index, type : 'text-to-3d-preview', status : 'SUCCEEDED', created_at : 1000 + index, thumbnail_url : 'https://assets.meshy.ai/old.png' }));
    let releaseSubmit, polls = 0, releaseFinish; const submitHeld = new Promise (resolve => { releaseSubmit = resolve; }); const finishHeld = new Promise (resolve => { releaseFinish = resolve; });
    await page.route ('**/api/ai/**', async r => {
        const url = new URL (r.request ().url ());
        if (r.request ().method () === 'POST' && url.pathname.endsWith ('/text-to-3d')) { await submitHeld; await r.fulfill ({ json : { result : 'new-task' } }); return; }
        if (url.pathname.endsWith ('/text-to-3d/new-task')) {
            polls++; if (polls > 1) { await finishHeld; }
            await r.fulfill ({ json : polls > 1 ? { id : 'new-task', type : 'text-to-3d-preview', prompt : 'Progress concept', status : 'SUCCEEDED', progress : 100, created_at : Date.now (), thumbnail_url : 'https://assets.meshy.ai/new.png' } : { id : 'new-task', type : 'text-to-3d-preview', prompt : 'Progress concept', status : 'IN_PROGRESS', progress : 40, created_at : Date.now () } }); return;
        }
        await r.fulfill ({ json : url.pathname.endsWith ('text-to-3d') ? history : [] });
    });
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, JSON.stringify (r)); return r.result; };
    const progress = () => call ('ai.workspace.inspect').then (state => state.progress);
    await call ('ui.ai'); await call ('ai.creations.refresh'); await call ('ai.mode.set', { mode : 'text3d' });
    const box = page.locator ('.ai_progress'); assert.equal (await box.isVisible (), false);
    const grid = page.locator ('.ai_recent_grid'); await grid.evaluate (el => { el.scrollIntoView (); }); const scroller = await grid.evaluate (el => { let node = el; while (node && !(node.scrollHeight > node.clientHeight && /auto|scroll/.test (getComputedStyle (node).overflowY))) { node = node.parentElement; } node.scrollTop = node.scrollHeight; return Boolean (node); });
    assert.ok (scroller, 'the AI panel scrolls');

    const prompt = page.getByLabel ('AI generation prompt', { exact : true }); await prompt.fill ('Progress concept'); await page.locator ('.ai_generate_button').click ();
    await box.getByText ('Sending request…', { exact : true }).waitFor (); assert.equal ((await progress ()).phase, 'sending'); assert.equal (await box.getAttribute ('role'), 'status');
    releaseSubmit ();
    await box.getByText ('Request processing · 40%', { exact : true }).waitFor ();
    const card = page.locator ('.ai_recent_card[data-task-id="new-task"]');
    await page.waitForFunction (() => { const item = document.querySelector ('.ai_recent_card[data-task-id="new-task"]'); if (!item) { return false; } const rect = item.getBoundingClientRect (); return rect.top >= 0 && rect.bottom <= innerHeight; });
    assert.equal (await card.getAttribute ('aria-busy'), 'true'); assert.ok (await card.evaluate (el => el.classList.contains ('ai_recent_active')));
    assert.deepEqual (await progress (), { phase : 'processing', taskId : 'new-task', percent : 40, message : 'Request processing · 40%' });
    assert.equal (await page.locator ('.ai_progress_bar').evaluate (bar => bar.value), 40);
    if (process.env.AI_PROGRESS_SCREENSHOT) { await page.locator ('#ai_module_panel').screenshot ({ path : process.env.AI_PROGRESS_SCREENSHOT }); }
    releaseFinish ();
    await box.getByText ('Complete · select Preview to review', { exact : true }).waitFor ();
    assert.equal ((await progress ()).phase, 'complete'); assert.equal (await card.getAttribute ('aria-busy'), 'false');

    // A rejected submission reports the failure in the same place.
    await page.unroute ('**/api/ai/**'); await page.route ('**/api/ai/**', r => r.request ().method () === 'POST' ? r.fulfill ({ status : 400, json : { message : 'Prompt rejected' } }) : r.fulfill ({ json : [] }));
    await prompt.fill ('Bad prompt'); await page.locator ('.ai_generate_button').click ();
    await page.waitForFunction (() => document.querySelector ('.ai_progress')?.dataset.phase === 'failed'); assert.match (await box.textContent (), /^Request failed/);
    assert.deepEqual (errors, []); console.log ('AI progress: sending, processing with percentage, auto-scroll to the new creation, completion and failure passed.');
} finally { await browser.close (); }
