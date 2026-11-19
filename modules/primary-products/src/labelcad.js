// Portable label CAD uses the shared millimetre path contract without depending
// on the host or the Packaging package. Artwork and cut lines remain editable.
const paint = value => value === 'none' || typeof value === 'string' && /^#[a-fA-F0-9]{6}$/.test (value);
export function ValidateLabelCAD (input)
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (key => !['version', 'widthMm', 'heightMm', 'paths', 'vectorized'].includes (key)) || input.version !== 1 || !Number.isFinite (input.widthMm) || !Number.isFinite (input.heightMm) || input.widthMm < 1 || input.heightMm < 1 || input.widthMm > 2000 || input.heightMm > 1000 || !Array.isArray (input.paths) || input.paths.length > 100 || typeof input.vectorized !== 'boolean') { throw new Error ('Invalid label CAD profile.'); }
    const ids = new Set (); let count = 0;
    const paths = input.paths.map (path => {
        if (!path || typeof path !== 'object' || Array.isArray (path) || Object.keys (path).some (key => !['id', 'type', 'closed', 'points', 'fill', 'stroke', 'strokeWidth'].includes (key)) || typeof path.id !== 'string' || !path.id || path.id.length > 100 || ids.has (path.id) || !['cut', 'artwork'].includes (path.type) || typeof path.closed !== 'boolean' || !Array.isArray (path.points) || path.points.length < (path.closed ? 3 : 2) || path.type === 'cut' && !path.closed) { throw new Error ('Label CAD needs closed cut outlines and valid artwork paths.'); }
        ids.add (path.id); count += path.points.length; if (count > 2000) { throw new Error ('Use up to 2000 label CAD points.'); }
        const points = path.points.map (point => {
            if (!Array.isArray (point) || point.length !== 2 || !point.every (Number.isFinite) || Math.abs (point[0]) > input.widthMm / 2 + 1e-7 || Math.abs (point[1]) > input.heightMm / 2 + 1e-7) { throw new Error ('Keep CAD paths within the physical label sheet.'); }
            return [...point];
        });
        if (points.some ((point, index) => index > 0 && Math.hypot (point[0] - points[index - 1][0], point[1] - points[index - 1][1]) < 1e-7)) { throw new Error ('Use distinct label path points.'); }
        const normalized = { id : path.id, type : path.type, closed : path.closed, points };
        if (path.type === 'artwork') {
            const fill = path.fill ?? (path.closed ? '#123740' : 'none'), stroke = path.stroke ?? (path.closed ? 'none' : '#123740'), strokeWidth = path.strokeWidth ?? .2;
            if (!paint (fill) || !paint (stroke) || !Number.isFinite (strokeWidth) || strokeWidth < 0 || strokeWidth > 100) { throw new Error ('Use solid hex colors and a valid artwork stroke width.'); }
            Object.assign (normalized, { fill, stroke, strokeWidth });
        } else if (path.fill !== undefined || path.stroke !== undefined || path.strokeWidth !== undefined) { throw new Error ('Cut paths cannot carry artwork styling.'); }
        return normalized;
    });
    if (!paths.some (path => path.type === 'cut')) { throw new Error ('Keep at least one closed label cut outline.'); }
    return { version : 1, widthMm : input.widthMm, heightMm : input.heightMm, vectorized : input.vectorized, paths };
}
export function NewLabelCAD (widthMm, heightMm, circular = false)
{
    const points = circular ? Array.from ({ length : 64 }, (_, i) => [Math.cos (i * Math.PI / 32) * widthMm / 2, Math.sin (i * Math.PI / 32) * heightMm / 2]) : [[-widthMm / 2, -heightMm / 2], [widthMm / 2, -heightMm / 2], [widthMm / 2, heightMm / 2], [-widthMm / 2, heightMm / 2]];
    return ValidateLabelCAD ({ version : 1, widthMm, heightMm, vectorized : false, paths : [{ id : 'label-cut', type : 'cut', closed : true, points }] });
}
export function ScaleLabelCAD (input, widthMm, heightMm)
{
    const cad = ValidateLabelCAD (input), x = widthMm / cad.widthMm, y = heightMm / cad.heightMm;
    return ValidateLabelCAD ({ ...cad, widthMm, heightMm, paths : cad.paths.map (path => ({ ...path, points : path.points.map (point => [point[0] * x, point[1] * y]), ...(path.strokeWidth !== undefined ? { strokeWidth : path.strokeWidth * Math.min (x, y) } : {}) })) });
}
export function LabelCADSVG (input)
{
    const cad = ValidateLabelCAD (input), n = value => String (Number (value.toFixed (5))), d = path => path.points.map ((point, index) => (index ? 'L' : 'M') + point.map (n).join (' ')).join (' ') + (path.closed ? 'Z' : '');
    const clip = cad.paths.filter (path => path.type === 'cut').map (d).join (' ');
    const artwork = cad.paths.filter (path => path.type === 'artwork').map (path => `<path d="${d (path)}" fill="${path.fill}" stroke="${path.stroke}" stroke-width="${n (path.strokeWidth)}"/>`).join ('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n (-cad.widthMm / 2)} ${n (-cad.heightMm / 2)} ${n (cad.widthMm)} ${n (cad.heightMm)}"><defs><clipPath id="label-cut"><path d="${clip}" fill-rule="evenodd" clip-rule="evenodd"/></clipPath></defs><g transform="scale(1,-1)" clip-path="url(#label-cut)">${artwork}</g></svg>`;
}
