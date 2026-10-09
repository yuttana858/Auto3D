import * as THREE from 'three';
import { zlibSync } from 'fflate';
import { FefcoStyles } from './fefcocatalog.js';
import { ValidatePackaging, PackagingUnitMM } from './packagingcore.js';
import { Model } from '../engine/model/model.js';
import { Mesh } from '../engine/model/mesh.js';
import { Triangle } from '../engine/model/triangle.js';
import { Coord3D } from '../engine/geometry/coord3d.js';
import { Coord2D } from '../engine/geometry/coord2d.js';
import { PhysicalMaterial, TextureMap } from '../engine/model/material.js';
import { RGBColor } from '../engine/model/color.js';
import { Unit } from '../engine/model/unit.js';

export const DefaultFefco = { code : '0201', length : 400, width : 300, height : 250, thickness : 3, overlap : 25, closure : 'open' };
export function ValidateFefco (input)
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (key => !Object.hasOwn (DefaultFefco, key))) { throw new Error ('Invalid FEFCO parameters.'); }
    const data = { ...DefaultFefco, ...input };
    if (!FefcoStyles.some (style => style.code === data.code) || !['open', 'closed'].includes (data.closure)) { throw new Error ('Choose a supported FEFCO style and open or closed flaps.'); }
    for (const key of ['length', 'width', 'height']) { if (!Number.isFinite (data[key]) || data[key] < 20 || data[key] > 10000) { throw new Error ('Internal dimensions must be between 20 and 10000 mm.'); } }
    if (data.length < data.width) { throw new Error ('Length must be at least the width for these slotted styles.'); }
    if (!Number.isFinite (data.thickness) || data.thickness < 0.5 || data.thickness > 15 || Math.min (data.width, data.height) < data.thickness * 8) { throw new Error ('Use a 0.5–15 mm caliper smaller than one eighth of width and height.'); }
    if (!Number.isFinite (data.overlap) || data.overlap < 0 || data.overlap > 10000 || data.code === '0202' && (data.overlap <= 0 || data.overlap >= data.width)) { throw new Error ('0202 overlap must be greater than zero and less than the width.'); }
    return data;
}
function FlapDepth (data) { return data.code === '0203' ? data.width : (data.width + (data.code === '0202' ? data.overlap : 0)) / 2; }
export function FefcoProfile (input)
{
    const data = ValidateFefco (input); const { length, width, height, thickness } = data; const depth = FlapDepth (data); const joint = Math.min (35, width / 5); const slot = Math.max (2, thickness);
    const spans = [length, width, length, width]; const edges = [0]; spans.forEach (span => edges.push (edges.at (-1) + span)); const points = []; const paths = [];
    const push = (x, y) => { if (!points.length || points.at (-1)[0] !== x || points.at (-1)[1] !== y) { points.push ([x, y]); } };
    push (-joint, thickness * 2); push (0, 0);
    spans.forEach ((span, index) => { const a = edges[index] + (index ? slot / 2 : 0); const b = edges[index + 1] - (index < 3 ? slot / 2 : 0); push (a, 0); push (a, -depth); push (b, -depth); push (b, 0); });
    push (edges[4], height);
    if (data.code === '0200') { push (0, height); } else {
        for (let index = 3; index >= 0; index--) { const a = edges[index] + (index ? slot / 2 : 0); const b = edges[index + 1] - (index < 3 ? slot / 2 : 0); push (b, height); push (b, height + depth); push (a, height + depth); push (a, height); }
    }
    push (-joint, height - thickness * 2);
    paths.push ({ id : 'fefco-outline', type : 'cut', closed : true, points });
    const score = (id, a, b) => paths.push ({ id, type : 'score', closed : false, points : [a, b] });
    for (let index = 0; index < 4; index++) { score ('base-' + index, [edges[index], 0], [edges[index + 1], 0]); if (data.code !== '0200') { score ('top-' + index, [edges[index], height], [edges[index + 1], height]); } score ('wall-' + index, [edges[index], 0], [edges[index], height]); }
    return ValidatePackaging ({ version : 1, name : 'FEFCO ' + data.code + ' · ' + length + ' × ' + width + ' × ' + height, grade : 'Measured corrugated caliper', thickness, paths });
}

// Small deterministic PNGs work in the browser, engine exports, and recovery workers.
function BoardTexture (edge)
{
    const size = 128; const pixels = new Uint8Array ((size * 3 + 1) * size); let seed = 197;
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        seed = (Math.imul (seed, 1664525) + 1013904223) >>> 0; const noise = ((seed >>> 24) / 255 - 0.5) * 15;
        const flute = edge ? Math.abs (y - (64 + 42 * Math.sin (x * Math.PI / 16))) < 6 || y < 9 || y > 118 : false;
        const base = edge ? (flute ? [177, 134, 83] : [90, 65, 40]) : [193, 155, 107];
        for (let c = 0; c < 3; c++) { pixels[y * (size * 3 + 1) + 1 + x * 3 + c] = Math.round (base[c] + noise); }
    } }
    const chunk = (name, bytes) => {
        const result = new Uint8Array (bytes.length + 12); const view = new DataView (result.buffer); view.setUint32 (0, bytes.length); result.set ([...name].map (char => char.charCodeAt (0)), 4); result.set (bytes, 8);
        let crc = -1; for (const byte of result.subarray (4, bytes.length + 8)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) { crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } } view.setUint32 (result.length - 4, (crc ^ -1) >>> 0); return result;
    };
    const header = new Uint8Array (13); const view = new DataView (header.buffer); view.setUint32 (0, size); view.setUint32 (4, size); header[8] = 8; header[9] = 2;
    const chunks = [new Uint8Array ([137, 80, 78, 71, 13, 10, 26, 10]), chunk ('IHDR', header), chunk ('IDAT', zlibSync (pixels)), chunk ('IEND', new Uint8Array ())];
    const png = new Uint8Array (chunks.reduce ((sum, bytes) => sum + bytes.length, 0)); let offset = 0; chunks.forEach (bytes => { png.set (bytes, offset); offset += bytes.length; });
    const texture = new TextureMap (); texture.name = edge ? 'corrugated-edge.png' : 'kraft-fiber.png'; texture.mimeType = 'image/png'; texture.buffer = png.buffer; return texture;
}
export function CreateFefcoModel (input, unit = Unit.Millimeter)
{
    const data = ValidateFefco (input); const factor = PackagingUnitMM[unit]; if (!factor) { throw new Error ('Set known scene units before generating packaging.'); }
    const { width : w, length : l, height : h, thickness : t } = data; const depth = FlapDepth (data); const gap = Math.min (t * 0.4, 1); const model = new Model (); model.SetUnit (unit);
    const innerLayers = 2 * depth > l ? 2 : 1; const outerLayers = data.code === '0202' || data.code === '0203' ? 2 : 1;
    const layers = innerLayers + outerLayers; const floor = layers * t; const wallHeight = h + floor;
    for (const edge of [false, true]) { const material = new PhysicalMaterial (); material.name = edge ? 'Exposed corrugated edge' : 'Natural kraft liner'; material.color = new RGBColor (255, 255, 255); material.roughness = edge ? 1 : 0.92; material.metalness = 0; material.specularIntensity = 0.15; material.diffuseMap = BoardTexture (edge); model.AddMaterial (material); }
    const panel = (name, width, height, center, rotation = [0, 0, 0]) => {
        const geometry = new THREE.BoxGeometry (width, height, t); const normals = geometry.getAttribute ('normal'); const uv = geometry.getAttribute ('uv'); const positions = geometry.getAttribute ('position'); const index = geometry.getIndex (); const mesh = new Mesh (); mesh.SetName (name);
        const transform = new THREE.Matrix4 ().compose (new THREE.Vector3 (...center), new THREE.Quaternion ().setFromEuler (new THREE.Euler (...rotation)), new THREE.Vector3 (1, 1, 1)); geometry.applyMatrix4 (transform);
        const vertices = new Map (); const ids = [];
        for (let i = 0; i < positions.count; i++) { const p = [positions.getX (i) / factor, positions.getY (i) / factor, positions.getZ (i) / factor]; const key = p.map (value => value.toFixed (8)).join (','); if (!vertices.has (key)) { vertices.set (key, mesh.AddVertex (new Coord3D (...p))); } ids.push (vertices.get (key)); mesh.AddNormal (new Coord3D (normals.getX (i), normals.getY (i), normals.getZ (i))); const face = Math.floor (i / 4); mesh.AddTextureUV (new Coord2D (uv.getX (i) * (face >= 4 ? width / 50 : (face < 2 ? height : width) / (t * 2)), uv.getY (i) * (face >= 4 ? height / 50 : 1))); }
        for (const group of geometry.groups) { for (let i = group.start; i < group.start + group.count; i += 3) { const a = index.getX (i); const b = index.getX (i + 1); const c = index.getX (i + 2); mesh.AddTriangle (new Triangle (ids[a], ids[b], ids[c]).SetNormals (a, b, c).SetTextureUVs (a, b, c).SetMaterial (group.materialIndex >= 4 ? 0 : 1).SetCurve (0)); } }
        model.AddMeshToRootNode (mesh); geometry.dispose ();
    };
    // Internal dimensions are W=X, L=Z, H=Y; thickness extends outside the cavity.
    panel ('Front wall', w + 2 * t, wallHeight, [0, wallHeight / 2, -l / 2 - t / 2]);
    panel ('Back wall', w + 2 * t, wallHeight, [0, wallHeight / 2, l / 2 + t / 2]);
    panel ('Left wall', l - gap, wallHeight, [-w / 2 - t / 2, wallHeight / 2, 0], [0, Math.PI / 2, 0]);
    panel ('Right wall', l - gap, wallHeight, [w / 2 + t / 2, wallHeight / 2, 0], [0, Math.PI / 2, 0]);
    panel ('Inside glued joint', Math.min (35, w / 5), wallHeight - 4 * t, [-w / 2 + Math.min (35, w / 5) / 2, wallHeight / 2, -l / 2 + t / 2]);
    const flaps = (top) => {
        // Closed flaps occupy separate board layers. Open top flaps hinge outward.
        const angle = top && data.closure === 'open' ? 110 * Math.PI / 180 : 0;
        const majorDepth = depth - gap; const minorDepth = Math.min (depth, l - gap); const rise = top ? wallHeight : 0;
        const hinge = (name, span, flapDepth, cx, cz, inwardX, inwardZ, layer) => {
            const cy = rise + (top ? (layer + 0.5) * t : (layers - layer - 0.5) * t) + Math.sin (angle) * flapDepth / 2;
            const center = [cx + inwardX * Math.cos (angle) * flapDepth / 2, cy, cz + inwardZ * Math.cos (angle) * flapDepth / 2];
            const normal = new THREE.Vector3 (-inwardX * Math.sin (angle), Math.cos (angle), -inwardZ * Math.sin (angle)); const vertical = new THREE.Vector3 (inwardX * Math.cos (angle), Math.sin (angle), inwardZ * Math.cos (angle)); const horizontal = new THREE.Vector3 ().crossVectors (vertical, normal); const basis = new THREE.Matrix4 ().makeBasis (horizontal, vertical, normal); const rotation = new THREE.Euler ().setFromRotationMatrix (basis);
            panel ((top ? 'Top ' : 'Base ') + name, span - gap * 2, flapDepth, center, [rotation.x, rotation.y, rotation.z]);
        };
        hinge ('front inner flap', w, minorDepth, 0, -l / 2, 0, 1, 0);
        hinge ('back inner flap', w, minorDepth, 0, l / 2, 0, -1, innerLayers - 1);
        hinge ('left outer flap', l, majorDepth, -w / 2, 0, 1, 0, innerLayers);
        hinge ('right outer flap', l, majorDepth, w / 2, 0, -1, 0, layers - 1);
    };
    // Long side walls lie on X = +/- W/2: their L-wide flaps close across W.
    // Keep these outer flaps uppermost, and the end-wall flaps underneath.
    flaps (false); if (data.code !== '0200') { flaps (true); }
    return model;
}
