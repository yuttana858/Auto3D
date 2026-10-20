import { ValidateEngineering } from './engineering.js';
export const BoardCalipers = { Custom : null, 'E flute (nominal)' : 1.5, 'B flute (nominal)' : 3, 'C flute (nominal)' : 4, 'A flute (nominal)' : 4.8, 'EB flute (nominal)' : 4.5, 'BC flute (nominal)' : 7 };
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
        result.paths.push ({ id : path.id, type : path.type, closed : path.closed, points });
    }
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
    const layers = ['cut', 'score'].map ((type) => '<g id="' + type.toUpperCase () + '" fill="none" stroke="' + (type === 'cut' ? '#e34b4b' : '#318cdd') + '" stroke-width="0.2"' + (type === 'score' ? ' stroke-dasharray="3 2"' : '') + '>' + design.paths.filter ((path) => path.type === type).map ((path) => '<path d="' + path.points.map ((point, index) => (index ? 'L' : 'M') + point.map (format).join (' ')).join (' ') + (path.closed ? ' Z' : '') + '"/>').join ('') + '</g>').join ('');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + format (width) + 'mm" height="' + format (height) + 'mm" viewBox="' + [box.minX, -box.maxY, width, height].map (format).join (' ') + '"><g transform="scale(1,-1)">' + layers + '</g></svg>\n';
}
export function ExportPackagingDXF (data)
{
    const design = ValidatePackaging (data); if (!design.paths.length) { throw new Error ('Draw a path before exporting.'); }
    const pairs = []; const pair = (code, value) => pairs.push (String (code), String (value));
    pair (0, 'SECTION'); pair (2, 'HEADER'); pair (9, '$ACADVER'); pair (1, 'AC1015'); pair (9, '$INSUNITS'); pair (70, 4); pair (9, '$MEASUREMENT'); pair (70, 1); pair (0, 'ENDSEC'); pair (0, 'SECTION'); pair (2, 'TABLES'); pair (0, 'TABLE'); pair (2, 'LAYER'); pair (70, 2);
    for (const [layer, color] of [['CUT', 1], ['SCORE', 5]]) { pair (0, 'LAYER'); pair (2, layer); pair (70, 0); pair (62, color); pair (6, 'CONTINUOUS'); }
    pair (0, 'ENDTAB'); pair (0, 'ENDSEC'); pair (0, 'SECTION'); pair (2, 'ENTITIES');
    for (const path of design.paths) { pair (0, 'LWPOLYLINE'); pair (100, 'AcDbEntity'); pair (8, path.type.toUpperCase ()); pair (100, 'AcDbPolyline'); pair (90, path.points.length); pair (70, path.closed ? 1 : 0); for (const point of path.points) { pair (10, format (point[0])); pair (20, format (point[1])); } }
    pair (0, 'ENDSEC'); pair (0, 'EOF'); return pairs.join ('\r\n') + '\r\n';
}
