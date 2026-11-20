import { CanProfile } from './detailmesh.js';
import { BottleCap } from './bottleconstruction.js';
import { PouchPanel } from './pouch.js';
import { DefaultProductDraft, UpdateProductDraft, BottleShape } from './state.js';
import { BottleSectionOf, SectionPerimeter } from './section.js';
export function GetArtworkZones (input)
{
    const d = UpdateProductDraft (DefaultProductDraft (), input);
    if (d.family === 'clamshell') { return ['front', 'back'].map (id => ({ id, componentId : id === 'front' ? 'lid' : 'base', surface : 'plane', widthMm : d.widthMm*.8, heightMm : d.depthMm*.8, bottomMm : 0 })); }
    if (d.family === 'pouch') { const panel = PouchPanel (d); return ['front', 'back'].map (id => ({ id, componentId : 'body', surface : 'pillow', widthMm : d.widthMm * 0.8, heightMm : panel.heightMm, bottomMm : panel.bottomMm, distortionCompensation : false })); }
    if (d.family === 'can' && d.details) {
        // Real can construction: the printed wall between the tapered base and the neck (two-piece), or between the
        // seams (three-piece), on the body radius.
        const can = CanProfile (d), radius = can.bodyRadius;
        return ['front', 'back', 'wrap'].map (id => ({ id, componentId : 'body', surface : 'cylinder', radiusMm : radius, bottomMm : can.labelBottomMm, widthMm : id === 'wrap' ? 2 * Math.PI * radius : 2 * Math.PI * radius * 0.3, heightMm : can.labelHeightMm, startAngleRad : id === 'back' ? Math.PI : 0, seamAngleRad : Math.PI }));
    }
    const cap = d.family === 'bottle' ? BottleCap (d) : null, capZones = cap ? [{ id : 'cap-top', componentId : 'cap', surface : 'disc', radiusMm : cap.topRadiusMm, topMm : d.heightMm, bottomMm : d.heightMm, widthMm : cap.topRadiusMm * 2, heightMm : cap.topRadiusMm * 2 }] : [];
    const shape = d.family === 'bottle' ? BottleShape (d) : null, bodyHeight = shape ? d.heightMm - shape.shoulderHeightMm - shape.neckHeightMm - shape.capHeightMm : d.heightMm;
    const bottom = Math.min (d.heightMm * .08, bodyHeight * .2), height = Math.min (d.heightMm * (shape ? .55 : .82), bodyHeight - bottom - d.heightMm * .01);
    const radius = d.diameterMm / 2, section = d.family === 'bottle' ? BottleSectionOf (d) : null;
    if (section && section.shape !== 'round') {
        // Oval/rectangular bodies: labels follow the outline by arc length. Front/back panels span the flat or gently
        // curved face (the rectangle's straight front, or 30% of the oval perimeter); a wrap uses the whole perimeter.
        const perimeter = SectionPerimeter (section), face = section.shape === 'rectangle' ? Math.max (2 * (section.widthMm / 2 - section.cornerRadiusMm) + Math.PI * section.cornerRadiusMm * .5, 1) : perimeter * .3;
        return ['front', 'back', 'wrap'].map (id => ({ id, componentId : 'body', surface : 'section', bottomMm : bottom, widthMm : id === 'wrap' ? perimeter : face, heightMm : height, perimeterMm : perimeter })).concat (capZones);
    }
    return ['front', 'back', 'wrap'].map (id => ({ id, componentId : 'body', surface : 'cylinder', radiusMm : radius,
        bottomMm : bottom, widthMm : id === 'wrap' ? Math.PI * d.diameterMm : Math.PI * d.diameterMm * 0.3,
        heightMm : height, startAngleRad : id === 'back' ? Math.PI : 0, seamAngleRad : Math.PI })).concat (capZones);
}

