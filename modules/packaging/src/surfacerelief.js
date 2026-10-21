import { EncodeRGBTexture } from './surfacetextures.js';
import { ValidateSurfaceRelief, ValidateSpotVarnish } from './reliefsettings.js';

export function MaskCoverage (mask, u, v, settings)
{
    const mu = (u - settings.maskU) / settings.maskScale + 0.5; const mv = (v - settings.maskV) / settings.maskScale + 0.5;
    if (!mask || mu < 0 || mu >= 1 || mv < 0 || mv >= 1) { return 0; }
    const sx = Math.min (mask.width - 1, Math.floor (mu * mask.width)); const sy = Math.min (mask.height - 1, Math.floor (mv * mask.height));
    const i = (sy * mask.width + sx) * 4;
    const light = (mask.pixels[i] * 0.2126 + mask.pixels[i + 1] * 0.7152 + mask.pixels[i + 2] * 0.0722) / 255;
    return (settings.polarity === 'light' ? light : 1 - light) * mask.pixels[i + 3] / 255;
}
function ValidateMask (mask)
{
    if (mask && (!Number.isInteger (mask.width) || !Number.isInteger (mask.height) || mask.width < 1 || mask.height < 1 || mask.width > 1024 || mask.height > 1024 || !(mask.pixels instanceof Uint8Array || mask.pixels instanceof Uint8ClampedArray) || mask.pixels.length !== mask.width * mask.height * 4)) { throw new Error ('Invalid RGBA impression mask.'); }
}

export function GenerateSpotVarnish (input, mask, baseRoughness = null, baseReflectivity = null, size = 512)
{
    const settings = ValidateSpotVarnish (input); ValidateMask (mask); ValidateMask (baseRoughness); ValidateMask (baseReflectivity);
    if (!mask) { throw new Error ('Choose a spot varnish mask.'); }
    if (!Number.isInteger (size) || size < 16 || size > 1024) { throw new Error ('Use a 16–1024 pixel varnish map.'); }
    const roughness = new Uint8Array (size * size * 3); const reflectivity = new Uint8Array (size * size * 3);
    const sample = (image, u, v, channel) => image ? image.pixels[(Math.min (image.height - 1, Math.floor (v * image.height)) * image.width + Math.min (image.width - 1, Math.floor (u * image.width))) * 4 + channel] : 255;
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        const u = x / size; const v = y / size; const coverage = settings.enabled ? MaskCoverage (mask, u, v, settings) : 0;
        for (let c = 0; c < 3; c++) {
            const i = (y * size + x) * 3 + c;
            roughness[i] = Math.round (sample (baseRoughness, u, v, c) * (1 - coverage) + 255 * (1 - settings.gloss) * coverage);
            reflectivity[i] = Math.round (sample (baseReflectivity, u, v, c) * (1 - coverage) + 255 * settings.reflectivity * coverage);
        }
    } }
    return { roughnessMap : EncodeRGBTexture ('spot-varnish-roughness.png', size, size, roughness), specularMap : EncodeRGBTexture ('spot-varnish-reflectivity.png', size, size, reflectivity), roughness, reflectivity, settings };
}

export function GenerateSurfaceRelief (input = {}, mask = null, size = 512)
{
    const settings = ValidateSurfaceRelief (input);
    if (!Number.isInteger (size) || size < 16 || size > 1024) { throw new Error ('Use a 16–1024 pixel relief map.'); }
    if (settings.impression !== 'off' && !mask) { throw new Error ('Choose an impression mask before enabling emboss or deboss.'); }
    ValidateMask (mask);
    const pixels = new Uint8Array (size * size * 3);
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        const u = x / size; const v = y / size;
        // Integer-frequency waves tile without seams. Amplitudes leave room for the die impression.
        const grain = Math.sin (2 * Math.PI * (73 * u + 37 * v)) * Math.sin (2 * Math.PI * (19 * u - 83 * v));
        const flute = Math.cos (2 * Math.PI * settings.cycles * (settings.direction === 'vertical' ? u : v));
        const impression = settings.impression === 'off' ? 0 : MaskCoverage (mask, u, v, settings) * (settings.impression === 'emboss' ? 1 : -1);
        const height = Math.round (128 + 12 * settings.grain * grain + 35 * settings.flute * flute + 65 * settings.impressionStrength * impression);
        pixels.fill (height, (y * size + x) * 3, (y * size + x + 1) * 3);
    } }
    return { map : EncodeRGBTexture ('corrugated-' + settings.impression + '-bump.png', size, size, pixels), settings, pixels, width : size, height : size };
}
