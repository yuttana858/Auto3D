import * as THREE from 'three';

// Decorative hero geometry only. These clearances are not a manufacturing profile.
export const PresentationPack = Object.freeze ({
    width : 4.2, depth : 4.2, height : 2.7, bottom : -1.3, centerZ : 0.25,
    board : 0.055, innerLidDrop : 0.075, tabWidth : 0.5, tabReach : 0.23,
    tabInset : 0.18, slotWidth : 0.68, slotDepth : 0.12,
    handWidth : 1.2, handHeight : 0.4, handRise : 1.95, handRadius : 0.15
});

function roundedOpening (x, y, width, height, radius)
{
    const path = new THREE.Path (), left = x - width / 2, right = x + width / 2, bottom = y - height / 2, top = y + height / 2;
    path.moveTo (left + radius, bottom); path.lineTo (right - radius, bottom); path.quadraticCurveTo (right, bottom, right, bottom + radius);
    path.lineTo (right, top - radius); path.quadraticCurveTo (right, top, right - radius, top);
    path.lineTo (left + radius, top); path.quadraticCurveTo (left, top, left, top - radius);
    path.lineTo (left, bottom + radius); path.quadraticCurveTo (left, bottom, left + radius, bottom); path.closePath ();
    return path;
}

export function CreateEngineeringPack ({ block, mesh, surface, edge })
{
    const d = PresentationPack;
    const group = new THREE.Group (), walls = [], lids = [], returns = [], locks = [], slots = [], handHoles = [];
    block (group, [d.width, d.board, d.depth], surface, [0, d.bottom, d.centerZ]);
    function plate (shape) {
        const geometry = new THREE.ExtrudeGeometry (shape, { depth : d.board, bevelEnabled : false, steps : 1, curveSegments : 8 });
        geometry.rotateX (Math.PI / 2); geometry.translate (0, d.board / 2, 0);
        return geometry;
    }
    function outerLid (side) {
        const xMin = Math.min (0, side * d.width / 2), xMax = Math.max (0, side * d.width / 2);
        const x = side * d.width / 4, half = d.tabWidth / 2 + 0.025, end = d.depth / 2;
        // Relief cuts let each tongue fold out of its own top panel without overlap.
        const points = [[xMin, -end], [x - half, -end], [x - half, -end + d.tabInset], [x + half, -end + d.tabInset], [x + half, -end], [xMax, -end], [xMax, end], [x + half, end], [x + half, end - d.tabInset], [x - half, end - d.tabInset], [x - half, end], [xMin, end]];
        return plate (new THREE.Shape (points.map (([px, pz]) => new THREE.Vector2 (px, pz))));
    }
    function receiver (side) {
        const zMin = Math.min (0, side * d.depth / 2), zMax = Math.max (0, side * d.depth / 2);
        const shape = new THREE.Shape ();
        shape.moveTo (-d.width / 2 + 0.04, zMin); shape.lineTo (d.width / 2 - 0.04, zMin); shape.lineTo (d.width / 2 - 0.04, zMax); shape.lineTo (-d.width / 2 + 0.04, zMax); shape.closePath ();
        for (const xSide of [-1, 1]) {
            const x = xSide * d.width / 4, z = side * d.tabInset;
            const hole = new THREE.Path ();
            hole.moveTo (x - d.slotWidth / 2, z - d.slotDepth / 2); hole.lineTo (x - d.slotWidth / 2, z + d.slotDepth / 2); hole.lineTo (x + d.slotWidth / 2, z + d.slotDepth / 2); hole.lineTo (x + d.slotWidth / 2, z - d.slotDepth / 2); hole.closePath (); shape.holes.push (hole);
        }
        return plate (shape);
    }
    for (const side of [-1, 1]) {
        const wall = new THREE.Group (); wall.position.set (side * d.width / 2, d.bottom, d.centerZ); group.add (wall);
        const wallShape = new THREE.Shape ([new THREE.Vector2 (Math.min (0, side * d.height), -d.depth / 2), new THREE.Vector2 (Math.max (0, side * d.height), -d.depth / 2), new THREE.Vector2 (Math.max (0, side * d.height), d.depth / 2), new THREE.Vector2 (Math.min (0, side * d.height), d.depth / 2)]);
        wallShape.holes.push (roundedOpening (side * d.handRise, 0, d.handHeight, d.handWidth, d.handRadius));
        const sidePanel = mesh (wall, plate (wallShape), surface, [0, 0, 0]);
        handHoles.push ({ group : wall, panel : sidePanel, side, center : new THREE.Vector3 (side * d.handRise, 0, 0) });
        const lid = new THREE.Group (); lid.position.x = side * d.height; wall.add (lid);
        mesh (lid, outerLid (side), surface, [0, 0, 0]);
        for (const endSide of [-1, 1]) {
            const flap = new THREE.Group (); flap.position.z = endSide * (d.depth / 2 - 0.065); wall.add (flap);
            // The opposing full-width returns meet at x=0 after both folds.
            block (flap, [d.height - 0.2, 0.045, d.width / 2], surface, [side * (d.height / 2 - 0.07), 0, endSide * d.width / 4]);
            returns.push ({ group : flap, endSide, side });
            // Short, centered tongues hinge at the top lid's side edge, above the receiver slots.
            const tongue = new THREE.Group (); tongue.position.set (side * d.width / 4, 0, endSide * (d.depth / 2 - d.tabInset)); lid.add (tongue);
            block (tongue, [d.tabWidth, 0.045, d.tabReach], surface, [0, 0, endSide * d.tabReach / 2]);
            locks.push ({ group : tongue, side, endSide });
        }
        block (wall, [d.height, 0.018, 0.018], edge, [side * d.height / 2, 0.035, d.depth / 2]);
        walls.push ({ group : wall, axis : 'z', side }); lids.push ({ group : lid, axis : 'z', side, minor : false });
        const end = new THREE.Group (); end.position.set (0, d.bottom, d.centerZ + side * d.depth / 2); group.add (end);
        block (end, [d.width, d.board, d.height], surface, [0, 0, side * d.height / 2]);
        const inner = new THREE.Group (); inner.position.z = side * (d.height - d.innerLidDrop); end.add (inner);
        const panel = mesh (inner, receiver (side), surface, [0, 0, 0]);
        for (const xSide of [-1, 1]) { slots.push ({ group : inner, panel, side : xSide, endSide : side, center : new THREE.Vector3 (xSide * d.width / 4, 0, side * d.tabInset) }); }
        walls.push ({ group : end, axis : 'x', side : -side }); lids.push ({ group : inner, axis : 'x', side : -side, minor : true });
    }
    return { group, walls, lids, returns, locks, slots, handHoles };
}

export function PoseEngineeringPack (pack, t)
{
    const smooth = (a, b) => { const v = THREE.MathUtils.clamp ((t - a) / (b - a), 0, 1); return v * v * (3 - 2 * v); };
    for (let i = 0; i < pack.walls.length; i++) { const p = pack.walls[i], start = p.axis === 'z' ? 8.5 + i * 0.08 : 10.5 + i * 0.06; p.group.rotation[p.axis] = p.side * Math.PI / 2 * smooth (start, start + 1.2); }
    for (const p of pack.returns) { p.group.rotation.x = -p.endSide * Math.PI / 2 * smooth (9.7, 10.4); }
    for (const p of pack.locks) { p.group.rotation.x = -p.endSide * Math.PI / 2 * smooth (13, 13.8); }
    for (const p of pack.lids) { const start = (p.minor ? 11.8 : 14) + (p.side + 1) * 0.2; p.group.rotation[p.axis] = p.side * Math.PI / 2 * smooth (start, start + 1.15); }
}
