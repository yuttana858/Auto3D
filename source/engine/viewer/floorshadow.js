import * as THREE from 'three';
import { Direction } from '../geometry/geometry.js';

export function FloorShadowDirection (up, rotation)
{
    const axis = up.direction === Direction.X ? 0 : up.direction === Direction.Z ? 2 : 1;
    const direction = new THREE.Vector3 (1, 1, 1); direction.setComponent (axis, up.isFlipped ? -2 : 2);
    direction.applyEuler (rotation || new THREE.Euler ()).normalize ();
    // A sun below or parallel to the floor cannot cast a finite floor shadow.
    const normal = new THREE.Vector3 ().setComponent (axis, up.isFlipped ? -1 : 1);
    return direction.dot (normal) > 0.01 ? direction : null;
}

export function FloorShadowProjection (normal, point, direction)
{
    const plane = [normal.x, normal.y, normal.z, -normal.dot (point)]; const light = [direction.x, direction.y, direction.z, 0]; const dot = normal.dot (direction);
    if (dot <= 0.01) { return null; }
    const elements = [];
    for (let column = 0; column < 4; column++) { for (let row = 0; row < 4; row++) { elements.push ((row === column ? 1 : 0) - light[row] * plane[column] / dot); } }
    return new THREE.Matrix4 ().fromArray (elements);
}

// Project caster copies into a color mask. Original meshes, materials, alpha,
// light intensities and shadow-map programs are never changed by this pass.
export class FloorShadow
{
    constructor (viewer)
    {
        this.viewer = viewer; this.scene = new THREE.Scene (); this.proxies = new Map (); this.materials = new Map ();
        this.projection = { value : new THREE.Matrix4 () }; this.camera = new THREE.OrthographicCamera (-1, 1, 1, -1, 0.01, 100);
        this.target = new THREE.WebGLRenderTarget (1024, 1024, { depthBuffer : false, minFilter : THREE.LinearFilter, magFilter : THREE.LinearFilter }); this.lastError = null;
    }
    Sync (bounds) { this.bounds = bounds.clone (); }
    Material (source)
    {
        let material = this.materials.get (source);
        if (!material) {
            // The mask writes the same silhouette from either face. Drawing
            // transparent DoubleSide casters twice doubles all model triangles.
            material = new THREE.MeshBasicMaterial ({ side : THREE.DoubleSide, forceSinglePass : true, depthTest : false, depthWrite : false, transparent : true, blending : THREE.NoBlending, toneMapped : false });
            material.onBeforeCompile = shader => {
                shader.uniforms.auto3dFloorProjection = this.projection;
                shader.vertexShader = 'uniform mat4 auto3dFloorProjection;\n' + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace ('#include <project_vertex>', `
vec4 auto3dPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
    auto3dPosition = batchingMatrix * auto3dPosition;
#endif
#ifdef USE_INSTANCING
    auto3dPosition = instanceMatrix * auto3dPosition;
#endif
gl_Position = projectionMatrix * viewMatrix * auto3dFloorProjection * modelMatrix * auto3dPosition;`);
                shader.fragmentShader = shader.fragmentShader.replace ('#include <opaque_fragment>', 'if (diffuseColor.a < 0.01) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);');
            };
            material.customProgramCacheKey = () => 'auto3d-floor-color-mask-v1'; this.materials.set (source, material);
        }
        if (material.map !== source.map || material.alphaMap !== source.alphaMap || material.alphaTest !== source.alphaTest) { material.needsUpdate = true; }
        material.map = source.map; material.alphaMap = source.alphaMap; material.alphaTest = source.alphaTest; material.opacity = source.opacity; material.visible = source.visible;
        return material;
    }
    SyncCasters ()
    {
        const root = this.viewer.mainModel?.mainModel?.GetRootObject?.(); const retained = new Set (); const retainedMaterials = new Set ();
        root?.updateWorldMatrix (true, true);
        root?.traverse (object => {
            if (!object.isMesh || !object.castShadow || object.userData?.auto3dSceneEffect) { return; }
            let visible = true; for (let parent = object; parent; parent = parent.parent) { visible = visible && parent.visible; }
            if (!visible) { return; }
            retained.add (object); let proxy = this.proxies.get (object);
            if (!proxy) {
                // Imported engine nodes in userData can have parent cycles.
                // Object3D.clone JSON-serializes that data; construct only the
                // renderable copy and never copy metadata or original callbacks.
                proxy = object.isSkinnedMesh ? new THREE.SkinnedMesh (object.geometry, object.material) : object.isInstancedMesh ? new THREE.InstancedMesh (object.geometry, object.material, 0) : new THREE.Mesh (object.geometry, object.material);
                proxy.matrixAutoUpdate = false; proxy.frustumCulled = false; proxy.castShadow = proxy.receiveShadow = false; this.proxies.set (object, proxy); this.scene.add (proxy);
            }
            proxy.geometry = object.geometry; proxy.matrix.copy (object.matrixWorld); proxy.layers.set (0);
            if (object.isSkinnedMesh) { proxy.skeleton = object.skeleton; proxy.updateMatrixWorld = function (force) { THREE.Mesh.prototype.updateMatrixWorld.call (this, force); }; proxy.bindMatrix.copy (object.bindMatrix); proxy.bindMatrixInverse.copy (object.bindMatrixInverse); }
            if (object.isInstancedMesh) { proxy.instanceMatrix = object.instanceMatrix; proxy.instanceColor = object.instanceColor; proxy.morphTexture = object.morphTexture; proxy.count = object.count; }
            if (object.morphTargetInfluences) { proxy.morphTargetInfluences = object.morphTargetInfluences; }
            const materials = Array.isArray (object.material) ? object.material : [object.material]; materials.forEach (material => retainedMaterials.add (material));
            const copies = materials.map (material => this.Material (material)); proxy.material = Array.isArray (object.material) ? copies : copies[0];
        });
        for (const [object, proxy] of this.proxies) { if (!retained.has (object)) { this.scene.remove (proxy); this.proxies.delete (object); } }
        for (const [source, material] of this.materials) { if (!retainedMaterials.has (source)) { material.dispose (); this.materials.delete (source); } }
    }
    Render (renderer, floor)
    {
        if (!this.bounds) { return; }
        const target = renderer.getRenderTarget (); const cubeFace = renderer.getActiveCubeFace (); const mip = renderer.getActiveMipmapLevel ();
        const scissorTest = renderer.getScissorTest ();
        const color = renderer.getClearColor (new THREE.Color ()).clone (); const alpha = renderer.getClearAlpha (); const autoClear = renderer.autoClear;
        const shadowEnabled = renderer.shadowMap.enabled; const shadowUpdate = renderer.shadowMap.autoUpdate;
        try {
            renderer.autoClear = false; renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.setScissorTest (false); renderer.setClearColor (0x000000, 0);
            renderer.setRenderTarget (this.target); renderer.clear (true, false, false);
            this.lastError = null;
            const direction = FloorShadowDirection (this.viewer.upVector, this.viewer.scene.environmentRotation);
            if (!direction) { return; }
            const normal = new THREE.Vector3 (0, 0, 1).applyEuler (floor.rotation); if (this.viewer.upVector.isFlipped) { normal.negate (); }
            this.projection.value.copy (FloorShadowProjection (normal, floor.position, direction));
            const cameraNormal = new THREE.Vector3 (0, 0, 1).applyEuler (floor.rotation);
            this.camera.position.copy (floor.position).addScaledVector (cameraNormal, 10); this.camera.up.set (0, 1, 0).applyEuler (floor.rotation); this.camera.lookAt (floor.position);
            const half = floor.scale.x / 2; Object.assign (this.camera, { left : -half, right : half, top : half, bottom : -half }); this.camera.updateProjectionMatrix ();
            this.SyncCasters (); renderer.render (this.scene, this.camera); this.lastError = null;
        } catch (error) {
            this.lastError = error.message;
            try { renderer.setRenderTarget (this.target); renderer.clear (true, false, false); } catch { /* Context loss must not prevent restoration. */ }
        } finally {
            // setRenderTarget restores its own viewport/scissor. getViewport()
            // returns the canvas viewport, which can differ from a PNG tile.
            renderer.setRenderTarget (target, cubeFace, mip); renderer.setScissorTest (scissorTest);
            if (target) { renderer.state.setScissorTest (target.scissorTest); }
            renderer.setClearColor (color, alpha); renderer.autoClear = autoClear; renderer.shadowMap.enabled = shadowEnabled; renderer.shadowMap.autoUpdate = shadowUpdate;
        }
    }
    Dispose () { this.materials.forEach (material => material.dispose ()); this.materials.clear (); this.proxies.clear (); this.scene.clear (); this.target.dispose (); }
}
