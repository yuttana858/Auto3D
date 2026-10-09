import { CreateSessionArchive, EncodeBuffer, SessionVersion } from './sessionarchive.js';

const TriangleKeys = ['v0', 'v1', 'v2', 'c0', 'c1', 'c2', 'n0', 'n1', 'n2', 'u0', 'u1', 'u2', 'mat', 'curve'];

// Accept structured-cloned data, so engine class prototypes are unnecessary.
export function PackRecoverySnapshot (snapshot)
{
    const meshMap = new Map (); const materialMap = new Map ();
    const meshes = []; const materials = [];
    const materialIndex = (index) => {
        if (index === null || index === undefined) { return index; }
        if (!materialMap.has (index)) {
            const source = snapshot.materials[index]; const material = {};
            for (const [key, value] of Object.entries (source)) {
                material[key] = key.endsWith ('Map') && value ? { ...value, buffer : value.buffer ? EncodeBuffer (value.buffer) : null } : value;
            }
            materialMap.set (index, materials.length); materials.push (material);
        }
        return materialMap.get (index);
    };
    const packNode = (node) => ({ ...node, meshes : node.meshes.map ((index) => {
        if (!meshMap.has (index)) {
            const mesh = snapshot.meshes[index];
            meshMap.set (index, meshes.length);
            meshes.push ({ name : mesh.name, properties : mesh.propertyGroups,
                vertices : mesh.vertices.map ((p) => [p.x, p.y, p.z]), normals : mesh.normals.map ((p) => [p.x, p.y, p.z]),
                colors : mesh.vertexColors.map ((p) => [p.r, p.g, p.b]), uvs : mesh.uvs.map ((p) => [p.x, p.y]),
                triangles : mesh.triangles.map ((triangle) => TriangleKeys.map ((key) => key === 'mat' ? materialIndex (triangle[key]) : triangle[key])),
                lines : mesh.lines.map ((line) => [line.vertices, materialIndex (line.mat)]) });
        }
        return meshMap.get (index);
    }), children : node.children.map (packNode) });
    const nodes = snapshot.objects.map ((object) => packNode (object.node));
    return {
        format : 'SW Auto3D', version : SessionVersion, metadata : { savedAt : new Date ().toISOString () }, kind : snapshot.kind || 'session', name : snapshot.name, view : snapshot.view, packaging : snapshot.packaging || null,
        objects : snapshot.objects.map ((object) => {
            const { node, ...data } = object;
            return { ...data, animationAsset : object.animationAsset ? { main : object.animationAsset.main, files : object.animationAsset.files.map ((file) => ({ name : file.name, buffer : EncodeBuffer (file.buffer) })) } : null };
        }),
        model : { unit : snapshot.unit, properties : snapshot.properties, materials, meshes, nodes }
    };
}

export function CreateRecoveryArchive (snapshot) { return CreateSessionArchive (PackRecoverySnapshot (snapshot)); }
