import * as THREE from 'three';
import { PresentationPack } from './engineeringpack.js';

// Print only the existing exterior cap triangles, preserving hand holes and lid cuts.
export function CreateEngineeringPrintGeometry (panel, inversePack)
{
    const source = panel.mesh.geometry, position = source.getAttribute ('position'), normal = source.getAttribute ('normal');
    const points = [], normals = [], uv = [], point = new THREE.Vector3 (), d = PresentationPack;
    const matrix = new THREE.Matrix4 ().multiplyMatrices (inversePack, panel.mesh.matrixWorld);
    const count = source.index ? source.index.count : position.count;
    for (let i = 0; i < count; i += 3) {
        const ids = [0, 1, 2].map (offset => source.index ? source.index.getX (i + offset) : i + offset);
        if (ids.some (id => normal.getY (id) > -0.99)) { continue; }
        for (const id of ids) {
            points.push (position.getX (id), position.getY (id), position.getZ (id)); normals.push (0, -1, 0);
            point.fromBufferAttribute (position, id).applyMatrix4 (matrix);
            if (panel.face === 'lid') { uv.push ((point.x + d.width / 2) / d.width, (d.depth / 2 - point.z + d.centerZ) / d.depth); }
            else if (panel.face === 'side') { uv.push ((-panel.side * (point.z - d.centerZ) + d.depth / 2) / d.depth, (point.y - d.bottom) / d.height); }
            else { uv.push ((panel.side * point.x + d.width / 2) / d.width, (point.y - d.bottom) / d.height); }
        }
    }
    const geometry = new THREE.BufferGeometry ();
    geometry.setAttribute ('position', new THREE.Float32BufferAttribute (points, 3));
    geometry.setAttribute ('normal', new THREE.Float32BufferAttribute (normals, 3));
    geometry.setAttribute ('uv', new THREE.Float32BufferAttribute (uv, 2));
    return geometry;
}

function artwork (face, color)
{
    const canvas = document.createElement ('canvas'); canvas.width = 768; canvas.height = face === 'lid' ? 768 : 512;
    const ctx = canvas.getContext ('2d'), height = canvas.height, ink = color ? '#123d71' : '#171a1c';
    if (color) {
        ctx.fillStyle = '#f5f6f4'; ctx.fillRect (0, 0, 768, height);
        // Printed color fields wrap the same real board panels; the cut edges stay kraft.
        for (const [index, shade] of ['#165bb7', '#20b9d6', '#ff873d'].entries ()) {
            ctx.fillStyle = shade; ctx.beginPath (); ctx.moveTo (540 + index * 87, 0); ctx.lineTo (660 + index * 87, 0);
            ctx.lineTo (480 + index * 87, height); ctx.lineTo (360 + index * 87, height); ctx.closePath (); ctx.fill ();
        }
    }
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
    const text = (value, x, y, size, weight = 600) => { ctx.font = `${weight} ${size}px Arial, sans-serif`; ctx.fillText (value, x, y); };
    const line = (x1, y1, x2, y2, width = 2) => { ctx.lineWidth = width; ctx.beginPath (); ctx.moveTo (x1, y1); ctx.lineTo (x2, y2); ctx.stroke (); };
    const motor = (x, y, size) => {
        ctx.save (); ctx.translate (x, y); ctx.scale (size, size); ctx.lineWidth = 2.5;
        ctx.strokeRect (-88, -69, 176, 138);
        for (let i = -60; i <= 60; i += 15) { line (-106, i, -72, i, 3); line (72, i, 106, i, 3); }
        for (const radius of [61, 45, 22]) { ctx.beginPath (); ctx.arc (0, 0, radius, 0, Math.PI * 2); ctx.stroke (); }
        for (const xSide of [-1, 1]) { for (const ySide of [-1, 1]) { ctx.strokeRect (xSide * 71 - 5, ySide * 52 - 5, 10, 10); } }
        line (-130, 0, 130, 0, 1); line (0, -96, 0, 96, 1); ctx.restore ();
    };
    const handling = (x, y) => {
        ctx.save (); ctx.translate (x, y);
        for (const dx of [0, 34]) { line (dx, 28, dx, 0, 4); line (dx, 0, dx - 8, 9, 4); line (dx, 0, dx + 8, 9, 4); }
        line (-10, 35, 44, 35, 3);
        ctx.lineWidth = 3; ctx.beginPath (); ctx.moveTo (70, 0); ctx.lineTo (94, 0); ctx.lineTo (90, 17); ctx.lineTo (82, 23); ctx.lineTo (74, 17); ctx.closePath (); ctx.stroke (); line (82, 23, 82, 35, 3); line (72, 35, 92, 35, 3);
        ctx.restore ();
    };
    if (face === 'side') {
        // Leave the hand-hole area clear of text.
        text ('US–54783', 48, 270, 54, 700); text ('PRECISION DRIVE', 50, 306, 21);
        line (50, 327, 315, 327); text ('ENGINEERED PROTECTION', 50, 359, 15);
        handling (62, 409); text ('01 / PRODUCT SYSTEMS', 205, 441, 14);
    } else {
        text ('PRECISION', 50, 86, 50, 700); text ('DRIVE', 48, 151, 73, 750);
        text ('US–54783  /  MOTION SYSTEMS', 52, 192, 17, 500); line (52, 215, color ? 365 : 715, 215);
        motor (color ? 220 : 532, height * 0.59, face === 'lid' ? 1.45 : 1);
        if (!color) {
            text ('BUILT TO MOVE.', 52, height * 0.6, 24, 700); text ('PACKED TO PROTECT.', 52, height * 0.6 + 30, 17, 500);
            for (let i = 0; i < 34; i++) { ctx.fillRect (54 + i * 5, height - 102, i % 3 === 0 ? 3 : 1, 38); }
            text ('54783  01  001', 54, height - 47, 14, 400);
        } else { text ('ENGINEERED PROTECTION', 52, height - 48, 16, 500); }
        handling (face === 'lid' ? 580 : 592, height - 85);
    }
    const texture = new THREE.CanvasTexture (canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    return texture;
}

export function CreateEngineeringArtwork (pack, paperMap, resources)
{
    pack.group.updateWorldMatrix (true, true);
    const inverse = pack.group.matrixWorld.clone ().invert (), layers = [], maps = new Map ();
    const ink = { value : 0 }, white = { value : 0 };
    for (const panel of pack.printPanels) {
        if (!maps.has (panel.face)) {
            const pair = [artwork (panel.face, false), artwork (panel.face, true)]; pair.forEach (map => resources.add (map)); maps.set (panel.face, pair);
        }
        const [blackMap, whiteMap] = maps.get (panel.face);
        const material = new THREE.MeshStandardMaterial ({ map : blackMap, bumpMap : paperMap, bumpScale : 0.009, roughness : 0.85,
            transparent : true, depthWrite : false, polygonOffset : true, polygonOffsetFactor : -2, polygonOffsetUnits : -2 });
        material.onBeforeCompile = shader => {
            shader.uniforms.engineeringWhiteMap = { value : whiteMap }; shader.uniforms.engineeringInk = ink; shader.uniforms.engineeringWhite = white;
            shader.vertexShader = shader.vertexShader.replace ('#include <common>', '#include <common>\nvarying float vEngineeringSweep;');
            shader.vertexShader = shader.vertexShader.replace ('#include <project_vertex>', '#include <project_vertex>\nvEngineeringSweep = dot((modelMatrix * vec4(transformed, 1.0)).xyz, vec3(0.780869, 0.0, -0.624695));');
            shader.fragmentShader = shader.fragmentShader.replace ('#include <common>', '#include <common>\nvarying float vEngineeringSweep;\nuniform sampler2D engineeringWhiteMap;\nuniform float engineeringInk;\nuniform float engineeringWhite;');
            shader.fragmentShader = shader.fragmentShader.replace ('#include <map_fragment>', `
                vec4 kraftInk = texture2D(map, vMapUv);
                kraftInk.a *= engineeringInk;
                float edge = mix(-4.0, 4.0, engineeringWhite);
                float wipe = engineeringWhite <= 0.0 ? 0.0 : engineeringWhite >= 1.0 ? 1.0 : 1.0 - smoothstep(edge - 0.045, edge + 0.045, vEngineeringSweep);
                diffuseColor *= mix(kraftInk, texture2D(engineeringWhiteMap, vMapUv), wipe);
            `);
        };
        material.customProgramCacheKey = () => 'engineering-print-v1'; resources.add (material);
        const geometry = CreateEngineeringPrintGeometry (panel, inverse); resources.add (geometry);
        const layer = new THREE.Mesh (geometry, material); layer.renderOrder = 2; layer.visible = false; panel.mesh.add (layer); layers.push (layer);
    }
    return { update (finish, clippingPlanes) {
        ink.value = finish.ink; white.value = finish.white;
        for (const layer of layers) { layer.visible = finish.ink > 0; layer.material.clippingPlanes = clippingPlanes; }
    }, inspect : () => ({ exteriorPanels : layers.length, ink : ink.value, white : white.value }) };
}
