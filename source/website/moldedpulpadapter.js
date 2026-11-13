import { Model } from '../engine/model/model.js';
import { Mesh } from '../engine/model/mesh.js';
import { Triangle } from '../engine/model/triangle.js';
import { Coord3D } from '../engine/geometry/coord3d.js';
import { Coord2D } from '../engine/geometry/coord2d.js';
import { PhysicalMaterial } from '../engine/model/material.js';
import { RGBColor } from '../engine/model/color.js';
import { Unit } from '../engine/model/unit.js';

export const PulpMillimeters = { [Unit.Millimeter] : 1, [Unit.Centimeter] : 10, [Unit.Meter] : 1000, [Unit.Inch] : 25.4, [Unit.Foot] : 304.8 };

// World-space triangles of the given session objects in canonical millimetres, packed for the module's sensing API.
export function SessionTrianglesMm (document, objects)
{
    const factor = PulpMillimeters[document.model.GetUnit ()]; if (!factor) { throw new Error ('Set known scene units before forming molded pulp.'); }
    const values = []; let count = 0;
    document.CompactModel (objects).EnumerateTriangleVertices ((a, b, c) => {
        if (++count > 2000000) { throw new Error ('The selected products exceed 2,000,000 triangles. Simplify them before forming pulp.'); }
        values.push (a.x * factor, a.y * factor, a.z * factor, b.x * factor, b.y * factor, b.z * factor, c.x * factor, c.y * factor, c.z * factor);
    });
    return Float32Array.from (values);
}

// Neutral module plan (canonical mm, origin-relative components) to an engine model in scene units. The returned origin is
// the object position, so the formed tray scales about its base plane during the forming animation.
export function MoldedPulpModel (plan, unit, roughness)
{
    const factor = PulpMillimeters[unit]; if (!factor) { throw new Error ('Set known scene units before forming molded pulp.'); }
    if (plan.apiVersion !== 1 || plan.units !== 'mm') { throw new Error ('Unsupported Molded Pulp geometry.'); }
    const model = new Model (); model.SetUnit (unit);
    const material = new PhysicalMaterial (); material.name = 'Molded pulp · ' + plan.draft.pulpType;
    material.color = new RGBColor (...plan.draft.color.slice (1).match (/.{2}/g).map (part => parseInt (part, 16)));
    material.roughness = roughness; material.metalness = 0; material.doubleSided = false;
    const materialIndex = model.AddMaterial (material);
    for (const component of plan.components) {
        const mesh = new Mesh (); mesh.SetName (component.id);
        for (let i = 0; i < component.positions.length; i += 3) {
            mesh.AddVertex (new Coord3D (component.positions[i] / factor, component.positions[i + 1] / factor, component.positions[i + 2] / factor));
            mesh.AddNormal (new Coord3D (component.normals[i], component.normals[i + 1], component.normals[i + 2]));
        }
        for (let i = 0; i < component.uvs.length; i += 2) { mesh.AddTextureUV (new Coord2D (component.uvs[i], component.uvs[i + 1])); }
        for (let i = 0; i < component.indices.length; i += 3) { const a = component.indices[i], b = component.indices[i + 1], c = component.indices[i + 2]; mesh.AddTriangle (new Triangle (a, b, c).SetNormals (a, b, c).SetTextureUVs (a, b, c).SetMaterial (materialIndex).SetCurve (0)); }
        model.AddMeshToRootNode (mesh);
    }
    return { model, position : plan.origin.map (v => v / factor) };
}
