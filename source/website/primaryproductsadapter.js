import { ContentPresets } from '../../modules/primary-products/src/contents.js';
import { ProductSurfaceMaps, ProductGrain, LabelFinishes } from '../../modules/primary-products/src/surfaces.js';
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
export function ApplyProductOptics (material, draft, wallMm, unit)
{
    const factor = millimeters[unit];
    if (material.transmission > 0 || draft.optics) { material.thickness = wallMm / factor; }
    if (draft.optics) {
        const optics = draft.optics;
        material.color = new RGBColor (255, 255, 255); material.attenuationColor = new RGBColor (...optics.color.slice (1).match (/.{2}/g).map (n => parseInt (n, 16)));
        material.attenuationDistance = optics.tintDistanceMm / factor; material.transmission = 1 - optics.opacity; material.ior = optics.ior; material.opacity = 1; material.transparent = false; material.transmissionBackground = false;
        // Absorption is inactive at zero transmission; retain the selected tint on opaque glass.
        if (optics.opacity === 1) { material.color = new RGBColor (material.attenuationColor.r, material.attenuationColor.g, material.attenuationColor.b); }
    }
}
export function PrimaryProductModel (data, unit, artwork = [], resources = new Map ())
{
    const factor = millimeters[unit]; if (!factor) { throw new Error ('Set known scene units before adding a product.'); }
    if (data.apiVersion !== 1 || data.units !== 'mm') { throw new Error ('Unsupported Primary Products geometry.'); }
    const model = new Model (); model.SetUnit (unit);
    const color = data.definition.color.slice (1).match (/.{2}/g).map (part => parseInt (part, 16));
    const textureFor = data => { const map = new TextureMap (); Object.assign (map, data); return map; };
    const labels = ValidateProductArtwork (data.definition, artwork).map (a => CreateLabelMesh (data.definition, a));
    for (const component of [...data.components, ...labels]) {
        const material = new PhysicalMaterial (); material.name = 'Primary Products · ' + component.materialRole;
        material.color = new RGBColor (...(component.materialRole === 'body' ? color : ['cap-seam', 'opening-score'].includes (component.id) ? [70, 75, 74] : component.materialRole === 'closure' ? [235, 236, 229] : [190, 198, 199]));
        if (data.definition.details && component.id.startsWith ('zipper-')) { material.color = new RGBColor (...color.map (v => Math.round (v * .88))); }
        material.roughness = component.materialRole === 'body' ? data.definition.roughness : 0.35;
        material.metalness = component.materialRole === 'closure' ? 0 : component.materialRole === 'end' ? 1 : ProductMaterials[data.definition.material].metalness;
        if (component.materialRole === 'body') {
            const preset = ProductMaterials[data.definition.material];
            material.transmission = preset.transmission || 0; material.ior = preset.ior || 1.5;
            material.thickness = material.transmission ? (data.quality.wallMm || Math.min (1.2, data.definition.widthMm*.04, data.definition.depthMm*.04, data.definition.heightMm*.04))/factor : 0;
            material.doubleSided = false;
            ApplyProductOptics (material, data.definition, data.quality.wallMm || 0, unit);
            material.clearcoat = preset.clearcoat ?? (['petOpaque', 'lacquer', 'glossFilm'].includes (data.definition.material) ? .8 : 0); material.clearcoatRoughness = .12;
        }
        if (data.definition.details && ['body', 'end', 'closure'].includes (component.materialRole)) {
            const detail = data.definition.details, kind = component.materialRole === 'end' ? 'brushed' : component.materialRole === 'closure' ? 'plastic' : ProductGrain (data.definition.material);
            if (detail.textureStrength > 0) {
                const maps = ProductSurfaceMaps (kind, detail.textureStrength);
                for (const [key, value] of Object.entries (maps)) { material[key] = textureFor (value); const width = data.definition.diameterMm ? Math.PI * data.definition.diameterMm : data.definition.widthMm; material[key].scale = new Coord2D (width / detail.textureScaleMm, data.definition.heightMm / detail.textureScaleMm); }
                material.metalnessMap = textureFor (maps.roughnessMap); material.metalnessMap.scale = new Coord2D (material.roughnessMap.scale.x, material.roughnessMap.scale.y);
                material.reliefMode = 'bump'; material.bumpScale = (kind === 'fiber' ? .12 : kind === 'paper' ? .04 : kind === 'film' ? .035 : kind === 'smooth' ? .002 : .015) * detail.textureStrength / factor;
                material.normalScale = detail.textureStrength * .25;
            }
        }
        if (component.materialRole === 'contents') {
            const fill = data.definition.contents, preset = ContentPresets[fill.type];
            material.color = new RGBColor (...fill.color.slice (1).match (/.{2}/g).map (n => parseInt (n, 16))); material.metalness = 0; material.roughness = preset.roughness; material.ior = preset.ior;
            // Opaque-pass alpha compositing keeps static liquid visible in the glass refraction buffer.
            // Ordinary blended/transmissive inner objects are omitted by Three's transmission pass.
            material.opacity = fill.opacity; material.transmissionBackground = true; material.transparent = false; material.transmission = 0; material.doubleSided = false; material.clearcoat = .4;
        }
        if (component.artwork) {
            const a = component.artwork, source = resources.get (a.resourceId); if (!source?.buffer) { throw new Error ('Import the missing label source before generating.'); }
            material.name = 'Primary label · ' + a.resourceId; material.color = new RGBColor (255, 255, 255); material.metalness = 0; material.roughness = 0.5; material.transparent = true; material.alphaTest = 0.01; material.doubleSided = false;
            if (a.finish) {
                const finish = LabelFinishes[a.finish]; material.roughness = finish.roughness; material.metalness = finish.metalness; material.clearcoat = finish.clearcoat; material.clearcoatRoughness = .08;
                const maps = ProductSurfaceMaps (finish.grain, .6); for (const [key, value] of Object.entries (maps)) { material[key] = textureFor (value); material[key].scale = new Coord2D (a.widthMm / 12, a.heightMm / 12); }
                material.metalnessMap = textureFor (maps.roughnessMap); material.metalnessMap.scale = new Coord2D (a.widthMm / 12, a.heightMm / 12); material.reliefMode = 'bump'; material.bumpScale = finish.bumpMm / factor;
            }
            const texture = new TextureMap (); texture.name = a.resourceId + (a.mime === 'image/jpeg' ? '.jpg' : a.mime === 'image/webp' ? '.webp' : '.png'); texture.mimeType = a.mime; texture.buffer = source.buffer; material.diffuseMap = texture;
        }
        const materialIndex = model.AddMaterial (material);
        const mesh = new Mesh (); mesh.SetName (component.id);
        for (let i = 0; i < component.positions.length; i += 3) { mesh.AddVertex (new Coord3D (...component.positions.slice (i, i + 3).map (n => n / factor))); mesh.AddNormal (new Coord3D (...component.normals.slice (i, i + 3))); }
        for (let i = 0; i < component.uvs.length; i += 2) {
            let uv = component.uvs.slice (i, i + 2);
            if (data.definition.details && !component.artwork) {
                const vertex = i/2, [x, y, z] = component.positions.slice (vertex*3, vertex*3+3), normal = component.normals.slice (vertex*3, vertex*3+3), width = data.definition.diameterMm ? Math.PI*data.definition.diameterMm : data.definition.widthMm, height = data.definition.heightMm;
                if (data.definition.family === 'clamshell') { const axis = Math.abs (normal[1]) > .5 ? 1 : Math.abs (normal[0]) > Math.abs (normal[2]) ? 0 : 2; uv = axis === 1 ? [x/width, z/height] : axis === 0 ? [z/width, y/height] : [x/width, y/height]; }
                else { uv[1] = y/height; }
            }
            mesh.AddTextureUV (new Coord2D (...uv));
        }
        for (let i = 0; i < component.indices.length; i += 3) { const ids = component.indices.slice (i, i + 3); mesh.AddTriangle (new Triangle (...ids).SetNormals (...ids).SetTextureUVs (...ids).SetMaterial (materialIndex).SetCurve (0)); }
        model.AddMeshToRootNode (mesh);
    }
    return model;
}
