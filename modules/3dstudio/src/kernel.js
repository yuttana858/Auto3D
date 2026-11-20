import ManifoldModule from 'manifold-3d';
import { ValidateStudioDefinition } from './definition.js';

export const STUDIO_KERNEL_VERSION = '3.5.5';
export const STUDIO_KERNEL_LIMITS = Object.freeze ({
    inputTriangles: 200000,
    outputTriangles: 500000,
    evaluatedTriangles: 1000000
});

let kernelPromise = null;

async function LoadKernel (wasmUrl)
{
    if (kernelPromise === null) {
        const options = wasmUrl ? { locateFile: (path, prefix) => path.endsWith ('.wasm') ? wasmUrl : prefix + path } : {};
        kernelPromise = ManifoldModule (options).then ((module) => {
            module.setup ();
            return module;
        }).catch ((error) => {
            kernelPromise = null;
            throw error;
        });
    }
    return kernelPromise;
}

/**
 * Evaluate a bounded, canonical-mm recipe without importing the viewer or CAD.
 * All native objects belong to this evaluation and are deleted on every exit.
 * A worker must enforce the wall-clock deadline: synchronous WASM cannot be
 * interrupted by an AbortSignal on the same JavaScript thread.
 */
export async function EvaluateStudio (input, options = {})
{
    const definition = ValidateStudioDefinition (input);
    const module = options.module || await LoadKernel (options.wasmUrl);
    const Manifold = module.Manifold;
    const owned = [];
    const own = (solid) => {
        owned.push (solid);
        return solid;
    };
    const byId = new Map (definition.nodes.map ((node) => [node.id, node]));
    const evaluated = new Map ();
    const originals = new Map ();
    const materials = [];
    let inputTriangles = 0;
    let evaluatedTriangles = 0;

    function CheckSolid (solid, primitive)
    {
        const status = solid.status ();
        if (status !== 'NoError') {
            throw new Error ('3Dstudio could not create a closed solid: ' + status + '.');
        }
        const count = solid.numTri ();
        evaluatedTriangles += count;
        if (primitive) {
            inputTriangles += count;
        }
        if (inputTriangles > STUDIO_KERNEL_LIMITS.inputTriangles ||
            count > STUDIO_KERNEL_LIMITS.outputTriangles ||
            evaluatedTriangles > STUDIO_KERNEL_LIMITS.evaluatedTriangles) {
            throw new Error ('3Dstudio geometry exceeds the triangle budget. Reduce detail or the number of operations.');
        }
        return solid;
    }

    function Primitive (node)
    {
        const p = node.parameters;
        // Preserve the requested axis diameters at every detail level. The
        // sphere constructor also rounds its segments to a multiple of four.
        const segments = p.segments ? Math.ceil (p.segments / 4) * 4 : 0;
        let solid;
        let height;
        switch (node.type) {
            case 'box':
                solid = own (Manifold.cube ([p.widthMm, p.heightMm, p.depthMm], true));
                height = p.heightMm;
                break;
            case 'sphere':
                solid = own (Manifold.sphere (p.diameterMm / 2, segments));
                height = p.diameterMm;
                break;
            case 'cylinder':
                solid = own (Manifold.cylinder (p.heightMm, p.diameterMm / 2, p.diameterMm / 2, segments, true));
                height = p.heightMm;
                break;
            case 'cone':
                solid = own (Manifold.cylinder (p.heightMm, p.diameterMm / 2, p.topDiameterMm / 2, segments, true));
                height = p.heightMm;
                break;
            case 'tube': {
                const outer = own (Manifold.cylinder (p.heightMm, p.outerDiameterMm / 2, p.outerDiameterMm / 2, segments, true));
                // Extend the cutter beyond both ends; the bore is open through
                // the full height even after kernel tolerance simplification.
                const inner = own (Manifold.cylinder (p.heightMm + Math.max (0.002, p.heightMm * 0.00002), p.innerDiameterMm / 2, p.innerDiameterMm / 2, segments, true));
                solid = own (outer.subtract (inner));
                height = p.heightMm;
                break;
            }
            case 'torus': {
                const radius = p.majorDiameterMm / 2;
                const tubeRadius = p.tubeDiameterMm / 2;
                const tubeSegments = Math.ceil (p.tubeSegments / 4) * 4;
                const section = Array.from ({ length: tubeSegments }, (_, index) => {
                    const angle = 2 * Math.PI * index / tubeSegments;
                    return [radius + tubeRadius * Math.cos (angle), tubeRadius * Math.sin (angle)];
                });
                solid = own (Manifold.revolve ([section], segments));
                height = p.tubeDiameterMm;
                break;
            }
            case 'capsule': {
                const radius = p.diameterMm / 2;
                const straight = p.heightMm - p.diameterMm;
                const sphere = own (Manifold.sphere (radius, segments));
                if (straight === 0) {
                    solid = sphere;
                } else {
                    const cylinder = own (Manifold.cylinder (straight, radius, radius, segments, true));
                    const lower = own (sphere.translate ([0, 0, -straight / 2]));
                    const upper = own (sphere.translate ([0, 0, straight / 2]));
                    solid = own (own (cylinder.add (lower)).add (upper));
                }
                height = p.heightMm;
                break;
            }
            default:
                throw new Error ('Unsupported 3Dstudio primitive: ' + node.type + '.');
        }
        // Manifold cylinders/revolutions are Z-up. The module contract is
        // Y-up with the primitive base centered at Y=0.
        if (node.type !== 'box' && node.type !== 'sphere') {
            solid = own (solid.rotate ([-90, 0, 0]));
        }
        solid = own (solid.translate ([0, height / 2, 0]));
        // Calculate surface normals before CSG so a new cut keeps the two
        // source surfaces' normals, even where their intersection is shallow.
        // Recomputing across the final mesh would blur that crisp cut seam.
        solid = own (solid.calculateNormals (0, 45));
        solid = own (solid.asOriginal ());
        const materialIndex = materials.length;
        materials.push ({ ...node.material, id: node.id, sourcePrimitiveId: node.id, name: node.name });
        originals.set (solid.originalID (), materialIndex);
        const transform = node.transform;
        if (transform.scale.some ((value) => value !== 1)) {
            solid = own (solid.scale (transform.scale));
        }
        // Match the viewer's intrinsic XYZ Euler convention (Rx * Ry * Rz).
        // Manifold's combined rotate uses the reverse convention, so apply
        // global Z, Y, X rotations explicitly without a renderer dependency.
        for (const axis of [2, 1, 0]) {
            if (transform.rotation[axis] !== 0) {
                const rotation = [0, 0, 0];
                rotation[axis] = transform.rotation[axis];
                solid = own (solid.rotate (rotation));
            }
        }
        if (transform.position.some ((value) => value !== 0)) {
            solid = own (solid.translate (transform.position));
        }
        return CheckSolid (solid, true);
    }

    function EvaluateNode (id)
    {
        if (evaluated.has (id)) {
            return evaluated.get (id);
        }
        const node = byId.get (id);
        let solid;
        if (node.kind === 'primitive') {
            solid = Primitive (node);
        } else if (node.kind === 'transform') {
            solid = CheckSolid (own (EvaluateNode (node.input).transform (node.matrix)), false);
        } else if (!node.enabled) {
            solid = EvaluateNode (node.left);
        } else {
            const left = EvaluateNode (node.left);
            const right = EvaluateNode (node.right);
            const operation = { union: 'add', subtract: 'subtract', intersect: 'intersect' }[node.operation];
            solid = CheckSolid (own (left[operation] (right)), false);
        }
        evaluated.set (id, solid);
        return solid;
    }

    try {
        const solid = EvaluateNode (definition.rootId);
        const empty = solid.isEmpty ();
        const components = empty ? [] : solid.decompose ();
        components.forEach (own);
        const statistics = {
            triangles: solid.numTri (),
            vertices: solid.numVert (),
            volumeMm3: solid.volume (),
            surfaceAreaMm2: solid.surfaceArea (),
            components: components.length,
            bounds: empty ? { min: [0, 0, 0], max: [0, 0, 0] } : solid.boundingBox (),
            empty,
            closed: !empty
        };
        if (![statistics.volumeMm3, statistics.surfaceAreaMm2, ...statistics.bounds.min, ...statistics.bounds.max].every (Number.isFinite)) {
            throw new Error ('3Dstudio produced invalid geometry measurements.');
        }
        // The kernel transforms source normals and flips cutter normals at
        // subtraction surfaces. Channel zero follows those properties.
        const mesh = solid.getMesh (0);
        const vertexCount = mesh.vertProperties.length / mesh.numProp;
        const positions = new Float64Array (vertexCount * 3);
        const normals = new Float32Array (vertexCount * 3);
        for (let vertex = 0; vertex < vertexCount; vertex++) {
            const source = vertex * mesh.numProp;
            for (let axis = 0; axis < 3; axis++) {
                const position = mesh.vertProperties[source + axis];
                const normal = mesh.vertProperties[source + 3 + axis];
                if (!Number.isFinite (position) || !Number.isFinite (normal)) {
                    throw new Error ('3Dstudio geometry exceeds the supported coordinate precision. Reduce the model scale or transforms.');
                }
                positions[vertex * 3 + axis] = position;
                normals[vertex * 3 + axis] = normal;
            }
            // Boolean edge intersections interpolate properties. Normalize
            // the resulting normal after interpolation and affine transforms.
            const length = Math.hypot (normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]);
            if (length === 0) {
                throw new Error ('3Dstudio produced an invalid surface normal.');
            }
            for (let axis = 0; axis < 3; axis++) {
                normals[vertex * 3 + axis] /= length;
            }
        }
        // Copy native-backed storage before disposing of its owning solids.
        const indices = new Uint32Array (mesh.triVerts);
        // MeshGL exports Float32 positions even though Manifold's internal
        // geometry is double precision. Large translations can collapse a
        // small feature during export while the native solid still reports
        // valid volume. Never commit those degenerate rendering triangles.
        for (let triangle = 0; triangle < indices.length; triangle += 3) {
            const a = indices[triangle] * 3, b = indices[triangle + 1] * 3, c = indices[triangle + 2] * 3;
            const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
            const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
            if (uy * vz - uz * vy === 0 && uz * vx - ux * vz === 0 && ux * vy - uy * vx === 0) {
                throw new Error ('3Dstudio geometry exceeds the supported coordinate precision. Reduce the model scale or transforms.');
            }
        }
        const materialIndices = new Uint32Array (indices.length / 3);
        for (let run = 0; run < mesh.runOriginalID.length; run++) {
            const materialIndex = originals.get (mesh.runOriginalID[run]);
            if (materialIndex === undefined) {
                throw new Error ('3Dstudio lost surface material provenance.');
            }
            materialIndices.fill (materialIndex, mesh.runIndex[run] / 3, mesh.runIndex[run + 1] / 3);
        }
        return {
            positions, normals, indices, materialIndices, materials, statistics,
            kernel: { name: 'manifold', version: STUDIO_KERNEL_VERSION }
        };
    } finally {
        // Reverse construction order also releases deferred Boolean operands
        // after their descendants. No native wrapper escapes this function.
        for (let index = owned.length - 1; index >= 0; index--) {
            owned[index].delete ();
        }
    }
}
