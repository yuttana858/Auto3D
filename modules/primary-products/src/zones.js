import { DefaultProductDraft, UpdateProductDraft } from './state.js';
export function GetArtworkZones (input)
{
    const d = UpdateProductDraft (DefaultProductDraft (), input);
    if (d.family === 'pouch') { return ['front', 'back'].map (id => ({ id, componentId : 'body', surface : 'pillow', widthMm : d.widthMm * 0.8, heightMm : d.heightMm * 0.8, bottomMm : d.heightMm * 0.1, distortionCompensation : false })); }
    const height = d.heightMm * (d.family === 'bottle' ? 0.55 : 0.82);
    const radius = d.diameterMm / 2;
    return ['front', 'back', 'wrap'].map (id => ({ id, componentId : 'body', surface : 'cylinder', radiusMm : radius,
        bottomMm : d.heightMm * 0.08, widthMm : id === 'wrap' ? Math.PI * d.diameterMm : Math.PI * d.diameterMm * 0.3,
        heightMm : height, startAngleRad : id === 'back' ? Math.PI : 0, seamAngleRad : Math.PI }));
}

