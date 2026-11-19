import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Can collar: a standard beverage can arrayed 3 × 2 into a six-pack gets a paperboard collar from the
// Accessories tab (rim sensed from the geometry, rounded corners, tabbed relief holes tucked under the rims),
// grouped with the cans, one Undo step; the CAD Shape tools round corners and add circles and relief holes.
await mkdir ('work/can-collar', { recursive : true });
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 900 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', e => errors.push (e.message));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : [] } }));
    await page.route ('**/api/personal/items', route => route.fulfill ({ json : [] }));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
    await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false } }));
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const run = (id, args) => page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args });
    const call = async (id, args = {}) => { let r; for (let i = 0; i < 300; i++) { r = await run (id, args); if (r.ok || !/busy|Wait for/.test (r.error?.message || '')) { break; } await page.waitForTimeout (100); } assert.equal (r.ok, true, id + ' ' + JSON.stringify (r)); return r.result; };
    const fails = async (id, args, pattern) => { const r = await run (id, args); assert.equal (r.ok, false, id); if (pattern) { assert.match (r.error?.message || JSON.stringify (r), pattern); } };

    // A standard beverage can from the product library, arrayed 3 × 2 touching: a six-pack.
    const can = await call ('primary.designs.generate', { id : 'standard-beverage' });
    await call ('object.array', { objectId : can.objectId, width : 3, length : 2, height : 1, gap : { width : 0, length : 0 }, animate : false });
    assert.equal ((await call ('scene.inspect')).objects.length, 6);
    await call ('object.select', { objectId : can.objectId });

    const inspect = await call ('packaging.accessories.collar.inspect', {});
    assert.equal (inspect.available, true, JSON.stringify (inspect)); assert.equal (inspect.cans, 6);
    // Standard beverage can: Ø 66 × 122 mm; its seam rim overhangs the neck under it.
    assert.ok (Math.abs (inspect.rim.canDiameterMm - 66) < 0.5 && Math.abs (inspect.rim.canHeightMm - 122) < 0.5, JSON.stringify (inspect.rim));
    assert.ok (inspect.rim.undercutMm > 0.2 && inspect.rim.radiusMm < 33, JSON.stringify (inspect.rim));
    assert.ok (inspect.rim.bottomMm > 118 && inspect.rim.bottomMm < 122, JSON.stringify (inspect.rim));
    assert.equal (inspect.collar.cans, 6); assert.ok (Math.abs (inspect.collar.holeRadiusMm - (inspect.rim.radiusMm - 1.5)) < 1e-6);
    assert.equal (inspect.collar.automaticTuck, true); assert.ok (inspect.collar.neckClearanceMm >= .0254 - 1e-7);
    assert.ok (inspect.collar.reliefRadiusMm > inspect.rim.radiusMm && inspect.collar.webMm >= 1.5 - 1e-6);
    await fails ('packaging.accessories.collar', { boardId : 'tissue' });
    await fails ('packaging.accessories.collar', { tuckMm : 40 });

    // The Accessories tab shows the collar for the selected cans and adds it.
    await call ('packaging.tab', { tab : 'accessories' });
    const panel = page.getByRole ('region', { name : 'Can collar', exact : true }); await panel.waitFor ();
    assert.equal (await panel.getByLabel ('Tuck under rim (mm, blank fits neck)', { exact : true }).inputValue (), '');
    await page.waitForFunction (() => /6 cans · rim Ø/.test (document.querySelector ('[aria-label="Can collar"]')?.textContent || ''));
    await panel.getByLabel ('Collar board', { exact : true }).selectOption ('sbs-24pt');
    const before = (await call ('scene.inspect')).objects.length;
    await panel.getByRole ('button', { name : 'Add can collar', exact : true }).click ();
    await page.waitForFunction (() => /Added a 6-can collar/.test (document.querySelector ('[aria-label="Can collar"]')?.textContent || ''));
    const scene = await call ('scene.inspect'); assert.equal (scene.objects.length, before + 1);
    const collar = scene.objects.find (o => o.userData?._auto3dAccessory && JSON.parse (o.userData._auto3dAccessory).kind === 'collar');
    const data = JSON.parse (collar.userData._auto3dAccessory); assert.equal (data.canIds.length, 6); assert.equal (data.boardId, 'sbs-24pt'); assert.equal (data.thicknessMm, 0.61);
    // Grouped with the cans; the collar top sits just below the rim underside.
    const cans = scene.objects.filter (o => data.canIds.includes (o.id)); assert.ok (cans.every (o => o.userData._auto3dGroup === collar.userData._auto3dGroup));
    const bounds = await call ('object.bounds', { objectId : collar.id }).catch (() => null);
    if (bounds?.max) { assert.ok (Math.abs (bounds.max[1] * 1 - inspect.rim.bottomMm / 1) < 1, JSON.stringify (bounds)); }
    // One Undo step removes the collar and restores the cans' grouping; Redo brings it back.
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, before);
    await call ('history.redo'); assert.equal ((await call ('scene.inspect')).objects.length, before + 1);
    // The collar profile: rounded outline plus a tabbed relief hole per can.
    await call ('object.select', { objectId : collar.id, single : true }); await call ('packaging.open_selected');
    const profile = await call ('packaging.inspect'); assert.equal (profile.paths.length, 7); assert.equal (profile.thickness, 0.61);
    await page.screenshot ({ path : 'work/can-collar/collar-cad.png' });
    // A second collar for the same cans is refused.
    await page.keyboard.press ('Escape'); await call ('object.select', { objectId : can.objectId });
    await fails ('packaging.accessories.collar', {}, /already have a collar/);
    await call ('view.fit'); await page.screenshot ({ path : 'work/can-collar/six-pack.png' });

    // CAD Shape tools on a fresh drawing: a rectangle with rounded corners, a circle and a relief hole.
    const rect = await call ('packaging.path.add', { points : [[0, 0], [200, 0], [200, 120], [0, 120]], type : 'cut', closed : true, units : 'mm' });
    const rounded = await call ('packaging.path.round_corners', { ids : [rect.pathId], radius : 15, units : 'mm' }); assert.equal (rounded.rounded, 4);
    await call ('packaging.path.circle', { center : [50, 60], radius : 20, units : 'mm' });
    const hole = await call ('packaging.path.relief_hole', { center : [140, 60], holeRadius : 27.4, reliefRadius : 31.9, tabs : 16, units : 'mm' }); assert.equal (hole.tabs, 16);
    await fails ('packaging.path.relief_hole', { center : [140, 60], holeRadius : 30, reliefRadius : 30.1, units : 'mm' }, /0.2 mm/);
    await fails ('packaging.path.round_corners', { ids : [rect.pathId], radius : -1, units : 'mm' });
    assert.deepEqual (errors, []);
    console.log ('Can collar: six-pack rim sensing, tabbed relief holes, rounded corners, group, Undo/Redo, duplicate refusal and CAD shape tools passed.');
} finally { await browser.close (); }
