import { SessionEditor } from '../source/website/sessioneditor.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RenderDimensions, RenderTiles, FlipRenderPixels, RenderCamera } from '../source/website/rendercore.js';
import { RenderQueue } from '../source/website/renderqueue.js';
import { ArrayCellSize, ArrayPlacement } from '../source/website/arraylayout.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { Camera } from '../source/engine/viewer/camera.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
const camera = { eye : [4, 5, 6], center : [0, 0, 0], up : [0, 1, 0], fov : 45, projectionMode : 1 };
function website () {
    const views = [{ id : 'one', name : 'One', state : camera }, { id : 'two', name : 'Two', state : { ...camera, fov : 60 } }];
    return { auth : { user : { id : 'account' }, loggedOut : false }, accountReady : true, viewer : { GetImageSize : () => ({ width : 800, height : 600 }), GetCamera : () => new Camera (new Coord3D (4, 5, 6), new Coord3D (0, 0, 0), new Coord3D (0, 1, 0), 45), navigation : { enabled : true } }, sessionEditor : { document : { objects : [{}] }, timeline : { Stop : () => {} }, players : [], RefreshButtons : () => {}, cameras : { Inspect : () => ({ views }), Find : id => { const view = views.find (item => item.id === id); if (!view) { throw new Error ('Unknown camera'); } return view; } } } };
}
describe ('Tiled PNG rendering', () => {
    it ('validates HD/4K/16K dimensions and covers every pixel with bounded tiles', () => {
        assert.deepEqual (RenderDimensions ('16k'), { width : 15360, height : 8640 }); assert.deepEqual (RenderDimensions ('4k'), { width : 3840, height : 2160 });
        assert.throws (() => RenderDimensions ('unknown')); assert.throws (() => RenderDimensions ('screen', { width : 99999, height : 1 }));
        const tiles = RenderTiles (1920, 1080, 512); assert.equal (tiles.reduce ((area, tile) => area + tile.width * tile.height, 0), 1920 * 1080);
        assert.ok (tiles.every (tile => tile.width <= 512 && tile.height <= 512 && tile.x + tile.width <= 1920 && tile.y + tile.height <= 1080));
        assert.throws (() => RenderTiles (1, 1, 0));
    });
    it ('flips framebuffer rows and unpremultiplies transparent edge colors for PNG', () => {
        const pixels = new Uint8Array ([0, 0, 0, 0, 40, 20, 10, 128]);
        assert.deepEqual ([...FlipRenderPixels (pixels, 1, 2, true)], [80, 40, 20, 128, 0, 0, 0, 0]);
        const perspective = RenderCamera (camera, 1920, 1080, 0.1, 100); assert.equal (perspective.aspect, 1920 / 1080);
        assert.equal (RenderCamera ({ ...camera, projectionMode : 2 }, 1920, 1080, 0.1, 100).isOrthographicCamera, true);
    });
});
describe ('Render job queue', () => {
    let previousDocument;
    beforeEach (() => { previousDocument = global.document; global.document = { getElementById : () => null }; });
    afterEach (() => { global.document = previousDocument; });
    it ('queues camera snapshots, executes sequentially and restores editing after a failed job', async () => {
        const app = website (); let calls = 0; const seen = [];
        const queue = new RenderQueue (app, async (_, job, options) => { calls++; seen.push (job.name); options.progress (90); if (calls === 1) { throw new Error ('GPU failed'); } return new Blob (['png'], { type : 'image/png' }); });
        queue.Enqueue ({ resolution : 'hd', allCameras : true, alpha : true }); app.sessionEditor.cameras.Inspect ().views[1].state.fov = 35;
        assert.equal (queue.jobs[1].camera.fov, 60); queue.Start (); await queue.completion;
        assert.deepEqual (seen, ['One', 'Two']); assert.equal (queue.jobs[0].status, 'failed'); assert.equal (queue.jobs[1].status, 'completed');
        assert.equal (app.sessionEditor.busy, false); assert.equal (app.viewer.navigation.enabled, true); assert.equal (queue.running, false);
        assert.equal ('blob' in queue.Inspect ()[1], false); queue.Clear (); assert.equal (queue.jobs.length, 0);
    });
    it ('permits cancellation commands while a job is running and clears account data on lock', async () => {
        const app = website (); let release; app.rendering = new RenderQueue (app, async (_, job, { cancelled }) => { await new Promise (resolve => { release = resolve; }); if (cancelled ()) { throw new Error ('cancelled'); } return new Blob (['png']); });
        const registry = CreateAgentCommands (app); const result = await registry.Execute ('render.queue.enqueue', { resolution : '4k', cameraId : 'one' });
        assert.equal (result.ok, true); assert.equal ((await registry.Execute ('render.queue.start')).ok, true); assert.equal (app.sessionEditor.busy, true);
        assert.equal ((await registry.Execute ('render.queue.cancel', { id : result.result.jobs[0].id })).ok, true); release (); await app.rendering.completion;
        assert.equal (app.rendering.jobs[0].status, 'cancelled'); app.rendering.Lock (); assert.equal (app.rendering.jobs.length, 0);
    });
    it ('renders in background with immutable camera snapshots and live navigation, restoring controls', async () => {
        const app = website (); let release; let hooks; let reveals = 0;
        const main = { inert : false }; const toolbar = { inert : false };
        global.document.getElementById = id => id === 'main_viewer' ? main : id === 'toolbar' ? toolbar : null;
        app.renderingPanel = { RevealQueue : () => reveals++, RenderQueue : () => {} };
        const queue = new RenderQueue (app, async (_, job, options) => {
            hooks = options; assert.equal (app.sessionEditor.busy, true); assert.equal (app.viewer.navigation.enabled, true);
            assert.equal (main.inert, false); assert.equal (toolbar.inert, true);
            await new Promise (resolve => { release = resolve; });
            job.previewDataUri = 'data:image/png;base64,test'; return new Blob (['png']);
        });
        const result = queue.RenderNow ({ background : true }); assert.equal (result.running, true); assert.ok (reveals > 0);
        assert.deepEqual (queue.jobs[0].size, { width : 800, height : 600 }); assert.equal (hooks.background, true); assert.equal (hooks.tileSize, 512);
        app.viewer.GetCamera = () => new Camera (new Coord3D (20, 20, 20), new Coord3D (), new Coord3D (0, 1, 0), 45);
        assert.deepEqual (queue.jobs[0].camera.eye, [4, 5, 6]);
        assert.throws (() => queue.RenderNow ({})); assert.equal (queue.jobs.length, 1);
        release (); await queue.completion;
        const info = queue.Inspect ()[0]; assert.equal (info.mode, 'background'); assert.equal (info.thumbnailAvailable, true);
        assert.equal ('previewDataUri' in info, false); assert.equal ('thumbnail' in info, false);
        assert.equal (queue.Preview (info.id), 'data:image/png;base64,test');
        assert.equal (toolbar.inert, false); assert.equal (app.sessionEditor.busy, false); assert.equal (app.viewer.navigation.enabled, true);
    });
    it ('validates selection before deletion, releases windows and cancels active jobs on clear', async () => {
        const app = website (); let release;
        app.rendering = new RenderQueue (app, async (_, job, { cancelled }) => { await new Promise (resolve => { release = resolve; }); assert.equal (cancelled (), true); return new Blob (['png']); });
        const queue = app.rendering; const registry = CreateAgentCommands (app);
        const ids = queue.Enqueue ({ allCameras : true }).map (job => job.id);
        assert.throws (() => queue.Delete ([ids[0], 'missing'])); assert.equal (queue.jobs.length, 2);
        assert.equal ((await registry.Execute ('render.queue.delete', { ids : [] })).ok, false);
        let disposed = 0; queue.views.set (ids[1], { dispose : () => disposed++ });
        assert.equal ((await registry.Execute ('render.queue.delete', { ids : [ids[1]] })).ok, true); assert.equal (disposed, 1);
        queue.Start (); assert.equal (app.viewer.navigation.enabled, false);
        queue.Clear ({ all : false }); assert.equal (queue.jobs.length, 1);
        assert.equal ((await registry.Execute ('render.queue.clear', { all : true })).ok, true); assert.equal (queue.jobs.length, 0);
        release (); await queue.completion; assert.equal (queue.jobs.length, 0); assert.equal (queue.running, false);
        assert.equal (app.viewer.navigation.enabled, true); assert.equal (app.sessionEditor.busy, false);
    });
    it ('indexes render actions with strict schemas and rejects busy requests before enqueue', async () => {
        const app = website (); app.rendering = new RenderQueue (app); const registry = CreateAgentCommands (app);
        for (const id of ['render.now', 'render.queue.open', 'render.queue.delete']) { assert.equal (registry.Catalog ().some (command => command.id === id), true); }
        assert.equal ((await registry.Execute ('render.now', { background : 'yes' })).ok, false);
        assert.equal ((await registry.Execute ('render.queue.start', { background : 1 })).ok, false);
        app.sessionEditor.busy = true;
        assert.equal ((await registry.Execute ('render.now')).ok, false); assert.equal (app.rendering.jobs.length, 0);
        app.sessionEditor.busy = false; app.accountReady = false;
        assert.throws (() => app.rendering.RenderNow ()); assert.equal (app.rendering.jobs.length, 0);
    });
    it ('rejects invalid inputs, camera IDs, queue overflow and unapproved account readiness', () => {
        const app = website (); const queue = new RenderQueue (app);
        assert.throws (() => queue.Enqueue ({ cameraId : 'unknown' })); assert.throws (() => queue.Enqueue ({ cameraId : 'one', allCameras : true }));
        assert.throws (() => queue.Enqueue ({ alpha : 'true' }));
        for (let index = 0; index < 20; index++) { queue.Enqueue ({}); } assert.throws (() => queue.Enqueue ({}));
        app.accountReady = false; assert.throws (() => queue.Enqueue ({})); assert.throws (() => queue.Start ());
    });
    it ('preflights rendering macros and keeps queue creation free of scene mutation', async () => {
        const app = website (); app.rendering = new RenderQueue (app); const registry = CreateAgentCommands (app);
        const result = await registry.RunMacro ({ version : 1, steps : [{ id : 'add', command : 'render.queue.enqueue', arguments : { allCameras : true, alpha : true, resolution : 'hd' } }, { id : 'inspect', command : 'render.queue.inspect', arguments : {} }] });
        assert.equal (result.ok, true); assert.equal (result.completed[1].result.jobs.length, 2);
        assert.equal ((await registry.Execute ('render.queue.enqueue', { resolution : '32k' })).ok, false);
        assert.equal ((await registry.Execute ('render.queue.enqueue', { token : 'unexpected' })).ok, false);
    });
});
describe ('Alternating array layers', () => {
    it ('adds independent edge gaps after rotation and preserves layer heights', () => {
        const size = new THREE.Vector3 (4, 2, 8); const gap = new THREE.Vector3 (1, 3, 5);
        assert.deepEqual (ArrayCellSize (size, 90, gap).toArray ().map (n => Math.round (n)), [9, 5, 13]);
        const bounds = new THREE.Box3 (new THREE.Vector3 (), size); const source = { position : [0, 0, 0], rotation : [0, 0, 0] };
        const placed = ArrayPlacement (source, bounds, size, 1, 1, 2, 90, gap);
        assert.deepEqual (placed.position.map (n => Math.round (n)), [9, 10, 13]);
        assert.throws (() => ArrayCellSize (size, 0, new THREE.Vector3 (-1, 0, 0)));
        assert.throws (() => ArrayCellSize (size, 0, new THREE.Vector3 (0, NaN, 0)));
    });

    it ('rotates odd layers around their bounds center and expands spacing for rectangular footprints', () => {
        const size = new THREE.Vector3 (4, 2, 8); const bounds = new THREE.Box3 (new THREE.Vector3 (10, 0, 20), new THREE.Vector3 (14, 2, 28)); const source = { position : [10, 0, 20], rotation : [0, 0, 0] };
        const cell = ArrayCellSize (size, 90); assert.ok (Math.abs (cell.x - 8) < 1e-9); assert.ok (Math.abs (cell.z - 8) < 1e-9);
        const even = ArrayPlacement (source, bounds, size, 0, 0, 2, 90); assert.deepEqual (even.rotation, [0, 0, 0]);
        const odd = ArrayPlacement (source, bounds, size, 0, 0, 1, 90); const q = new THREE.Quaternion ().setFromEuler (new THREE.Euler (...odd.rotation.map (THREE.MathUtils.degToRad)));
        const offset = bounds.getCenter (new THREE.Vector3 ()).sub (new THREE.Vector3 (...source.position)).applyQuaternion (q).add (new THREE.Vector3 (...odd.position));
        assert.ok (offset.distanceTo (new THREE.Vector3 (12, 3, 24)) < 1e-9);
        assert.ok (ArrayCellSize (size, 45).x > size.x); assert.throws (() => ArrayCellSize (size, 60));
    });
});

describe ('Live scale percentage baseline', () => {
    it ('uses the edit baseline rather than compounding every valid input event', () => {
        const object = { id : 'model', position : [0, 0, 0], rotation : [0, 0, 0], scale : [1, 2, 3] }; const baseline = [...object.scale];
        const editor = { ApplyTransform : () => {}, RecordTransform : () => {}, UpdateDetails : () => {} };
        SessionEditor.prototype.ScaleByPercentage.call (editor, object, 125, baseline);
        SessionEditor.prototype.ScaleByPercentage.call (editor, object, 150, baseline);
        assert.deepEqual (object.scale, [1.5, 3, 4.5]);
        assert.throws (() => SessionEditor.prototype.ScaleByPercentage.call (editor, object, NaN, baseline));
        assert.deepEqual (object.scale, [1.5, 3, 4.5]);
    });
});
