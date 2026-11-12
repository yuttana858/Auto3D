import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CreatePresentationPulpSide, PresentationPulp } from '../source/website/engineeringpulp.js';
import { CreateEngineeringPack, PoseEngineeringPack, PresentationPack as d } from '../source/website/engineeringpack.js';

describe ('Engineering presentation pack', function () {
    let pack;
    beforeEach (function () {
        const material = new THREE.MeshBasicMaterial ({ side : THREE.DoubleSide });
        const mesh = (parent, geometry, surface, position) => {
            const item = new THREE.Mesh (geometry, surface); item.position.fromArray (position); parent.add (item); return item;
        };
        const block = (parent, size, surface, position) => mesh (parent, new THREE.BoxGeometry (...size), surface, position);
        pack = CreateEngineeringPack ({ block, mesh, surface : material, edge : material });
        PoseEngineeringPack (pack, 16); pack.group.updateMatrixWorld (true);
    });
    afterEach (function () { pack.group.traverse (item => { item.geometry?.dispose (); item.material?.dispose (); }); });

    it ('folds the opposing large returns to the center without overlapping', function () {
        for (const endSide of [-1, 1]) {
            const tips = pack.returns.filter (item => item.endSide === endSide).map (item => item.group.localToWorld (new THREE.Vector3 (item.side * (d.height / 2 - 0.07), 0, endSide * d.width / 2)));
            assert.ok (tips[0].distanceTo (tips[1]) < 1e-8);
            assert.ok (Math.abs (tips[0].x) < 1e-8);
        }
    });

    it ('cuts matching hand holes through opposite walls and leaves clearance through the pulp', function () {
        assert.equal (pack.handHoles.length, 2);
        for (const hand of pack.handHoles) {
            const center = hand.group.localToWorld (hand.center.clone ());
            assert.ok (Math.abs (center.y - (d.bottom + d.handRise)) < 1e-8);
            assert.ok (Math.abs (center.z - d.centerZ) < 1e-8);
            const ray = new THREE.Raycaster (new THREE.Vector3 (hand.side * 5, center.y, center.z), new THREE.Vector3 (-hand.side, 0, 0));
            assert.equal (ray.intersectObject (pack.group, true).length, 0, 'both walls must be open at the handle');
            ray.ray.origin.y += d.handHeight / 2 + 0.1;
            assert.ok (ray.intersectObject (hand.panel).length > 0, 'keep board above the hand hole');
            for (const end of [-1, 1]) {
                const shell = new THREE.Mesh (CreatePresentationPulpSide (end), hand.panel.material);
                shell.updateMatrixWorld (true);
                for (const dy of [-0.14, 0, 0.14]) {
                    for (const dz of [-0.5, 0, 0.5]) {
                        ray.ray.origin.set (hand.side * 5, center.y + dy, center.z + dz);
                        assert.equal (ray.intersectObject (shell).length, 0, 'formed pulp must leave the full finger channel open');
                    }
                }
                shell.geometry.dispose ();
            }
        }
    });


    it ('builds exactly one connected reinforced sheet on each side with open finger clearance', function () {
        for (const side of [-1, 1]) {
            const geometry = CreatePresentationPulpSide (side), positions = geometry.attributes.position, index = geometry.index;
            const shell = new THREE.Mesh (geometry, new THREE.MeshBasicMaterial ({ side : THREE.DoubleSide })); shell.updateMatrixWorld (true);
            const adjacency = new Map ();
            for (let i = 0; i < index.count; i += 3) {
                const triangle = [index.getX (i), index.getX (i + 1), index.getX (i + 2)];
                for (const vertex of triangle) { if (!adjacency.has (vertex)) { adjacency.set (vertex, new Set ()); } for (const neighbor of triangle) { adjacency.get (vertex).add (neighbor); } }
            }
            const visited = new Set (), pending = [0];
            while (pending.length) { const vertex = pending.pop (); if (visited.has (vertex)) { continue; } visited.add (vertex); pending.push (...[...adjacency.get (vertex)].filter (neighbor => !visited.has (neighbor))); }
            assert.equal (visited.size, positions.count, 'front and rear supports must be one continuous piece');
            let minZ = Infinity, maxZ = -Infinity;
            for (let i = 0; i < positions.count; i++) { assert.ok (positions.getX (i) * side > 0.015, 'left and right cradles must remain separate'); minZ = Math.min (minZ, positions.getZ (i)); maxZ = Math.max (maxZ, positions.getZ (i)); }
            assert.ok (maxZ - minZ > 3.6, 'each side must span the full product length');
            const ray = new THREE.Raycaster (new THREE.Vector3 (side * 5, 0.65, 0.25), new THREE.Vector3 (-side, 0, 0));
            assert.equal (ray.intersectObject (shell).length, 0, 'the reinforced web must retain the finger opening');
            for (const [y, z] of [[-0.1, 0.25], [1.08, 0.25], [0.65, -1.2], [0.65, 1.7]]) {
                ray.ray.origin.set (side * 5, y, z); const hits = ray.intersectObject (shell);
                assert.equal (hits.length, 2, 'side reinforcements must be a hollow sheet, not a filled block');
                assert.ok (hits[1].distance - hits[0].distance < 0.16);
            }
            shell.morphTargetInfluences[0] = 1;
            ray.ray.origin.set (side * 1.6, 3, 0.25); ray.ray.direction.set (0, -1, 0); const flat = ray.intersectObject (shell);
            assert.equal (flat.length, 2); assert.ok (Math.abs (flat[1].distance - flat[0].distance - PresentationPulp.thickness) < 1e-6);
            shell.geometry.dispose (); shell.material.dispose ();
        }
    });

    it ('aligns all four short locking tongues with real openings in the receiver lids', function () {
        for (const tab of pack.locks) {
            const slot = pack.slots.find (item => item.side === tab.side && item.endSide === tab.endSide);
            const center = slot.group.localToWorld (slot.center.clone ());
            const root = tab.group.localToWorld (new THREE.Vector3 ());
            const tip = tab.group.localToWorld (new THREE.Vector3 (0, 0, tab.endSide * d.tabReach));
            assert.ok (Math.abs (root.x - center.x) < 1e-8 && Math.abs (root.z - center.z) < 1e-8);
            assert.ok (root.y > center.y + d.board / 2 && tip.y < center.y - d.board / 2);
            const ray = new THREE.Raycaster (center.clone ().add (new THREE.Vector3 (0, 1, 0)), new THREE.Vector3 (0, -1, 0));
            assert.equal (ray.intersectObject (slot.panel).length, 0, 'slot must be empty geometry');
            ray.ray.origin.x += d.slotWidth / 2 + 0.1;
            assert.ok (ray.intersectObject (slot.panel).length > 0, 'material must remain beside the slot');
        }
    });

    it ('keeps each tongue inside its slot while passing through the inner lid', function () {
        let crossings = 0;
        for (let t = 14; t <= 15.6; t += 0.02) {
            PoseEngineeringPack (pack, t); pack.group.updateMatrixWorld (true);
            for (const tab of pack.locks) {
                const slot = pack.slots.find (item => item.side === tab.side && item.endSide === tab.endSide);
                const center = slot.group.localToWorld (slot.center.clone ());
                const a = tab.group.localToWorld (new THREE.Vector3 ());
                const b = tab.group.localToWorld (new THREE.Vector3 (0, 0, tab.endSide * d.tabReach));
                if (a.y <= center.y || b.y >= center.y) { continue; }
                const point = a.clone ().lerp (b, (a.y - center.y) / (a.y - b.y));
                assert.ok (Math.abs (point.x - center.x) + d.tabWidth / 2 < d.slotWidth / 2);
                assert.ok (Math.abs (point.z - center.z) + 0.045 / 2 < d.slotDepth / 2);
                crossings++;
            }
        }
        assert.ok (crossings > 20, 'the closing sweep must exercise insertion');
    });
});
