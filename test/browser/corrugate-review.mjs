import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir ('work/texture-review', { recursive : true });
await build ({ entryPoints : ['test/browser/fixtures/corrugate-review.js'], outfile : 'work/texture-review/review.js', bundle : true, format : 'iife' });
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 960, height : 1000 } }); const errors = []; page.on ('pageerror', e => errors.push (e.message));
    await page.route ('**/review.html', r => r.fulfill ({ contentType : 'text/html', body : '<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#f5f2eb;color:#26323a;font:15px system-ui}h1{font-size:23px}main{display:grid;grid-template-columns:450px 450px;gap:18px}h2{font-size:16px;margin:8px 0}canvas{display:block}p{margin:8px 0}</style><h1>Updated corrugate · actual procedural renderer</h1><p>3 mm board · shared sheet UVs · liner/medium material detail</p><main></main><script src="review.js"></script>' }));
    await page.route ('**/review.js', async r => r.fulfill ({ contentType : 'text/javascript', body : await readFile ('work/texture-review/review.js') }));
    await page.goto ('http://127.0.0.1:8080/review.html'); await page.waitForFunction (() => window.reviewReady || window.reviewError, null, { timeout : 120000 });
    assert.equal (await page.evaluate (() => window.reviewError), undefined); assert.deepEqual (errors, []);
    await page.screenshot ({ path : 'work/texture-review/rendered-review.png', fullPage : true });
    console.log ('Actual rounded joint, across/along flute cuts and textured medium render without page errors or WebGL context loss.');
} finally { await browser.close (); }
