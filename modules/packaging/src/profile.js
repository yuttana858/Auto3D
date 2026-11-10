import { ValidateBoardAppearance } from './appearancesettings.js';
import { ValidateEngineering } from './engineering.js';
export const BoardCalipers = { Custom : null, 'E flute (nominal)' : 1.5, 'B flute (nominal)' : 3, 'C flute (nominal)' : 4, 'A flute (nominal)' : 4.8, 'EB flute (nominal)' : 4.5, 'BC flute (nominal)' : 7, 'ACA flute (nominal)' : 13.6, 'BCB flute (nominal)' : 10 };
export function NewPackagingDesign () { return { version : 1, name : 'Packaging profile', grade : 'Custom', thickness : 3, paths : [] }; }
const epsilon = 1e-7;
const same = (a, b) => Math.hypot (a[0] - b[0], a[1] - b[1]) < epsilon;
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function OnSegment (a, b, p) { return Math.abs (cross (a, b, p)) < epsilon && p[0] >= Math.min (a[0], b[0]) - epsilon && p[0] <= Math.max (a[0], b[0]) + epsilon && p[1] >= Math.min (a[1], b[1]) - epsilon && p[1] <= Math.max (a[1], b[1]) + epsilon; }
function Intersect (a, b, c, d)
{
    return (cross (a, b, c) * cross (a, b, d) < 0 && cross (c, d, a) * cross (c, d, b) < 0) || OnSegment (a, b, c) || OnSegment (a, b, d) || OnSegment (c, d, a) || OnSegment (c, d, b);
}
function Inside (p, polygon)
{
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i]; const b = polygon[j];
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) { inside = !inside; }
    }
    return inside;
}
export function ValidatePackaging (data)
{
    if (!data || data.version !== 1 || !Array.isArray (data.paths) || data.paths.length > 100 || typeof data.name !== 'string' || typeof data.grade !== 'string' || !Number.isFinite (data.thickness) || data.thickness <= 0 || data.thickness > 100) { throw new Error ('Invalid packaging design or board thickness (0–100 mm).'); }
    const result = { version : 1, name : data.name.slice (0, 100), grade : data.grade.slice (0, 100), thickness : data.thickness, paths : [] }; const ids = new Set (); let count = 0;
    for (const path of data.paths) {
        if (!path || typeof path.id !== 'string' || !path.id || path.id.length > 100 || ids.has (path.id) || !['cut', 'score'].includes (path.type) || typeof path.closed !== 'boolean' || !Array.isArray (path.points)) { throw new Error ('Invalid packaging path.'); }
        ids.add (path.id); const points = path.points.map ((point) => {
            if (!Array.isArray (point) || point.length !== 2 || !point.every ((value) => Number.isFinite (value) && Math.abs (value) <= 100000)) { throw new Error ('Use finite X/Y points within ±100000 mm.'); } return [...point];
        });
        if (path.closed && points.length > 1 && same (points[0], points[points.length - 1])) { points.pop (); }
        count += points.length;
        if (count > 2000 || points.length < (path.closed ? 3 : 2) || points.some ((point, index) => index > 0 && same (point, points[index - 1]))) { throw new Error ('A path needs distinct points: 2 for a line, 3 for a closed outline; maximum 2000 points per design.'); }
        const normalized = { id : path.id, type : path.type, closed : path.closed, points };
        if (path.process !== undefined) {
            const process = path.process;
            if (path.type !== 'score' || !process || typeof process !== 'object' || Array.isArray (process) || Object.keys (process).some (key => !['kind', 'cutMm', 'tieMm'].includes (key)) || !['crease', 'reverse-crease', 'perforation', 'crease-perforation'].includes (process.kind)) { throw new Error ('Invalid crease/perforation specification.'); }
            normalized.process = { kind : process.kind };
            if (process.kind.includes ('perforation')) {
                for (const key of ['cutMm', 'tieMm']) { if (!Number.isFinite (process[key]) || process[key] < 0.01 || process[key] > 1000) { throw new Error ('Perforation cut and tie must be 0.01–1000 mm.'); } normalized.process[key] = process[key]; }
            } else if (process.cutMm !== undefined || process.tieMm !== undefined) { throw new Error ('Cut/tie lengths apply only to perforations.'); }
        }
        result.paths.push (normalized);
    }
    if (data.appearance !== undefined) { result.appearance = ValidateBoardAppearance (data.appearance); }
    if (data.engineering !== undefined) { result.engineering = ValidateEngineering (data.engineering, result.paths); if (result.engineering.materials.find (m => m.id === result.engineering.activeMaterialId).caliperMm !== result.thickness) { throw new Error ('Active material caliper must match CAD board thickness.'); } }
    return result;
}
export function PackagingContours (data)
{
    const design = ValidatePackaging (data); const contours = design.paths.filter ((path) => path.type === 'cut');
    if (!contours.length || contours.some ((path) => !path.closed)) { throw new Error ('Extrusion needs closed cut outlines. Close or remove open cut paths; internal creases should be score paths.'); }
    for (const path of contours) {
        const points = path.points; let area = 0;
        for (let i = 0; i < points.length; i++) {
            const a = points[i]; const b = points[(i + 1) % points.length]; area += a[0] * b[1] - b[0] * a[1];
            for (let j = i + 1; j < points.length; j++) {
                if (j === i + 1 || (i === 0 && j === points.length - 1)) { continue; }
                if (Intersect (a, b, points[j], points[(j + 1) % points.length])) { throw new Error ('Cut outlines must not cross or touch themselves.'); }
            }
        }
        if (Math.abs (area) < epsilon) { throw new Error ('Cut outlines must enclose an area.'); }
    }
    for (let i = 0; i < contours.length; i++) {
        for (let j = i + 1; j < contours.length; j++) {
            const a = contours[i].points; const b = contours[j].points;
            for (let x = 0; x < a.length; x++) { for (let y = 0; y < b.length; y++) { if (Intersect (a[x], a[(x + 1) % a.length], b[y], b[(y + 1) % b.length])) { throw new Error ('Separate cut outlines must not intersect or touch.'); } } }
        }
    }
    // Even/odd containment supports holes and islands without a winding convention.
    const depth = contours.map ((path) => contours.filter ((other) => other !== path && Inside (path.points[0], other.points)).length);
    return contours.flatMap ((path, index) => depth[index] % 2 ? [] : [{ outer : path.points, holes : contours.filter ((other, j) => depth[j] === depth[index] + 1 && Inside (other.points[0], path.points)).map ((other) => other.points) }]);
}
export function PackagingBounds (design)
{
    const points = design.paths.flatMap ((path) => path.points); if (!points.length) { return { minX : 0, minY : 0, maxX : 300, maxY : 200 }; }
    return { minX : Math.min (...points.map ((p) => p[0])), minY : Math.min (...points.map ((p) => p[1])), maxX : Math.max (...points.map ((p) => p[0])), maxY : Math.max (...points.map ((p) => p[1])) };
}
const format = (value) => Number (value.toFixed (6)).toString ();
export function ExportPackagingSVG (data)
{
    const design = ValidatePackaging (data); if (!design.paths.length) { throw new Error ('Draw a path before exporting.'); } const box = PackagingBounds (design); const width = Math.max (box.maxX - box.minX, 0.2); const height = Math.max (box.maxY - box.minY, 0.2);
    const layerOf = path => path.process?.kind && path.process.kind !== 'crease' ? path.process.kind.replaceAll ('-', '_') : path.type;
    const layers = [...new Set (['cut', 'score', ...design.paths.map (layerOf)])].map ((type) => '<g id="' + type.toUpperCase () + '" fill="none" stroke="' + (type === 'cut' ? '#e34b4b' : type.includes ('perforation') ? '#39a96b' : '#318cdd') + '" stroke-width="0.2"' + (type === 'score' ? ' stroke-dasharray="3 2"' : '') + '>' + design.paths.filter ((path) => layerOf (path) === type).map ((path) => '<path' + (path.process ? ' data-process="' + path.process.kind + '"' + (path.process.cutMm !== undefined ? ' data-cut-mm="' + path.process.cutMm + '" data-tie-mm="' + path.process.tieMm + '" stroke-dasharray="' + path.process.cutMm + ' ' + path.process.tieMm + '"' : '') : '') + ' d="' + path.points.map ((point, index) => (index ? 'L' : 'M') + point.map (format).join (' ')).join (' ') + (path.closed ? ' Z' : '') + '"/>').join ('') + '</g>').join ('');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + format (width) + 'mm" height="' + format (height) + 'mm" viewBox="' + [box.minX, -box.maxY, width, height].map (format).join (' ') + '"><g transform="scale(1,-1)">' + layers + '</g></svg>\n';
}
export function ExportPackagingDXF (data)
{
    const design = ValidatePackaging (data); if (!design.paths.length) { throw new Error ('Draw a path before exporting.'); }
    const pairs = []; const pair = (code, value) => pairs.push (String (code), String (value));
    pair (0, 'SECTION'); pair (2, 'HEADER'); pair (9, '$ACADVER'); pair (1, 'AC1015'); pair (9, '$INSUNITS'); pair (70, 4); pair (9, '$MEASUREMENT'); pair (70, 1); pair (0, 'ENDSEC'); pair (0, 'SECTION'); pair (2, 'TABLES'); pair (0, 'TABLE'); pair (2, 'LAYER'); const layerOf = path => path.process?.kind && path.process.kind !== 'crease' ? path.process.kind.replaceAll ('-', '_').toUpperCase () : path.type.toUpperCase (); const layers = [...new Set (['CUT', 'SCORE', ...design.paths.map (layerOf)])]; pair (70, layers.length);
    for (const layer of layers) { pair (0, 'LAYER'); pair (2, layer); pair (70, 0); pair (62, layer === 'CUT' ? 1 : layer.includes ('PERFORATION') ? 3 : 5); pair (6, 'CONTINUOUS'); }
    pair (0, 'ENDTAB'); pair (0, 'ENDSEC'); pair (0, 'SECTION'); pair (2, 'ENTITIES');
    for (const path of design.paths) { if (path.process?.cutMm !== undefined) { pair (999, 'PERFORATION cut=' + path.process.cutMm + 'mm tie=' + path.process.tieMm + 'mm'); } pair (0, 'LWPOLYLINE'); pair (100, 'AcDbEntity'); pair (8, layerOf (path)); pair (100, 'AcDbPolyline'); pair (90, path.points.length); pair (70, path.closed ? 1 : 0); for (const point of path.points) { pair (10, format (point[0])); pair (20, format (point[1])); } }
    pair (0, 'ENDSEC'); pair (0, 'EOF'); return pairs.join ('\r\n') + '\r\n';
}

// EPS uses PostScript points (72 per inch), with paths authored in millimetres.
// DSC comments identify process groups; EPS does not provide portable CAD layers.
export function ExportPackagingEPS (data)
{
    const design = ValidatePackaging (data); if (!design.paths.length) { throw new Error ('Draw a path before exporting.'); }
    const box = PackagingBounds (design), pointsPerMm = 72 / 25.4, pad = 1;
    const width = Math.max (box.maxX - box.minX, 0), height = Math.max (box.maxY - box.minY, 0);
    const layerOf = path => path.process?.kind && path.process.kind !== 'crease' ? path.process.kind.replaceAll ('-', '_').toUpperCase () : path.type.toUpperCase ();
    const layers = [...new Set (['CUT', 'SCORE', ...design.paths.map (layerOf)])];
    const output = ['%!PS-Adobe-3.0 EPSF-3.0', '%%BoundingBox: 0 0 ' + Math.ceil (width * pointsPerMm + 2 * pad) + ' ' + Math.ceil (height * pointsPerMm + 2 * pad), '%%HiResBoundingBox: 0 0 ' + format (width * pointsPerMm + 2 * pad) + ' ' + format (height * pointsPerMm + 2 * pad), '%%Creator: Auto3D', '%%EndComments', 'gsave', pad + ' ' + pad + ' translate', '72 25.4 div dup scale', format (-box.minX) + ' ' + format (-box.minY) + ' translate', '0.2 setlinewidth'];
    for (const layer of layers) {
        const paths = design.paths.filter (path => layerOf (path) === layer); if (!paths.length) { continue; }
        output.push ('%%BeginAuto3DProcess: ' + layer, layer === 'CUT' ? '0.89 0.29 0.29 setrgbcolor' : layer.includes ('PERFORATION') ? '0.22 0.66 0.42 setrgbcolor' : '0.19 0.55 0.87 setrgbcolor');
        for (const path of paths) {
            output.push (path.process?.cutMm !== undefined ? '[' + format (path.process.cutMm) + ' ' + format (path.process.tieMm) + '] 0 setdash' : path.type === 'score' ? '[3 2] 0 setdash' : '[] 0 setdash', 'newpath');
            path.points.forEach ((point, i) => output.push (format (point[0]) + ' ' + format (point[1]) + (i ? ' lineto' : ' moveto'))); if (path.closed) { output.push ('closepath'); } output.push ('stroke');
        }
        output.push ('%%EndAuto3DProcess');
    }
    output.push ('grestore', '%%EOF'); return output.join ('\n') + '\n';
}
