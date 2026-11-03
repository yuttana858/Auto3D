import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const origin = 'https://auto3d-mcp-pilot.pages.dev';
const runtime = new Miniflare (convertV4MiniflareOptions ({ modules : true, scriptPath : path.resolve ('work/mcp-consent-worker.js'), compatibilityDate : '2026-11-03', compatibilityFlags : ['nodejs_compat'], bindings : {
    AUTO3D_MCP_PILOT : '1', AUTO3D_MCP_ORIGIN : origin, AUTO3D_MCP_PILOT_ACCOUNTS : '11111111-1111-4111-8111-111111111111',
    AUTO3D_MCP_STAGING_SUPABASE_URL : 'https://stagingtest.supabase.co', AUTO3D_MCP_PRODUCTION_SUPABASE_URL : 'https://productiontest.supabase.co', SUPABASE_URL : 'https://stagingtest.supabase.co', AUTO3D_MCP_CONSENT_SECRET : 'a'.repeat (43)
} }));
await runtime.ready;
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || (process.env.CI ? chromium.executablePath () : '/usr/bin/chromium'), args : ['--no-sandbox'] });
try {
    const page = await browser.newPage (); let posted;
    await page.route (origin + '/**', async route => {
        if (route.request ().method () === 'POST') {
            const headers = await route.request ().allHeaders ();
            posted = { origin : headers.origin, form : new URLSearchParams (route.request ().postData ()) };
            await route.fulfill ({ contentType : 'text/plain', body : 'Form received' }); return;
        }
        const response = await runtime.dispatchFetch (route.request ().url ());
        assert.equal (response.status, 200);
        await route.fulfill ({ status : response.status, headers : Object.fromEntries (response.headers), body : await response.text () });
    });
    await page.goto (origin + '/oauth/authorize');
    await Promise.all ([page.waitForURL (url => url.pathname === '/oauth/authorize' && posted !== undefined), page.getByRole ('button', { name : 'Allow', exact : true }).click ()]);
    assert.equal (posted.origin, origin, 'The actual consent page must send a same-origin POST, not Origin: null.');
    assert.equal (posted.form.get ('handle'), 'browser-bound-fixture');
    assert.match (posted.form.get ('binding'), /^\d+\.[a-f0-9]{64}$/);
    assert.equal (posted.form.get ('decision'), 'approve');
    console.log ('Chromium submits the real rendered consent form with its canonical Origin and intact consent binding.');
} finally { await browser.close (); await runtime.dispose (); }
