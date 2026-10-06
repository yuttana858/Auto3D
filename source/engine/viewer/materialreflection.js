export function MaterialReflectionStrength (material)
{
    const explicit = material?.userData?.auto3dReflectionStrength;
    if (Number.isFinite (explicit)) {
        return Math.max (0, Math.min (1, explicit));
    }
    if (material?.isMeshPhysicalMaterial) {
        return Math.max (0, Math.min (1, Number.isFinite (material.specularIntensity) ? material.specularIntensity : 1));
    }
    if (material?.isMeshPhongMaterial && material.specular) {
        return Math.max (0, Math.min (1, Math.max (material.specular.r, material.specular.g, material.specular.b)));
    }
    return 1;
}

export function SetMaterialReflectionStrength (material, value)
{
    if (!material) { return; }
    material.userData.auto3dReflectionStrength = Math.max (0, Math.min (1, Number (value)));
}
