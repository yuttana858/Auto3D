import { DefaultProductDraft, UpdateProductDraft, BottleShape } from './state.js';
export function GetArtworkZones (input)
{
    const d = UpdateProductDraft (DefaultProductDraft (), input);
    if (d.family === 'clamshell') { return ['front', 'back'].map (id => ({ id, componentId : id === 'front' ? 'lid' : 'base', surface : 'plane', widthMm : d.widthMm*.8, heightMm : d.depthMm*.8, bottomMm : 0 })); }
    if (d.family === 'pouch') { return ['front', 'back'].map (id => ({ id, componentId : 'body', surface : 'pillow', widthMm : d.widthMm * 0.8, heightMm : d.heightMm * 0.8, bottomMm : d.heightMm * 0.1, distortionCompensation : false })); }
    const shape = d.family === 'bottle' ? BottleShape (d) : null, bodyHeight = shape ? d.heightMm - shape.shoulderHeightMm - shape.neckHeightMm - shape.capHeightMm : d.heightMm;
    const bottom = Math.min (d.heightMm * .08, bodyHeight * .2), height = Math.min (d.heightMm * (shape ? .55 : .82), bodyHeight - bottom - d.heightMm * .01);
    const radius = d.diameterMm / 2;
    return ['front', 'back', 'wrap'].map (id => ({ id, componentId : 'body', surface : 'cylinder', radiusMm : radius,
        bottomMm : bottom, widthMm : id === 'wrap' ? Math.PI * d.diameterMm : Math.PI * d.diameterMm * 0.3,
        heightMm : height, startAngleRad : id === 'back' ? Math.PI : 0, seamAngleRad : Math.PI }));
}

