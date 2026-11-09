import * as THREE from 'three';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = [], requests = []; page.on ('pageerror', error => errors.push (error.message)); page.on ('request', request => requests.push (request.url ()));
    await page.route ('https://auto3d.test/**', async route => {
        const url = new URL (route.request ().url ()), name = url.pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'primary-ui', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.getByRole ('button', { name : 'Welcome to Auto3D. Continue to sign in.' }).click ({ timeout : 3000 }).catch (() => {}); // automated browsers skip the welcome screen await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, JSON.stringify (response)); return response.result; };
    await page.locator ('#open_file').setInputFiles ('test/testfiles/gltf/BoxTextured/glTF-Binary/BoxTextured.glb');
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) { const r = await page.evaluate (() => Auto3D.execute ('scene.inspect')); if (r.ok && r.result.objects.length === 1) { ready = true; break; } await page.waitForTimeout (100); }
    assert.equal (ready, true); const scene = await call ('scene.inspect'), objectId = scene.objects[0].id;
    const edges = await call ('dimensions.edges', { objectId, limit : 100 }); assert.equal (edges.total, 12);
    const bounds = await page.locator ('#viewer').boundingBox (), state = await call ('camera.current.inspect');
    const camera = new THREE.PerspectiveCamera (state.fov, bounds.width / bounds.height, 0.001, 100000); camera.position.fromArray (state.eye); camera.up.fromArray (state.up); camera.lookAt (...state.center); camera.updateMatrixWorld (); camera.updateProjectionMatrix ();
    const project = p => { const v = new THREE.Vector3 (...p).project (camera); return { x : bounds.x + (v.x + 1) * bounds.width / 2, y : bounds.y + (1 - v.y) * bounds.height / 2 }; };
    await page.getByRole ('button', { name : 'Dimensions · drag an edge', exact : true }).click ();
    let placed = null;
    for (let i = 0; i < edges.anchors.length; i++) {
        const a = project (edges.segments[i].start), b = project (edges.segments[i].end), mid = { x : (a.x+b.x)/2, y : (a.y+b.y)/2 }, dx = b.x-a.x, dy = b.y-a.y, length = Math.hypot (dx,dy);
        if (length < 20) { continue; }
        await page.mouse.move (mid.x,mid.y); await page.mouse.down (); await page.mouse.move (mid.x-dy/length*65,mid.y+dx/length*65, { steps : 8 });
        assert.equal ((await call ('dimensions.inspect')).dimensions.length, 0, 'A drag preview must not mutate session state');
        await page.mouse.up (); const current = await call ('dimensions.inspect'); if (current.dimensions.length) { placed = current.dimensions[0]; break; }
    }
    assert.ok (placed, 'Dragging a visible canonical edge must create a dimension'); assert.equal (placed.objectId,objectId); assert.ok (Math.abs (placed.lengthMm-1000)<0.001);
    assert.equal (await page.locator ('.dimension_overlay g').count (), 1); assert.equal (await page.locator ('.dimension_overlay text').textContent (), '1,000 mm');
    const selectedEdge = edges.anchors.findIndex (a=>a.mesh===placed.mesh&&a.a===placed.a&&a.b===placed.b);
    assert.ok(selectedEdge>=0);const selectedA=project(edges.segments[selectedEdge].start),selectedB=project(edges.segments[selectedEdge].end),selectedDX=selectedB.x-selectedA.x,selectedDY=selectedB.y-selectedA.y,selectedLength=Math.hypot(selectedDX,selectedDY);
    const labelBox=await page.locator('.dimension_overlay rect').boundingBox(),labelX=labelBox.x+labelBox.width/2,labelY=labelBox.y+labelBox.height/2;
    await page.mouse.move(labelX,labelY);await page.mouse.down();await page.mouse.move(labelX-selectedDY/selectedLength*40,labelY+selectedDX/selectedLength*40,{steps:6});await page.mouse.up();
    const moved=(await call('dimensions.inspect')).dimensions;assert.equal(moved.length,1);assert.ok(Math.abs(moved[0].offset-placed.offset)>30);assert.equal(moved[0].lengthMm,placed.lengthMm);
    const layer = page.locator ('.dimension_layer'); assert.equal (await layer.isVisible (), true); assert.ok ((await page.locator ('.ov_navigator_tree_title').allTextContents ()).some (s=>s.includes ('Layers')));
    await page.getByRole ('button',{name:'Hide Dimensions layer',exact:true}).click (); assert.equal (await page.locator ('.dimension_overlay g').count (),0);
    await page.getByRole ('button',{name:'Show Dimensions layer',exact:true}).click (); assert.equal (await page.locator ('.dimension_overlay g').count (),1);
    await call ('dimensions.tool',{active:false}); await call ('object.transform',{objectId,scale:[2,2,2]}); assert.equal ((await call ('dimensions.inspect')).dimensions[0].lengthMm,2000);
    assert.equal (await page.locator ('.dimension_overlay text').textContent (),'2,000 mm');
    await call ('preferences.units',{units:'standard'}); assert.match (await page.locator ('.dimension_overlay text').textContent (),/78\.7402 in/);
    await call ('view.focus',{objectId}); await page.waitForTimeout (800);
    await call ('preferences.units',{units:'metric'}); await mkdir ('work/dimensions-review',{recursive:true});
    await page.screenshot ({path:'work/dimensions-review/dark.png'});
    // Dual-contrast strokes and opaque labels remain readable on both themes.
    await call ('preferences.theme',{theme:'light'}); await page.screenshot ({path:'work/dimensions-review/light.png'});
    assert.equal (await page.locator ('.dimension_overlay path[stroke="#fff"]').count (),1); assert.equal (await page.locator ('.dimension_overlay rect').getAttribute ('fill'),'#111');
    await call ('dimensions.tool',{active:true}); await page.keyboard.press ('Escape'); assert.equal ((await call ('dimensions.inspect')).active,false);
    await call ('dimensions.delete',{id:placed.id}); assert.equal ((await call ('dimensions.inspect')).dimensions.length,0); await call ('history.undo'); assert.equal ((await call ('dimensions.inspect')).dimensions.length,1);
    await page.setViewportSize ({width:390,height:844}); assert.equal (await page.evaluate (()=>document.documentElement.scrollWidth>innerWidth),false); await page.screenshot ({path:'work/dimensions-review/mobile.png'});
    await page.setViewportSize ({width:1500,height:1000}); await call ('object.visibility',{objectId,visible:false});
    const box = await call ('packaging.fefco.generate',{code:'0201',length:400,width:300,height:250,thickness:3,closure:'open'});
    await call ('view.focus',{objectId:box.objectId});
    const boxEdges = await call ('dimensions.edges',{objectId:box.objectId,limit:100});
    const boxIndex = boxEdges.segments.findIndex (v => Math.abs(v.start[0]-v.end[0])<1e-6 && Math.abs(v.start[1]-v.end[1])<1e-6 && v.lengthMm>100);
    assert.ok(boxIndex>=0); const added = await call ('dimensions.add',{anchor:boxEdges.anchors[boxIndex],offset:40}); const boxDim = added.dimensions.find(d=>d.objectId===box.objectId);
    assert.equal(boxDim.basis,'OD'); assert.equal(boxDim.lengthMm,406); assert.ok(boxDim.placement);
    await call ('dimensions.placement',{id:boxDim.id,plane:90,distanceMm:45});
    const fixed = (await call ('dimensions.inspect')).dimensions.find(d=>d.id===boxDim.id).placement;
    await call ('camera.fov',{fov:55}); assert.deepEqual((await call ('dimensions.inspect')).dimensions.find(d=>d.id===boxDim.id).placement,fixed);
    const valueLabel = page.locator(`.dimension_overlay g[data-dimension-id="${boxDim.id}"] rect`);
    await valueLabel.dblclick(); await page.getByRole('spinbutton',{name:'Dimension value'}).fill('450'); await page.getByRole('button',{name:'Apply',exact:true}).click();
    await page.getByRole('dialog',{name:'Edit dimension',exact:true}).waitFor({state:'detached'});
    assert.equal((await call ('dimensions.inspect')).dimensions.find(d=>d.id===boxDim.id).lengthMm,450);
    const flat = await call ('packaging.fefco.unfold',{objectId:box.objectId}); await call ('view.focus',{objectId:flat.objectId}); await page.waitForTimeout (800);
    const switched = (await call ('dimensions.inspect')).dimensions.find(d=>d.id===boxDim.id); assert.equal(switched.basis,'ID'); assert.equal(switched.objectId,flat.objectId);
    await call ('dimensions.value',{id:boxDim.id,valueMm:420}); assert.equal((await call ('dimensions.inspect')).dimensions.find(d=>d.id===boxDim.id).lengthMm,420);
    await call ('dimensions.delete',{id:boxDim.id});
    const cad = await call ('dimensions.edges',{objectId:flat.objectId,limit:100}); assert.ok (cad.anchors.every (a=>a.kind==='cad'));
    const cadBounds = await page.locator ('#viewer').boundingBox (), cadState = await call ('camera.current.inspect');
    const cadCamera = new THREE.PerspectiveCamera (cadState.fov,cadBounds.width/cadBounds.height,0.001,100000); cadCamera.position.fromArray (cadState.eye); cadCamera.up.fromArray (cadState.up); cadCamera.lookAt (...cadState.center); cadCamera.updateMatrixWorld (); cadCamera.updateProjectionMatrix ();
    const cadProject = point => { const v = new THREE.Vector3 (...point).project (cadCamera); return {x:cadBounds.x+(v.x+1)*cadBounds.width/2,y:cadBounds.y+(1-v.y)*cadBounds.height/2}; };
    await call ('dimensions.tool',{active:true}); let cadPlaced;
    for (let i=0;i<cad.anchors.length;i++) {
        const a=cadProject(cad.segments[i].start), b=cadProject(cad.segments[i].end), mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2}, dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
        if(len<30||mid.x<cadBounds.x+10||mid.x>cadBounds.x+cadBounds.width-10||mid.y<cadBounds.y+10||mid.y>cadBounds.y+cadBounds.height-10){continue;}
        await page.mouse.move(mid.x,mid.y);await page.mouse.down();await page.mouse.move(mid.x-dy/len*45,mid.y+dx/len*45,{steps:6});await page.mouse.up();
        cadPlaced=(await call('dimensions.inspect')).dimensions.find(d=>d.kind==='cad');if(cadPlaced){break;}
    }
    assert.ok(cadPlaced,'A flat CAD line drag must link its canonical path');assert.ok(Math.abs(cadPlaced.lengthMm-cadPlaced.sourceLengthMm)<0.000001);assert.ok(cadPlaced.pathId);
    await page.screenshot({path:'work/dimensions-review/cad.png'});
    assert.deepEqual (errors,[]); console.log ('Dimension edge drag, nonmutating preview, CAD/model lengths, layer visibility, live transforms, units, contrast, Undo and mobile layout passed.');
} finally { await browser.close (); }
