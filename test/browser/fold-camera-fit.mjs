import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
// Fold/unfold auto-fit keeps the box closely cropped: it frames the current pose's visible meshes,
// follows a closing box back in, and re-frames the finished object.
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1400, height : 900 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'fold-fit', email : 'fixture@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric', viewportQuality : 'fast' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments', 'packaging/boards']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, id + ' ' + JSON.stringify (result.error)); return result.result; };
    // Record the camera on a short interval while one fold/unfold plays, then let the final re-fit settle.
    const play = async () => {
        const samples = await page.evaluate (async () => {
            const out = []; await Auto3D.execute ('packaging.fefco.toggle', {});
            for (;;) {
                const state = (await Auto3D.execute ('packaging.fefco.playback.inspect', {})).result; const camera = (await Auto3D.execute ('camera.current.inspect', {})).result;
                out.push ({ progress : state.progress ?? 1, distance : camera.distance, center : camera.center });
                if (state.state !== 'playing' && state.state !== 'paused') { return out; }
                await new Promise (resolve => setTimeout (resolve, 100));
            }
        });
        let settled = null; for (let retry = 0; retry < 60; retry++) { const next = await call ('camera.current.inspect'); if (settled && Math.abs (settled.distance - next.distance) < 1e-6) { break; } settled = next; await page.waitForTimeout (100); }
        return { samples, final : settled };
    };
    await call ('packaging.fefco.preset', { code : '0201', length : 300, width : 200, height : 150, thickness : 3, closure : 'closed' }); await call ('view.fit');
    const unfold = await play (); const fold = await play ();
    // A closed 300 × 200 × 150 box fits within roughly 700; the flat blank needs more room but far less than its bounding sphere.
    assert.ok (fold.final.distance < 750, 'closed box framed closely: ' + fold.final.distance);
    assert.ok (unfold.final.distance < 1400, 'flat dieline framed closely: ' + unfold.final.distance);
    assert.ok (fold.final.distance < unfold.final.distance * 0.7, 'the camera zooms back in after folding');
    // The camera centre stays on the folding box (no jump to the finished object's position).
    const late = fold.samples.filter (sample => sample.progress > 0.6);
    assert.ok (late.length > 0 && late.every (sample => Math.abs (sample.center[0] - fold.final.center[0]) < 40), JSON.stringify (late.map (sample => sample.center)));
    // Slow runners may record only one late sample, so compare each late sample with the settled result:
    // the camera never sits closer than the final framing while the box is still closing.
    assert.ok (late.every (sample => sample.distance >= fold.final.distance - 1), 'camera moves in to the final framing as the box closes: ' + JSON.stringify (late.map (sample => Math.round (sample.distance))));
    assert.deepEqual (errors, []);
    console.log ('Fold auto-fit stayed on the box, zoomed in as it closed and re-framed the result:', JSON.stringify ({ unfold : Math.round (unfold.final.distance), fold : Math.round (fold.final.distance) }));
} finally { await browser.close (); }
