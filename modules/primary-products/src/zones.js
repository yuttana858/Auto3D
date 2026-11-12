import { StandUpTopSeal } from './pouch.js';
import { DefaultProductDraft, UpdateProductDraft, BottleShape } from './state.js';
import { BottleSectionOf, SectionPerimeter } from './section.js';
export function GetArtworkZones (input)
{
    const d = UpdateProductDraft (DefaultProductDraft (), input);
    if (d.family === 'clamshell') { return ['front', 'back'].map (id => ({ id, componentId : id === 'front' ? 'lid' : 'base', surface : 'plane', widthMm : d.widthMm*.8, heightMm : d.depthMm*.8, bottomMm : 0 })); }
    if (d.family === 'pouch' && d.pouchShape) {
        // Stand-up panel: above the gusset fold and below the top seal band.
        const bottom = d.pouchShape.gussetMm + d.heightMm * .03, top = d.heightMm * (1 - StandUpTopSeal - .03);
        return ['front', 'back'].map (id => ({ id, componentId : 'body', surface : 'pillow', widthMm : d.widthMm * 0.8, heightMm : Math.max (1, top - bottom), bottomMm : bottom, distortionCompensation : false }));
    }
    if (d.family === 'pouch') { return ['front', 'back'].map (id => ({ id, componentId : 'body', surface : 'pillow', widthMm : d.widthMm * 0.8, heightMm : d.heightMm * 0.8, bottomMm : d.heightMm * 0.1, distortionCompensation : false })); }
    const shape = d.family === 'bottle' ? BottleShape (d) : null, bodyHeight = shape ? d.heightMm - shape.shoulderHeightMm - shape.neckHeightMm - shape.capHeightMm : d.heightMm;
    const bottom = Math.min (d.heightMm * .08, bodyHeight * .2), height = Math.min (d.heightMm * (shape ? .55 : .82), bodyHeight - bottom - d.heightMm * .01);
    const radius = d.diameterMm / 2, section = d.family === 'bottle' ? BottleSectionOf (d) : null;
    if (section && section.shape !== 'round') {
        // Oval/rectangular bodies: labels follow the outline by arc length. Front/back panels span the flat or gently
        // curved face (the rectangle's straight front, or 30% of the oval perimeter); a wrap uses the whole perimeter.
        const perimeter = SectionPerimeter (section), face = section.shape === 'rectangle' ? Math.max (2 * (section.widthMm / 2 - section.cornerRadiusMm) + Math.PI * section.cornerRadiusMm * .5, 1) : perimeter * .3;
        return ['front', 'back', 'wrap'].map (id => ({ id, componentId : 'body', surface : 'section', bottomMm : bottom, widthMm : id === 'wrap' ? perimeter : face, heightMm : height, perimeterMm : perimeter }));
    }
    return ['front', 'back', 'wrap'].map (id => ({ id, componentId : 'body', surface : 'cylinder', radiusMm : radius,
        bottomMm : bottom, widthMm : id === 'wrap' ? Math.PI * d.diameterMm : Math.PI * d.diameterMm * 0.3,
        heightMm : height, startAngleRad : id === 'back' ? Math.PI : 0, seamAngleRad : Math.PI }));
}

