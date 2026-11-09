export const ProductMaterials = Object.freeze ({
    paperboard : { name : 'Paperboard · uncoated', families : ['clamshell'], metalness : 0, roughness : .88 },
    moldedFiber : { name : 'Molded fiber · matte', color : '#b69b71', families : ['clamshell'], metalness : 0, roughness : .95 },
    kraftFilm : { name : 'Kraft-look laminate', color : '#ba9865', families : ['pouch'], metalness : 0, roughness : .85 },
    satinFilm : { name : 'Satin PE film', families : ['pouch'], metalness : 0, roughness : .4 },
    lacquer : { name : 'Gloss lacquer', families : ['can'], metalness : 0, roughness : .12 },
    softTouch : { name : 'Soft-touch coating', families : ['bottle', 'can'], metalness : 0, roughness : .8 },
    plastic : { name : 'Opaque plastic', families : ['bottle', 'pouch', 'clamshell'], metalness : 0, roughness : 0.45 },
    hdpe : { name : 'HDPE · matte', families : ['bottle'], metalness : 0, roughness : 0.62 },
    pp : { name : 'Polypropylene · satin', families : ['bottle', 'clamshell'], metalness : 0, roughness : 0.32 },
    petOpaque : { name : 'PET · opaque gloss', families : ['bottle', 'clamshell'], metalness : 0, roughness : 0.12 },
    glass : { name : 'Glass · unavailable', families : ['bottle'], metalness : 0, roughness : 0.1 },
    aluminum : { name : 'Aluminum', families : ['can'], metalness : 1, roughness : 0.3 },
    steel : { name : 'Steel', families : ['can'], metalness : 1, roughness : 0.38 },
    coatedMetal : { name : 'Painted metal', families : ['can'], metalness : 0, roughness : 0.26 },
    brushedMetal : { name : 'Matte metal', families : ['can'], metalness : 1, roughness : 0.65 },
    matteFilm : { name : 'Matte film', families : ['pouch'], metalness : 0, roughness : 0.7 },
    glossFilm : { name : 'Gloss film', families : ['pouch'], metalness : 0, roughness : 0.14 },
    foil : { name : 'Metallic laminate', families : ['pouch'], metalness : 1, roughness : 0.28 }
});
export function ListProductMaterials (family) { return Object.entries (ProductMaterials).filter (([, m]) => m.families.includes (family)).map (([id, m]) => ({ id, name : m.name, metalness : m.metalness, roughness : m.roughness, ...(m.color ? { color : m.color } : {}), available : id !== 'glass' })); }
