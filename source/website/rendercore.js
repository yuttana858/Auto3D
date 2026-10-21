import * as THREE from 'three';

export const RenderPresets = { hd : { width : 1920, height : 1080 }, '4k' : { width : 3840, height : 2160 }, '16k' : { width : 15360, height : 8640 } };
export function RenderDimensions (preset, screen)
{
    const size = preset === 'screen' ? screen : RenderPresets[preset];
    if (!size || !Number.isInteger (size.width) || !Number.isInteger (size.height) || size.width < 1 || size.height < 1 || size.width > 16384 || size.height > 16384 || size.width * size.height > 15360 * 8640) { throw new Error ('Choose Screen, HD, 4K or 16K within the supported image size.'); }
    return { ...size };
}
export function RenderTiles (width, height, limit = 1024)
{
    if (![width, height, limit].every (value => Number.isInteger (value) && value > 0)) { throw new Error ('Invalid render tile dimensions.'); }
    const tiles = [];
    for (let y = 0; y < height; y += limit) { for (let x = 0; x < width; x += limit) { tiles.push ({ x, y, width : Math.min (limit, width - x), height : Math.min (limit, height - y) }); } }
    return tiles;
}
export function FlipRenderPixels (pixels, width, height, unpremultiply = false)
{
    const flipped = new Uint8ClampedArray (pixels.length); const row = width * 4;
    for (let y = 0; y < height; y++) { flipped.set (pixels.subarray ((height - y - 1) * row, (height - y) * row), y * row); }
    if (unpremultiply) { for (let i = 0; i < flipped.length; i += 4) { const alpha = flipped[i + 3]; if (alpha > 0 && alpha < 255) { for (let channel = 0; channel < 3; channel++) { flipped[i + channel] = Math.min (255, Math.round (flipped[i + channel] * 255 / alpha)); } } } }
    return flipped;
}
export function RenderCamera (state, width, height, near, far)
{
    const distance = Math.hypot (...state.eye.map ((value, axis) => value - state.center[axis]));
    const halfHeight = distance * Math.tan (state.fov * Math.PI / 360); const aspect = width / height;
    const camera = state.projectionMode === 2 ? new THREE.OrthographicCamera (-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, near, far) : new THREE.PerspectiveCamera (state.fov, aspect, near, far);
    camera.position.fromArray (state.eye); camera.up.fromArray (state.up); camera.lookAt (new THREE.Vector3 (...state.center)); camera.updateMatrixWorld (true); return camera;
}

export async function RenderPNG (website, job, { cancelled = () => false, progress = () => {}, preview = () => {}, background : interactive = false, tileSize = 1024 } = {})
{
    const viewer = website.viewer; const renderer = viewer.renderer; const scene = viewer.scene;
    const { width, height } = job.size; const canvas = document.createElement ('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext ('2d'); if (!context) { throw new Error ('This browser could not allocate the render image. Choose a smaller resolution.'); }
    const camera = RenderCamera (job.camera, width, height, viewer.camera.near, viewer.camera.far);
    const renderSizeBefore = renderer.getSize (new THREE.Vector2 ());
    const targetBefore = renderer.getRenderTarget (); const viewport = renderer.getViewport (new THREE.Vector4 ()); const scissor = renderer.getScissor (new THREE.Vector4 ()); const scissorTest = renderer.getScissorTest ();
    const clearColor = renderer.getClearColor (new THREE.Color ()).clone (); const clearAlpha = renderer.getClearAlpha (); const autoClear = renderer.autoClear;
    const background = scene.background; const shadowUpdate = renderer.shadowMap.autoUpdate; const lightPosition = viewer.shadingModel.directionalLight.position.clone ();
    const root = viewer.mainModel?.mainModel?.GetRootObject?.(); const hidden = [];
    // Keep models/lights; never export editor selection, gizmos, axes or helpers.
    for (const child of scene.children) {
        if (child === root || child.isLight || child.isCamera || child === viewer.shadingModel.directionalLight.target) { continue; }
        if (job.alpha || child.userData?.auto3dSceneEffect !== true && child !== viewer.defaultDome && child !== viewer.groundGrid) { hidden.push ([child, child.visible]); child.visible = false; }
    }
    const domePosition = viewer.defaultDome?.position.clone (); const domeScale = viewer.defaultDome?.scale.clone ();
    let target;
    try {
        if (viewer.defaultDome) { viewer.defaultDome.position.copy (camera.position); viewer.defaultDome.scale.setScalar (Math.max (10, camera.far * 0.8)); viewer.defaultDome.updateMatrixWorld (true); }
        if (job.alpha) { scene.background = null; renderer.setClearColor (0x000000, 0); }
        renderer.autoClear = true; renderer.setScissorTest (false);
        viewer.shadingModel.UpdateByCamera ({ eye : { x : job.camera.eye[0], y : job.camera.eye[1], z : job.camera.eye[2] }, center : { x : job.camera.center[0], y : job.camera.center[1], z : job.camera.center[2] } });
        const jobLight = viewer.shadingModel.directionalLight.position.clone ();
        const limit = Math.max (1, Math.min (tileSize, renderer.capabilities.maxTextureSize)); const tiles = RenderTiles (width, height, limit);
        target = new THREE.WebGLRenderTarget (limit, limit, { depthBuffer : true, samples : Math.min (4, renderer.capabilities.maxSamples || 0) }); target.texture.colorSpace = THREE.SRGBColorSpace;
        for (let index = 0; index < tiles.length; index++) {
            if (cancelled () || renderer.getContext ().isContextLost ()) { throw new Error (cancelled () ? 'Render cancelled.' : 'WebGL context lost. Reload the app before retrying.'); }
            viewer.shadingModel.directionalLight.position.copy (jobLight);
            if (viewer.defaultDome) { viewer.defaultDome.position.copy (camera.position); viewer.defaultDome.updateMatrixWorld (true); }
            const tile = tiles[index]; target.setSize (tile.width, tile.height); camera.setViewOffset (width, height, tile.x, tile.y, tile.width, tile.height);
            renderer.setRenderTarget (target); renderer.render (scene, camera);
            const pixels = new Uint8Array (tile.width * tile.height * 4); renderer.readRenderTargetPixels (target, 0, 0, tile.width, tile.height, pixels);
            if (renderer.getContext ().isContextLost ()) { throw new Error ('WebGL context lost. Reload the app before retrying.'); }
            context.putImageData (new ImageData (FlipRenderPixels (pixels, tile.width, tile.height, job.alpha), tile.width, tile.height), tile.x, tile.y);
            preview (canvas);
            renderer.setRenderTarget (targetBefore); renderer.setViewport (viewport); renderer.setScissor (scissor); renderer.setScissorTest (scissorTest);
            renderer.shadowMap.autoUpdate = false; progress (Math.round ((index + 1) / tiles.length * 95));
            if (interactive) {
                scene.background = background; renderer.setClearColor (clearColor, clearAlpha);
                const currentSize = renderer.getSize (new THREE.Vector2 ()); if (!targetBefore && !currentSize.equals (renderSizeBefore)) { renderer.setViewport (0, 0, currentSize.x, currentSize.y); }
                hidden.forEach (([child, visible]) => { child.visible = visible; }); viewer.Render ();
            }
            await new Promise (resolve => setTimeout (resolve, 0));
            if (interactive) {
                hidden.forEach (([child]) => { child.visible = false; });
                if (job.alpha) { scene.background = null; renderer.setClearColor (0x000000, 0); }
            }
        }
        if (cancelled ()) { throw new Error ('Render cancelled.'); }
        if (interactive) { scene.background = background; renderer.setClearColor (clearColor, clearAlpha); hidden.forEach (([child, visible]) => { child.visible = visible; }); viewer.Render (); }
        const blob = await new Promise ((resolve, reject) => canvas.toBlob (value => value ? resolve (value) : reject (new Error ('PNG encoding failed. Choose a smaller resolution.')), 'image/png'));
        if (cancelled ()) { throw new Error ('Render cancelled.'); } progress (100); return blob;
    } finally {
        target?.dispose (); canvas.width = 0; canvas.height = 0;
        if (viewer.defaultDome && domePosition) { viewer.defaultDome.position.copy (domePosition); viewer.defaultDome.scale.copy (domeScale); viewer.defaultDome.updateMatrixWorld (true); }
        hidden.forEach (([child, visible]) => { child.visible = visible; }); scene.background = background;
        renderer.setRenderTarget (targetBefore); renderer.setViewport (viewport); renderer.setScissor (scissor); renderer.setScissorTest (scissorTest);
        const currentSize = renderer.getSize (new THREE.Vector2 ()); if (!targetBefore && !currentSize.equals (renderSizeBefore)) { renderer.setViewport (0, 0, currentSize.x, currentSize.y); }
        renderer.setClearColor (clearColor, clearAlpha); renderer.autoClear = autoClear; renderer.shadowMap.autoUpdate = shadowUpdate;
        viewer.shadingModel.directionalLight.position.copy (lightPosition); renderer.shadowMap.needsUpdate = true; viewer.Render ();
    }
}
