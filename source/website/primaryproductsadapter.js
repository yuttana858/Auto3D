import { ProductMaterials } from '../../modules/primary-products/src/materials.js';
import { CreateLabelMesh, ValidateProductArtwork } from '../../modules/primary-products/src/artwork.js';
import { Model } from '../engine/model/model.js';
import { Mesh } from '../engine/model/mesh.js';
import { Triangle } from '../engine/model/triangle.js';
import { Coord3D } from '../engine/geometry/coord3d.js';
import { Coord2D } from '../engine/geometry/coord2d.js';
import { PhysicalMaterial, TextureMap } from '../engine/model/material.js';
import { RGBColor } from '../engine/model/color.js';
import { Unit } from '../engine/model/unit.js';

const millimeters = { [Unit.Millimeter] : 1, [Unit.Centimeter] : 10, [Unit.Meter] : 1000, [Unit.Inch] : 25.4, [Unit.Foot] : 304.8 };
export function PrimaryProductModel (data, unit, artwork = [], resources = new Map ())
{
    const factor = millimeters[unit]; if (!factor) { throw new Error ('Set known scene units before adding a product.'); }
    if (data.apiVersion !== 1 || data.units !== 'mm' || data.definition.material === 'glass') { throw new Error ('Only opaque Primary Products geometry is supported.'); }
    const model = new Model (); model.SetUnit (unit);
    const color = data.definition.color.slice (1).match (/.{2}/g).map (part => parseInt (part, 16));
    const labels = ValidateProductArtwork (data.definition, artwork).map (a => CreateLabelMesh (data.definition, a));
    for (const component of [...data.components, ...labels]) {
        const material = new PhysicalMaterial (); material.name = 'Primary Products · ' + component.materialRole;
        material.color = new RGBColor (...(component.materialRole === 'body' ? color : [190, 198, 199]));
        material.roughness = component.materialRole === 'body' ? data.definition.roughness : 0.35;
        material.metalness = component.materialRole === 'closure' ? 0 : component.materialRole === 'end' ? 1 : ProductMaterials[data.definition.material].metalness;
        if (component.artwork) {
            const a = component.artwork, source = resources.get (a.resourceId); if (!source?.buffer) { throw new Error ('Import the missing label source before generating.'); }
            material.name = 'Primary label · ' + a.resourceId; material.color = new RGBColor (255, 255, 255); material.metalness = 0; material.roughness = 0.5; material.transparent = true; material.alphaTest = 0.01; material.doubleSided = false;
            const texture = new TextureMap (); texture.name = a.resourceId + (a.mime === 'image/jpeg' ? '.jpg' : a.mime === 'image/webp' ? '.webp' : '.png'); texture.mimeType = a.mime; texture.buffer = source.buffer; material.diffuseMap = texture;
        }
        const materialIndex = model.AddMaterial (material);
        const mesh = new Mesh (); mesh.SetName (component.id);
        for (let i = 0; i < component.positions.length; i += 3) { mesh.AddVertex (new Coord3D (...component.positions.slice (i, i + 3).map (n => n / factor))); mesh.AddNormal (new Coord3D (...component.normals.slice (i, i + 3))); }
        for (let i = 0; i < component.uvs.length; i += 2) { mesh.AddTextureUV (new Coord2D (...component.uvs.slice (i, i + 2))); }
        for (let i = 0; i < component.indices.length; i += 3) { const ids = component.indices.slice (i, i + 3); mesh.AddTriangle (new Triangle (...ids).SetNormals (...ids).SetTextureUVs (...ids).SetMaterial (materialIndex).SetCurve (0)); }
        model.AddMeshToRootNode (mesh);
    }
    return model;
}
