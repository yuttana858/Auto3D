import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd (), browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox'] });
try {
    const page = await browser.newPage ();
    await page.route ('https://vectors.test/**', async route => {
        const pathname = new URL (route.request ().url ()).pathname;
        if (pathname === '/') { return route.fulfill ({ contentType : 'text/html', body : '<!doctype html><title>Label vectors</title>' }); }
        const file = path.resolve (root, '.' + pathname); assert.ok (file.startsWith (root + path.sep));
        return route.fulfill ({ contentType : 'text/javascript', body : await readFile (file) });
    });
    await page.goto ('https://vectors.test/');
    const result = await page.evaluate (async () => {
        const { ExtractLabelVectors, TraceLabelImage } = await import ('/source/website/primarylabelvectors.js');
        const svg = content => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + content + '</svg>';
        const extract = content => ExtractLabelVectors (svg (content), 50, 50);
        const initialNodes = document.body.childElementCount;
        const rectangle = extract ('<g transform="translate(10 20)"><rect width="40" height="20" fill="red"/></g>');
        const strokes = extract ('<line x1="0" y1="0" x2="100" y2="100" stroke="#123456" stroke-width="2"/>');
        const curves = extract ('<path d="M10 50 C10 0 90 0 90 50 C90 100 10 100 10 50Z" fill="#369"/>');
        const rounded = extract ('<rect width="100" height="100" rx="10" fill="blue"/>');
        const fillOpen = extract ('<path d="M0 0L100 0L50 100" fill="green"/>');
        const fallbacks = [
            '<text x="10" y="50">Keep text editable</text>',
            '<path d="M0 0L100 0L100 100Z M10 10L20 10L20 20Z"/>',
            '<rect width="100" height="100" opacity=".5"/>',
            '<g opacity=".5"><circle cx="50" cy="50" r="30"/></g>',
            '<line x2="100" y2="100" stroke="black" stroke-dasharray="2 3"/>',
            '<g transform="scale(2 1)"><line x2="30" y2="30" stroke="black"/></g>',
            '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>',
            '<g>' + '<rect width="1" height="1"/>'.repeat (81) + '</g>'
        ].map (extract);
        let blocked = false; try { extract ('<image href="https://example.com/image.png"/>'); } catch { blocked = true; }
        const canvas = document.createElement ('canvas'); canvas.width = 32; canvas.height = 32; const context = canvas.getContext ('2d');
        context.fillStyle = '#ff0000'; context.fillRect (0, 0, 32, 32); context.clearRect (8, 8, 16, 16);
        const buffer = await (await new Promise (resolve => canvas.toBlob (resolve, 'image/png'))).arrayBuffer ();
        const trace = await TraceLabelImage (buffer, 'image/png', 40, 40);
        const traceHoleEmpty = trace.paths.every (path => !path.points.some (point => Math.abs (point[0]) < 9.9 && Math.abs (point[1]) < 9.9));
        const noise = context.createImageData (32, 32);
        for (let i = 0; i < noise.data.length; i += 4) { noise.data[i] = (i * 137 + 37) % 256; noise.data[i + 1] = (i * 43 + 13) % 256; noise.data[i + 2] = (i * 7 + 157) % 256; noise.data[i + 3] = 255; }
        context.putImageData (noise, 0, 0); const noiseBuffer = await (await new Promise (resolve => canvas.toBlob (resolve, 'image/png'))).arrayBuffer ();
        const complexTrace = await TraceLabelImage (noiseBuffer, 'image/png', 50, 30);
        let mimeBlocked = false; try { await TraceLabelImage (buffer, 'image/jpeg', 40, 40); } catch { mimeBlocked = true; }
        return { rectangle, strokes, curves, rounded, fillOpen, fallbacks, blocked, trace, traceHoleEmpty, complexTrace, mimeBlocked, clean : document.body.childElementCount === initialNodes };
    });
    assert.equal (result.rectangle.vectorized, true);
    assert.deepEqual (result.rectangle.paths[0].points, [[-20, 15], [0, 15], [0, 5], [-20, 5]]);
    assert.equal (result.rectangle.paths[0].fill, '#ff0000');
    assert.equal (result.strokes.paths[0].strokeWidth, 1);
    assert.equal (result.strokes.paths[0].closed, false);
    assert.equal (result.curves.vectorized, true); assert.ok (result.curves.paths[0].points.length > 32); assert.ok (result.curves.paths[0].points.length < 1800);
    assert.equal (result.rounded.vectorized, true); assert.ok (result.rounded.paths[0].points.length > 4);
    assert.equal (result.fillOpen.paths[0].closed, true);
    assert.ok (result.fallbacks.every (entry => entry.unsupported && !entry.vectorized && entry.paths.length === 0));
    assert.equal (result.blocked, true); assert.equal (result.clean, true);
    assert.equal (result.trace.approximate, true); assert.equal (result.trace.paths.length, 4); assert.equal (result.traceHoleEmpty, true);
    assert.ok (result.trace.paths.every (path => path.fill === '#ff0000' && path.points.length === 4));
    assert.equal (result.complexTrace.vectorized, true); assert.equal (result.complexTrace.approximate, true);
    assert.ok (result.complexTrace.paths.length <= 80); assert.ok (result.complexTrace.paletteSize <= 8); assert.equal (result.mimeBlocked, true);
    console.log ('Primary label vector conversion: pass');
} finally { await browser.close (); }
