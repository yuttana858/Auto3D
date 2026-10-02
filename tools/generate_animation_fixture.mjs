import { writeFile, mkdir } from 'node:fs/promises';
import * as THREE from 'three';

// An original fixture exercises skeletal animation, morph targets, and multiple clips.
const geometry = new THREE.BoxGeometry (1, 1, 1);
const chunks = []; const views = []; const accessors = []; let byteLength = 0;
function accessor (array, type, componentType = 5126, bounds = false) {
    const bytes = Buffer.from (array.buffer, array.byteOffset, array.byteLength); const padded = Buffer.alloc (Math.ceil (bytes.length / 4) * 4); bytes.copy (padded);
    const index = accessors.length; views.push ({ buffer : 0, byteOffset : byteLength, byteLength : bytes.length }); chunks.push (padded); byteLength += padded.length;
    const sizes = { SCALAR : 1, VEC3 : 3, VEC4 : 4, MAT4 : 16 }; const item = { bufferView : views.length - 1, componentType, count : array.length / sizes[type], type };
    if (bounds) { item.min = []; item.max = []; for (let i = 0; i < sizes[type]; i++) { const values = Array.from (array).filter ((value, j) => j % sizes[type] === i); item.min.push (Math.min (...values)); item.max.push (Math.max (...values)); } }
    accessors.push (item); return index;
}
const positions = geometry.attributes.position.array; const count = geometry.attributes.position.count;
const position = accessor (positions, 'VEC3', 5126, true); const normal = accessor (geometry.attributes.normal.array, 'VEC3'); const indices = accessor (geometry.index.array, 'SCALAR', 5123);
const joints = accessor (new Uint16Array (count * 4), 'VEC4', 5123); const weightsArray = new Float32Array (count * 4); for (let i = 0; i < count; i++) { weightsArray[i * 4] = 1; } const weights = accessor (weightsArray, 'VEC4');
const inverse = accessor (new Float32Array (new THREE.Matrix4 ().elements), 'MAT4'); const morph = accessor (Float32Array.from (positions, (value, index) => index % 3 === 1 ? value * 0.8 : 0), 'VEC3', 5126, true);
const times = accessor (new Float32Array ([0, 1, 2]), 'SCALAR', 5126, true);
const rotations = accessor (new Float32Array ([0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2, 0, 0, 0, 1]), 'VEC4'); const morphWeights = accessor (new Float32Array ([0, 1, 0]), 'SCALAR');
const data = { asset : { version : '2.0', generator : 'SW Auto3D animation QA fixture' }, scene : 0, scenes : [{ nodes : [0] }], nodes : [{ name : 'AnimatedCube', mesh : 0, skin : 0, children : [1] }, { name : 'CubeBone' }],
    skins : [{ inverseBindMatrices : inverse, joints : [1], skeleton : 1 }], materials : [{ name : 'Blue', pbrMetallicRoughness : { baseColorFactor : [0.15, 0.45, 0.9, 1], metallicFactor : 0.2, roughnessFactor : 0.3 } }],
    meshes : [{ name : 'Cube', weights : [0], primitives : [{ attributes : { POSITION : position, NORMAL : normal, JOINTS_0 : joints, WEIGHTS_0 : weights }, indices, material : 0, targets : [{ POSITION : morph }] }] }],
    animations : [{ name : 'Skeletal turn', samplers : [{ input : times, output : rotations }], channels : [{ sampler : 0, target : { node : 1, path : 'rotation' } }] }, { name : 'Morph stretch', samplers : [{ input : times, output : morphWeights }], channels : [{ sampler : 0, target : { node : 0, path : 'weights' } }] }], buffers : [{ byteLength }], bufferViews : views, accessors };
const binary = Buffer.concat (chunks); const jsonBytes = Buffer.from (JSON.stringify (data)); const json = Buffer.alloc (Math.ceil (jsonBytes.length / 4) * 4, 32); jsonBytes.copy (json);
const header = Buffer.alloc (20); header.writeUInt32LE (0x46546c67, 0); header.writeUInt32LE (2, 4); header.writeUInt32LE (20 + json.length + 8 + binary.length, 8); header.writeUInt32LE (json.length, 12); header.writeUInt32LE (0x4e4f534a, 16);
const binHeader = Buffer.alloc (8); binHeader.writeUInt32LE (binary.length, 0); binHeader.writeUInt32LE (0x004e4942, 4);
await mkdir ('build/private-models', { recursive : true });
await writeFile ('build/private-models/animated-test.glb', Buffer.concat ([header, json, binHeader, binary]));
data.buffers[0].uri = 'animated-test.bin'; await writeFile ('build/private-models/animated-test.gltf', JSON.stringify (data)); await writeFile ('build/private-models/animated-test.bin', binary);
console.log ('Created original animation fixtures in build/private-models.');
