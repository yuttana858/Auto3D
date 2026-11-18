import { PalletColors, PalletPresets } from './palletplan.js';

// Procedural block pallet in the module's neutral mesh format (millimetres).
// Origin: centre of the bottom face. Width along X, length along Z, height along Y.
// Layout: top deck boards across the width, three stringer boards along the length,
// a 3 × 3 grid of blocks, and three bottom boards along the length.
function Cuboid (mesh, material, [x0, y0, z0], [x1, y1, z1])
{
    const faces = [
        [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
        [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
        [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
        [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]],
        [[0, 0, 1], [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]]],
        [[0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]]
    ];
    for (const [normal, corners] of faces) {
        const start = mesh.vertices.length, normalIndex = mesh.normals.length;
        mesh.normals.push (normal);
        for (const corner of corners) { mesh.vertices.push (corner); }
        const uv = mesh.uvs.length; mesh.uvs.push ([0, 0], [0, 1], [1, 1], [1, 0]);
        for (const [p, q, r] of [[0, 1, 2], [0, 2, 3]]) {
            mesh.triangles.push ({ vertices : [start + p, start + q, start + r], normals : [normalIndex, normalIndex, normalIndex], uvs : [uv + p, uv + q, uv + r], material });
        }
    }
}

const Spread = (count, span, size) => Array.from ({ length : count }, (_, index) => -span / 2 + size / 2 + index * (count > 1 ? (span - size) / (count - 1) : 0));

export function CreatePallet ({ pallet = PalletPresets['gma-40x48'], color = 'blue' } = {})
{
    const finish = PalletColors[color]; if (!finish) { throw new Error ('Choose a blue, brown or black pallet.'); }
    const W = pallet.widthMm, L = pallet.lengthMm, H = pallet.heightMm;
    if (![W, L, H].every (v => Number.isFinite (v) && v > 0)) { throw new Error ('Pallet dimensions must be positive millimetres.'); }
    const board = Math.min (22, H / 5.5), block = Math.max (H - 3 * board, board), blockSize = Math.min (W, L) * 0.1;
    const mesh = { name : 'Pallet', vertices : [], normals : [], uvs : [], triangles : [], lines : [] };
    const bottomTop = board, blockTop = bottomTop + block, stringerTop = blockTop + board;
    for (const x of Spread (3, W, blockSize)) {
        Cuboid (mesh, 0, [x - blockSize / 2, 0, -L / 2], [x + blockSize / 2, bottomTop, L / 2]);
        for (const z of Spread (3, L, blockSize)) { Cuboid (mesh, 0, [x - blockSize / 2, bottomTop, z - blockSize / 2], [x + blockSize / 2, blockTop, z + blockSize / 2]); }
        Cuboid (mesh, 0, [x - blockSize / 2, blockTop, -L / 2], [x + blockSize / 2, stringerTop, L / 2]);
    }
    const deckCount = 7, deckWidth = Math.min (L / deckCount * 0.75, 140);
    for (const z of Spread (deckCount, L, deckWidth)) { Cuboid (mesh, 0, [-W / 2, stringerTop, z - deckWidth / 2], [W / 2, H, z + deckWidth / 2]); }
    return {
        units : 'mm',
        parameters : { pallet : pallet.id || null, widthMm : W, lengthMm : L, heightMm : H, color : finish.id },
        materials : [{ name : finish.name + ' pallet', role : 'pallet', color : [...finish.color], roughness : color === 'black' ? 0.55 : 0.8, metalness : 0 }],
        meshes : [mesh]
    };
}
