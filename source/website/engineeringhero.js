import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CreateEngineeringPack, PoseEngineeringPack } from './engineeringpack.js';
import { CreatePresentationPulpSide } from './engineeringpulp.js';
import { CollectEngineeringFitPoints, CreateEngineeringCamera } from './engineeringcamera.js';
import { ReleaseWebGLRenderer } from './webglcleanup.js';
import { EngineeringSequenceState, EngineeringStagePositions, EngineeringSequenceDuration, EngineeringTiming } from './engineeringsequence.js';

// An illustrative assembly, deliberately separate from manufacturing CAD and session geometry.
export const EngineeringStages = [
    { title : 'Model the product', detail : 'Geometry becomes the starting point.', time : 3.5 },
    { title : 'Build the protection', detail : 'Molded pulp cradles the product.', time : 7.1 },
    { title : 'Engineer the structure', detail : 'Full-depth returns meet. Short tongues enter matching slots.', time : 13.6 },
    { title : 'See every layer', detail : 'Move between the physical pack and its digital geometry.', time : 20 }
];

export function CreateEngineeringHero (canvas, { onState = () => {} } = {})
{
    const resources = new Set (); let renderer;
    const fallback = () => { onState ({ available : false, playing : false, stage : 3 }); return { dispose () {}, setActive () {}, inspect : () => ({ available : false, playing : false, stage : 3 }), control : () => ({ available : false, playing : false, stage : 3 }) }; };
    try { renderer = new THREE.WebGLRenderer ({ canvas, alpha : true, antialias : true }); } catch { return fallback (); }
    renderer.setPixelRatio (Math.min (window.devicePixelRatio || 1, 1.5)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.localClippingEnabled = true;
    const scene = new THREE.Scene ();
    const room = new RoomEnvironment (); const pmrem = new THREE.PMREMGenerator (renderer);
    const environment = pmrem.fromScene (room, 0.04); scene.environment = environment.texture; scene.environmentIntensity = 0.6; pmrem.dispose (); room.dispose ();
    scene.add (new THREE.HemisphereLight (0xdce9ff, 0x27213b, 0.7));
    const key = new THREE.DirectionalLight (0xe1ebff, 1.8); key.position.set (5, 9, 6); scene.add (key);
    const rim = new THREE.DirectionalLight (0x4ab8ff, 1.3); rim.position.set (-6, 4, -3); scene.add (rim);
    const camera = new THREE.PerspectiveCamera (34, 1, 0.1, 100);
    camera.zoom = 1.2;
    const assembly = new THREE.Group (); scene.add (assembly);
    const product = new THREE.Group (), inserts = new THREE.Group ();
    assembly.add (product, inserts);
    const solids = [], wireMats = [], wires = [];
    const cut = new THREE.Plane (new THREE.Vector3 (-0.78, 0, 0.62).normalize (), 8), reveal = new THREE.Plane (new THREE.Vector3 (0.78, 0, -0.62).normalize (), -8);
    function texture (kind) {
        const size = 256, image = document.createElement ('canvas'); image.width = image.height = size; const context = image.getContext ('2d');
        const pixels = context.createImageData (size, size); let seed = 41;
        const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const pulp = kind === 'pulp', coarse = Array.from ({ length : 16 * 16 }, random);
        const sample = (x, y) => coarse[(y % 16) * 16 + x % 16];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const gx = x / 16, gy = y / 16, ix = Math.floor (gx), iy = Math.floor (gy), fx = gx - ix, fy = gy - iy;
                const grain = THREE.MathUtils.lerp (THREE.MathUtils.lerp (sample (ix, iy), sample (ix + 1, iy), fx), THREE.MathUtils.lerp (sample (ix, iy + 1), sample (ix + 1, iy + 1), fx), fy);
                const v = pulp ? 160 + grain * 55 + random () * 35 : 210 + random () * 30;
                const i = (y * size + x) * 4; pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v; pixels.data[i + 3] = 255;
            }
        }
        context.putImageData (pixels, 0, 0);
        // Short cellulose strands and broad grain make the pulp read as pressed paper.
        for (let i = 0; i < (pulp ? 1800 : 650); i++) {
            const x = random () * size, y = random () * size, angle = random () * Math.PI * 2, length = pulp ? 2 + random () * 6 : 1 + random () * 3;
            context.strokeStyle = random () > 0.5 ? '#f6f6f665' : '#77777745'; context.lineWidth = pulp ? 0.5 + random () * 0.8 : 0.4;
            context.beginPath (); context.moveTo (x, y); context.lineTo (x + Math.cos (angle) * length, y + Math.sin (angle) * length); context.stroke ();
        }
        const map = new THREE.CanvasTexture (image); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set (pulp ? 1.5 : 2.5, pulp ? 1.5 : 2.5); resources.add (map); return map;
    }
    const paperMap = texture ('paper'), pulpMap = texture ('pulp');
    function material (color, metalness = 0, roughness = 0.65, extra = {}) { const m = new THREE.MeshStandardMaterial ({ color, metalness, roughness, ...extra }); if (!THREE.ColorManagement.enabled) { m.color.convertSRGBToLinear (); } resources.add (m); solids.push (m); return m; }
    const metal = material (0xa3b1c2, 0.85, 0.28), graphite = material (0x283747, 0.65, 0.33), steel = material (0xd6dce4, 0.92, 0.2);
    const pulp = material (0xa38b66, 0, 1, { map : pulpMap, bumpMap : pulpMap, bumpScale : 0.025 });
    const kraft = material (0xb58a50, 0, 0.9, { map : paperMap, bumpMap : paperMap, bumpScale : 0.022 });
    const edge = material (0x77562f, 0, 1);
    function mesh (parent, geometry, surface, position, detailed = false) {
        resources.add (geometry); const item = new THREE.Mesh (geometry, surface); item.position.set (...position); parent.add (item);
        const lines = new THREE.EdgesGeometry (geometry, 18); resources.add (lines);
        const lineMat = new THREE.LineBasicMaterial ({ color : 0x8fcfff, transparent : true, opacity : 0, toneMapped : false, depthWrite : false, depthTest : true }); if (!THREE.ColorManagement.enabled) { lineMat.color.convertSRGBToLinear (); } resources.add (lineMat); wireMats.push (lineMat);
        const outline = new THREE.LineSegments (lines, lineMat); outline.renderOrder = 4; item.add (outline); wires.push (outline);
        if (detailed) {
            const grid = new THREE.WireframeGeometry (geometry); resources.add (grid);
            const gridMat = lineMat.clone (); gridMat.userData.grid = true; resources.add (gridMat); wireMats.push (gridMat);
            const lattice = new THREE.LineSegments (grid, gridMat); lattice.renderOrder = 3; item.add (lattice);
        }
        return item;
    }
    const block = (parent, size, mat, pos, rounded = false) => mesh (parent, rounded ? new RoundedBoxGeometry (...size, 2, 0.07) : new THREE.BoxGeometry (...size, 7, 1, 7), mat, pos, !rounded);
    block (product, [2.2, 1.65, 1.65], metal, [0, 0.28, 0], true);
    block (product, [1.9, 1.45, 0.55], graphite, [0, 0.28, -1.05], true);
    for (let i = 0; i < 8; i++) { block (product, [2.34, 0.075, 1.8], metal, [0, -0.36 + i * 0.17, 0], true); }
    const cylinder = (radius, length, mat, z, segments = 48) => { const item = mesh (product, new THREE.CylinderGeometry (radius, radius, length, segments, 2), mat, [0, 0.28, z]); item.rotation.x = Math.PI / 2; return item; };
    cylinder (0.77, 0.18, steel, 0.92); cylinder (0.6, 0.16, graphite, 1.08); cylinder (0.43, 0.2, steel, 1.2); cylinder (0.23, 0.8, steel, 1.62);
    block (product, [0.08, 0.09, 0.5], graphite, [0, 0.5, 1.71]);
    for (const x of [-0.85, 0.85]) {
        for (const y of [-0.3, 0.87]) { const bolt = mesh (product, new THREE.CylinderGeometry (0.1, 0.1, 0.12, 6), steel, [x, y, 0.9]); bolt.rotation.x = Math.PI / 2; }
        block (product, [0.34, 0.2, 2], graphite, [x, -0.65, 0], true);
    }
    const parts = product.children.map ((part, i) => ({ part, home : part.position.clone (), offset : new THREE.Vector3 ((i % 3 - 1) * 0.38, i > 9 ? 0.1 : (i - 4) * 0.14, i > 9 ? 0.85 : -0.25) }));
    const productLines = []; product.traverse (item => { if (item.isLineSegments) { productLines.push (item); } });
    const insertParts = [];
    for (const side of [-1, 1]) {
        const cradle = new THREE.Group (); inserts.add (cradle);
        const shell = mesh (cradle, CreatePresentationPulpSide (side), pulp, [0, 0, 0], true);
        insertParts.push ({ group : cradle, shell, side });
    }
    const pack = CreateEngineeringPack ({ block, mesh, surface : kraft, edge });
    const board = pack.group; assembly.add (board);
    const shadowCanvas = document.createElement ('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
    const ctx = shadowCanvas.getContext ('2d'); const gradient = ctx.createRadialGradient (64, 64, 3, 64, 64, 64); gradient.addColorStop (0, '#000c'); gradient.addColorStop (1, '#0000'); ctx.fillStyle = gradient; ctx.fillRect (0, 0, 128, 128);
    const shadowMap = new THREE.CanvasTexture (shadowCanvas); resources.add (shadowMap);
    const shadowMat = new THREE.MeshBasicMaterial ({ map : shadowMap, transparent : true, depthWrite : false }); resources.add (shadowMat);
    const shadowGeometry = new THREE.PlaneGeometry (9, 9); resources.add (shadowGeometry);
    const shadow = new THREE.Mesh (shadowGeometry, shadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.45; scene.add (shadow);
    const grid = new THREE.GridHelper (18, 36, 0x304555, 0x192933); grid.position.y = -1.46; grid.material.transparent = true; grid.material.opacity = 0.09; scene.add (grid); resources.add (grid.geometry); resources.add (grid.material);
    const smooth = (t, a, b) => { const v = THREE.MathUtils.clamp ((t - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); };
    const reduced = window.matchMedia ('(prefers-reduced-motion: reduce)');
    let seconds = reduced.matches ? EngineeringSequenceDuration - 1 : 0, playing = !reduced.matches, active = true, disposed = false, previous, stage = -1, viewportWidth = 1, heightPx = 1, stamp = -1;
    // Keep the opening motor as the reference for all three camera shots.
    const motorTime = EngineeringStages[0].time;
    function placeAssembly (t) { assembly.rotation.y = 0.15 + Math.sin (t * 0.22) * 0.16; assembly.position.y = Math.sin (t * 0.45) * 0.07; }
    placeAssembly (motorTime); assembly.updateMatrixWorld (true);
    const motorPoints = CollectEngineeringFitPoints (product), motorAnchor = new THREE.Vector3 (0, 0.15, 0.25).applyMatrix4 (assembly.matrixWorld);
    const cameraView = CreateEngineeringCamera (camera, motorPoints, motorAnchor), fitPoints = [];
    let framing = cameraView.inspect ();
    const inspect = () => { const sequence = EngineeringSequenceState (seconds); return { available : true, playing, active : active && !document.hidden, stage : sequence.stage, time : Math.round (sequence.sceneTime * 10) / 10, sequence, framing }; };
    function pose () {
        const sequence = EngineeringSequenceState (seconds), t = sequence.sceneTime;
        cameraView.update (t);
        assembly.visible = sequence.sceneVisible; shadow.visible = sequence.sceneVisible; grid.visible = sequence.sceneVisible;
        productLines.forEach ((line, index) => { const count = line.geometry.getAttribute ('position').count; const drawn = smooth (t, 0.1 + index * 0.018, 1.3 + index * 0.018); line.geometry.setDrawRange (0, Math.floor (count * drawn / 2) * 2); });
        const opening = smooth (t, 0.2, 3.4);
        parts.forEach (item => item.part.position.copy (item.home).addScaledVector (item.offset, 1 - opening));
        const opacity = smooth (t, 1.1, 2.9); for (const mat of [metal, graphite, steel]) { mat.opacity = opacity; mat.transparent = opacity < 1; }
        inserts.visible = t > 3.8; pulp.opacity = smooth (t, 3.8, 5.2); pulp.transparent = pulp.opacity < 1;
        for (const part of insertParts) {
            const d = 1 - smooth (t, 4 + (part.side + 1) * 0.22, 6.8);
            part.group.position.set (part.side * d * 0.75, d * 0.2, 0);
            part.group.scale.setScalar (THREE.MathUtils.lerp (0.1, 1, smooth (t, 3.8, 5)));
            part.shell.morphTargetInfluences[0] = 1 - smooth (t, 4.4 + (part.side + 1) * 0.18, 6.9);
        }
        board.visible = t > 7.2; for (const mat of [kraft, edge]) { mat.opacity = smooth (t, 7.2, 8.3); mat.transparent = mat.opacity < 1; }
        // Grow the blank from the product footprint during its reveal.
        const blankScale = THREE.MathUtils.lerp (0.2, 1, smooth (t, 7.2, 8.3)); board.scale.set (blankScale, 1, blankScale);
        PoseEngineeringPack (pack, t);
        const scanning = smooth (t, 17, 19); cut.constant = THREE.MathUtils.lerp (8, 0.3 + Math.sin (t * 0.8) * 0.6, scanning); reveal.constant = -cut.constant;
        for (const mat of [kraft, edge, pulp]) { mat.clippingPlanes = scanning > 0 ? [cut] : []; }
        for (const mat of wireMats) { mat.clippingPlanes = scanning > 0 ? [reveal] : []; mat.opacity = (mat.userData.grid ? 0.08 : 0.5) * Math.max (1 - smooth (t, 2, 4), scanning); }
        placeAssembly (t);
        if (sequence.sceneVisible) {
            const points = CollectEngineeringFitPoints (assembly, fitPoints);
            if (points.length) { framing = cameraView.inspect (points); }
        }
        const nextStamp = Math.floor (seconds * (sequence.sequenceTime < EngineeringTiming[0].execute ? 60 : 10));
        if (sequence.stage !== stage || nextStamp !== stamp) { stage = sequence.stage; stamp = nextStamp; onState (inspect ()); }
    }
    function draw () { pose (); renderer.render (scene, camera); }
    const resize = () => {
        if (disposed) { return; }
        viewportWidth = canvas.clientWidth || 800; heightPx = canvas.clientHeight || 600; renderer.setSize (viewportWidth, heightPx, false); camera.aspect = viewportWidth / heightPx;
        camera.clearViewOffset ();
        cameraView.resize (); draw ();
    };
    function loop (time) {
        if (disposed || !active || document.hidden) { previous = undefined; return; }
        const delta = previous === undefined ? 0 : Math.max ((time - previous) / 1000, 0);
        if (previous !== undefined) {
            // Keep the presentation on time even when a device drops frames.
            // Visibility and intersection changes reset previous before playback resumes.
            seconds += delta;
        }
        previous = time; draw ();
    }
    function schedule () { previous = undefined; renderer.setAnimationLoop (playing && active && !document.hidden ? loop : null); }
    function control (action, value) {
        if (disposed) { return { available : false, playing : false, stage }; }
        if (action === 'stage') { if (!Number.isInteger (value) || value < 0 || value > 3) { throw new Error ('Choose a stage from 0 to 3.'); } seconds = EngineeringStagePositions[value]; playing = false; }
        else if (action === 'pause') { playing = false; }
        else if (action === 'play') { playing = true; }
        else if (action === 'restart') { seconds = 0; playing = true; }
        else { throw new Error ('Unknown demo action.'); }
        schedule (); draw (); onState (inspect ()); return inspect ();
    }
    const motion = () => { playing = !reduced.matches; if (reduced.matches) { seconds = EngineeringSequenceDuration - 1; } schedule (); draw (); onState (inspect ()); };
    const visibility = () => { schedule (); onState (inspect ()); };
    const observer = new ResizeObserver (resize); observer.observe (canvas); reduced.addEventListener ('change', motion); document.addEventListener ('visibilitychange', visibility);
    resize (); schedule (); onState (inspect ());
    return { inspect, control, setActive (value) { active = value; schedule (); onState (inspect ()); }, dispose () { if (disposed) { return; } disposed = true; renderer.setAnimationLoop (null); observer.disconnect (); reduced.removeEventListener ('change', motion); document.removeEventListener ('visibilitychange', visibility); resources.forEach (r => r.dispose ()); environment.dispose (); ReleaseWebGLRenderer (renderer); } };
}
