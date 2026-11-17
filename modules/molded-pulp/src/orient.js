// Pull directions for forming. Each shell is formed in a local frame whose +Y is its pull direction (the tool opens
// along it); world ↔ local are proper rotations (determinant +1), so triangle winding is preserved both ways.
export const PullDirections = Object.freeze ({
    '+y' : Object.freeze ({ local : (x, y, z) => [x, y, z], world : (x, y, z) => [x, y, z] }),
    '-y' : Object.freeze ({ local : (x, y, z) => [x, -y, -z], world : (x, y, z) => [x, -y, -z] }),
    '+x' : Object.freeze ({ local : (x, y, z) => [-y, x, z], world : (x, y, z) => [y, -x, z] }),
    '-x' : Object.freeze ({ local : (x, y, z) => [y, -x, z], world : (x, y, z) => [-y, x, z] }),
    '+z' : Object.freeze ({ local : (x, y, z) => [x, z, -y], world : (x, y, z) => [x, -z, y] }),
    '-z' : Object.freeze ({ local : (x, y, z) => [x, -z, y], world : (x, y, z) => [x, z, -y] })
});

// Shells per clamshell mode: [pull direction of the first shell (formed from the low side), second shell].
export const ClamshellShells = Object.freeze ({ none : ['+y'], 'top-bottom' : ['+y', '-y'], 'side-x' : ['+x', '-x'], 'side-z' : ['+z', '-z'] });

export function ToLocal (triangles, direction)
{
    const f = PullDirections[direction].local, out = new Float32Array (triangles.length);
    for (let i = 0; i < triangles.length; i += 3) { const v = f (triangles[i], triangles[i + 1], triangles[i + 2]); out[i] = v[0]; out[i + 1] = v[1]; out[i + 2] = v[2]; }
    return out;
}

// Converts a component formed in a shell's local frame (positions relative to localOrigin) to world positions relative
// to worldOrigin, rotating normals with it.
export function ComponentToWorld (component, direction, localOrigin, worldOrigin, id = component.id)
{
    const f = PullDirections[direction].world, p = component.positions, nrm = component.normals, positions = new Float32Array (p.length), normals = new Float32Array (nrm.length);
    for (let i = 0; i < p.length; i += 3) {
        const w = f (p[i] + localOrigin[0], p[i + 1] + localOrigin[1], p[i + 2] + localOrigin[2]); positions[i] = w[0] - worldOrigin[0]; positions[i + 1] = w[1] - worldOrigin[1]; positions[i + 2] = w[2] - worldOrigin[2];
        const n = f (nrm[i], nrm[i + 1], nrm[i + 2]); normals[i] = n[0]; normals[i + 1] = n[1]; normals[i + 2] = n[2];
    }
    return { ...component, id, positions, normals };
}
