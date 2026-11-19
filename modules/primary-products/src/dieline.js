// Label dieline: the flat print template of a product label zone, at physical scale in millimetres, for the label
// designer's CAD or artwork tools. Built from the same zones (and real can construction) as the 3D label, so artwork
// designed on the dieline lands where it shows on the model.
//
//   x: along the label (around the product for wraps), 0 at the left trim edge; y: up, 0 at the bottom trim edge.
//   Trim (cut) is the finished label; bleed extends past it on every side; the safe area keeps copy away from the cut
//   and from the curvature at the seams; a wrap's glue overlap is a strip past the circumference that the label's
//   start covers. Printed (direct-decorated) beverage cans have no overlap: the wrap is exactly the circumference.
import { GetArtworkZones } from './zones.js';
import { DefaultProductDraft, UpdateProductDraft } from './state.js';
import { CanProfile } from './detailmesh.js';

export const DielineLimits = Object.freeze ({ bleedMm : [0, 20], safeMm : [0, 50], overlapMm : [0, 50] });

function Range (value, [low, high], name)
{
    if (!Number.isFinite (value) || value < low || value > high) { throw new Error (`${name} must be ${low}–${high} mm.`); }
    return value;
}

// Default glue overlap for a wrap: none on direct-printed (two-piece beverage) cans, 6 mm on paper or film wraps.
export function DefaultOverlapMm (draft, zone)
{
    if (zone !== 'wrap') { return 0; }
    if (draft.family === 'can' && (draft.details ? CanProfile (draft).style === 'beverage' : draft.material === 'aluminum')) { return 0; }
    return draft.family === 'bottle' || draft.family === 'can' ? 6 : 0;
}

export function LabelDieline (input, { zone, bleedMm = 3, safeMm = 3, overlapMm } = {})
{
    const draft = UpdateProductDraft (DefaultProductDraft (), input), zoneId = zone || draft.labelZone || 'front';
    const z = GetArtworkZones (draft).find (candidate => candidate.id === zoneId);
    if (!z) { throw new Error ('Choose a label zone of this product: ' + GetArtworkZones (draft).map (c => c.id).join (', ') + '.'); }
    const overlap = Range (overlapMm ?? DefaultOverlapMm (draft, zoneId), DielineLimits.overlapMm, 'Glue overlap'), bleed = Range (bleedMm, DielineLimits.bleedMm, 'Bleed'), safe = Range (safeMm, DielineLimits.safeMm, 'Safe margin');
    const visibleWidth = z.widthMm, width = visibleWidth + overlap, height = z.heightMm;
    if (2 * safe >= Math.min (visibleWidth, height)) { throw new Error ('The safe margin leaves no printable area on this label.'); }
    const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const layers = {
        BLEED : [{ closed : true, points : rect (-bleed, -bleed, width + bleed, height + bleed) }],
        TRIM : [{ closed : true, points : rect (0, 0, width, height) }],
        SAFE : [{ closed : true, points : rect (safe, safe, visibleWidth - safe, height - safe) }],
        OVERLAP : overlap > 0 ? [{ closed : true, points : rect (visibleWidth, 0, width, height) }] : [],
        // Centre of the label (the front of the product for a wrap) and, on wraps, the seam where the label meets itself.
        GUIDES : [{ closed : false, points : [[visibleWidth / 2, -bleed], [visibleWidth / 2, height + bleed]] }, ...(zoneId === 'wrap' ? [{ closed : false, points : [[visibleWidth, -bleed], [visibleWidth, height + bleed]] }] : [])]
    };
    const product = draft.family === 'can' && draft.details ? { ...draft, construction : CanProfile (draft).style } : draft;
    return {
        apiVersion : 1, units : 'mm', family : draft.family, zone : zoneId, surface : z.surface,
        trim : { widthMm : width, heightMm : height }, visibleWidthMm : visibleWidth, bleedMm : bleed, safeMm : safe, overlapMm : overlap,
        ...(z.radiusMm ? { radiusMm : z.radiusMm, circumferenceMm : 2 * Math.PI * z.radiusMm } : {}), ...(z.perimeterMm ? { perimeterMm : z.perimeterMm } : {}),
        // Where the trim sits on the product: its bottom edge height, and for wraps the seam angle (0 = the front).
        placement : { bottomMm : z.bottomMm, ...(z.seamAngleRad !== undefined && zoneId === 'wrap' ? { seamAngleRad : z.seamAngleRad } : {}) },
        artwork : { widthMm : visibleWidth, heightMm : height, bleedMm : bleed, note : 'Design to the bleed box; import the artwork with this bleed so the trim fills the label zone.' },
        product : { family : product.family, heightMm : draft.heightMm, ...(draft.diameterMm ? { diameterMm : draft.diameterMm } : {}), ...(draft.widthMm ? { widthMm : draft.widthMm } : {}), ...(product.construction ? { construction : product.construction } : {}) },
        layers
    };
}

const Format = value => Number (value.toFixed (4)).toString ();
const Escape = text => String (text).replace (/[<>&"]/g, c => ({ '<' : '&lt;', '>' : '&gt;', '&' : '&amp;', '"' : '&quot;' }[c]));
const Styles = { BLEED : '#00a0e0', TRIM : '#e34b4b', SAFE : '#39a96b', OVERLAP : '#c040c0', GUIDES : '#7a7a7a' };
const Notes = (d, name) => [
    `${name} — ${d.zone} label dieline (mm, 1:1)`,
    `Trim ${Format (d.trim.widthMm)} × ${Format (d.trim.heightMm)} mm` + (d.overlapMm ? ` (visible ${Format (d.visibleWidthMm)} + ${Format (d.overlapMm)} mm glue overlap)` : ''),
    `Bleed ${Format (d.bleedMm)} mm · safe ${Format (d.safeMm)} mm` + (d.radiusMm ? ` · on Ø ${Format (2 * d.radiusMm)} mm` : '') + ` · bottom ${Format (d.placement.bottomMm)} mm above the base`,
    d.artwork.note
];

// SVG at physical size: one group per layer (Illustrator / Inkscape layers), y up flipped to SVG's y down.
export function DielineSvg (d, { name = 'Label' } = {})
{
    const b = d.bleedMm, w = d.trim.widthMm + 2 * b, notes = Notes (d, name), noteHeight = 6 + 5 * notes.length, h = d.trim.heightMm + 2 * b + noteHeight;
    const path = p => '<path d="' + p.points.map ((q, i) => (i ? 'L' : 'M') + Format (q[0]) + ' ' + Format (-q[1])).join (' ') + (p.closed ? ' Z' : '') + '"/>';
    const groups = Object.entries (d.layers).filter (([, paths]) => paths.length).map (([layer, paths]) => '<g id="' + layer + '" inkscape:groupmode="layer" inkscape:label="' + layer + '" fill="' + (layer === 'OVERLAP' ? 'rgba(192,64,192,0.12)' : 'none') + '" stroke="' + Styles[layer] + '" stroke-width="0.25"' + (layer === 'SAFE' || layer === 'GUIDES' ? ' stroke-dasharray="2 1.5"' : '') + '>' + paths.map (path).join ('') + '</g>');
    const text = '<g id="NOTES" inkscape:groupmode="layer" inkscape:label="NOTES" font-family="sans-serif" font-size="3" fill="#333">' + notes.map ((line, i) => '<text x="' + Format (-b) + '" y="' + Format (b + 6 + 5 * i) + '">' + Escape (line) + '</text>').join ('') + '</g>';
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="' + Format (w) + 'mm" height="' + Format (h) + 'mm" viewBox="' + [-b, -(d.trim.heightMm + b), w, h].map (Format).join (' ') + '">' +
        '<title>' + Escape (name + ' ' + d.zone + ' label dieline') + '</title>' + groups.join ('') + text + '</svg>\n';
}

// DXF (AutoCAD 2000, millimetres): one layer per dieline layer, closed LWPOLYLINEs, notes as TEXT on NOTES.
export function DielineDxf (d, { name = 'Label' } = {})
{
    const pairs = [], pair = (code, value) => pairs.push (String (code), String (value)), layers = Object.keys (d.layers).filter (l => d.layers[l].length).concat ('NOTES');
    const colour = { BLEED : 4, TRIM : 1, SAFE : 3, OVERLAP : 6, GUIDES : 8, NOTES : 7 };
    pair (0, 'SECTION'); pair (2, 'HEADER'); pair (9, '$ACADVER'); pair (1, 'AC1015'); pair (9, '$INSUNITS'); pair (70, 4); pair (9, '$MEASUREMENT'); pair (70, 1); pair (0, 'ENDSEC');
    pair (0, 'SECTION'); pair (2, 'TABLES'); pair (0, 'TABLE'); pair (2, 'LAYER'); pair (70, layers.length);
    for (const layer of layers) { pair (0, 'LAYER'); pair (2, layer); pair (70, 0); pair (62, colour[layer]); pair (6, layer === 'SAFE' || layer === 'GUIDES' ? 'DASHED' : 'CONTINUOUS'); }
    pair (0, 'ENDTAB'); pair (0, 'ENDSEC'); pair (0, 'SECTION'); pair (2, 'ENTITIES');
    for (const layer of layers.filter (l => l !== 'NOTES')) {
        for (const p of d.layers[layer]) { pair (0, 'LWPOLYLINE'); pair (100, 'AcDbEntity'); pair (8, layer); pair (100, 'AcDbPolyline'); pair (90, p.points.length); pair (70, p.closed ? 1 : 0); for (const [x, y] of p.points) { pair (10, Format (x)); pair (20, Format (y)); } }
    }
    Notes (d, name).forEach ((line, i) => { pair (0, 'TEXT'); pair (100, 'AcDbEntity'); pair (8, 'NOTES'); pair (100, 'AcDbText'); pair (10, Format (-d.bleedMm)); pair (20, Format (-d.bleedMm - 6 - 5 * i)); pair (30, 0); pair (40, 3); pair (1, line.replace (/[^\x20-\x7e]/g, c => c === '×' ? 'x' : c === '—' ? '-' : c === '·' ? '|' : c === 'Ø' ? 'D' : '?')); pair (100, 'AcDbText'); });
    pair (0, 'ENDSEC'); pair (0, 'EOF');
    return pairs.join ('\r\n') + '\r\n';
}
