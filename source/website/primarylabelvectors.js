import { SanitizeLabelSVG } from './primarylabelrenderer.js';
import { ArtworkImageInfo } from '../../modules/primary-products/src/imageinfo.js';

const maxPaths = 80, maxPoints = 1800, toleranceMm = 0.025;
const geometryTags = new Set (['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const fallback = reason => ({ paths : [], unsupported : true, vectorized : false, reason });
const distance = (a, b) => Math.hypot (a[0] - b[0], a[1] - b[1]);

// A bounded approximation for the shared point editor. Unsupported SVG semantics
// retain their original editable SVG/raster rather than silently losing artwork.
export function ExtractLabelVectors (input, widthMm, heightMm)
{
    if (![widthMm, heightMm].every (value => Number.isFinite (value) && value >= 1 && value <= 10000)) { throw new Error ('Use finite physical label dimensions between 1 and 10000 mm.'); }
    const svg = SanitizeLabelSVG (input), doc = new DOMParser ().parseFromString (svg, 'image/svg+xml'), root = doc.documentElement;
    const elements = [root, ...root.querySelectorAll ('*')];
    if (elements.some (element => !['svg', 'g', 'title', 'desc', ...geometryTags].includes (element.localName))) { return fallback ('Text, gradients and clipping remain in the original editable artwork.'); }
    if (root.hasAttribute ('transform') || root.querySelector ('svg') || elements.some (element => element.hasAttribute ('clip-path') || [...element.attributes].some (attribute => /url\s*\(/i.test (attribute.value)))) { return fallback ('Viewport transforms, nested viewports and referenced paint remain in the original artwork.'); }
    const shapes = elements.filter (element => geometryTags.has (element.localName));
    if (!shapes.length || shapes.length > maxPaths) { return fallback ('The artwork needs between 1 and 80 editable vector paths.'); }
    // Multiple subpaths can describe holes or disjoint contours. A single CAD
    // polyline cannot preserve their fill rule, so keep that source untouched.
    if (shapes.some (element => element.localName === 'path' && (element.getAttribute ('d')?.match (/[mM]/g)?.length || 0) !== 1)) { return fallback ('Compound paths remain in the original artwork to preserve holes and fill rules.'); }
    const mount = document.createElement ('div');
    Object.assign (mount.style, { position : 'fixed', left : '-100000px', top : '-100000px', width : '0', height : '0', overflow : 'hidden', visibility : 'hidden', pointerEvents : 'none' });
    // Shadow isolation prevents application CSS changing the imported geometry.
    mount.attachShadow ({ mode : 'closed' }).appendChild (root); (document.body || document.documentElement).appendChild (mount);
    try {
        const box = root.viewBox.baseVal, inverse = root.getCTM ()?.inverse ();
        if (!inverse) { return fallback ('The artwork transform could not be resolved.'); }
        const paintContext = document.createElement ('canvas').getContext ('2d'), paths = []; let count = 0;
        const color = value => {
            if (value === 'none') { return 'none'; }
            paintContext.fillStyle = '#010203'; paintContext.fillStyle = value; const first = paintContext.fillStyle;
            paintContext.fillStyle = '#040506'; paintContext.fillStyle = value;
            return first === paintContext.fillStyle && /^#[a-f0-9]{6}$/i.test (first) ? first.toLowerCase () : null;
        };
        for (const element of shapes) {
            const style = getComputedStyle (element), transform = element.getCTM ();
            if (!transform) { return fallback ('The artwork transform could not be resolved.'); }
            const matrix = inverse.multiply (transform);
            let ancestor = element;
            while (ancestor && ancestor !== mount) {
                if (ancestor.nodeType === 1 && Number (getComputedStyle (ancestor).opacity) !== 1) { return fallback ('Transparency remains in the original artwork.'); }
                ancestor = ancestor.parentElement;
            }
            const fill = color (style.fill), stroke = color (style.stroke);
            if (fill === null || stroke === null || style.fillRule !== 'nonzero' || Number (style.fillOpacity) !== 1 || Number (style.strokeOpacity) !== 1 || style.strokeDasharray !== 'none' || stroke !== 'none' && (style.strokeLinecap !== 'butt' || style.strokeLinejoin !== 'miter')) { return fallback ('Special paint and stroke styles remain in the original artwork.'); }
            const toMM = (x, y) => { const point = root.createSVGPoint (); point.x = x; point.y = y; const transformed = point.matrixTransform (matrix); return [(transformed.x - box.x) / box.width * widthMm - widthMm / 2, heightMm / 2 - (transformed.y - box.y) / box.height * heightMm]; };
            const sx = Math.hypot (matrix.a * widthMm / box.width, matrix.b * heightMm / box.height), sy = Math.hypot (matrix.c * widthMm / box.width, matrix.d * heightMm / box.height);
            const skew = (matrix.a * matrix.c * widthMm ** 2 / box.width ** 2 + matrix.b * matrix.d * heightMm ** 2 / box.height ** 2);
            if (stroke !== 'none' && (Math.abs (sx - sy) > 1e-6 * Math.max (sx, sy, 1) || Math.abs (skew) > 1e-6 * Math.max (sx * sy, 1))) { return fallback ('Nonuniform stroke transforms remain in the original artwork.'); }
            const strokeWidth = stroke === 'none' ? 0 : parseFloat (style.strokeWidth) * sx;
            if (!Number.isFinite (strokeWidth) || strokeWidth < 0 || strokeWidth > 10000) { return fallback ('The stroke width exceeds editable vector limits.'); }
            const local = (x, y) => toMM (x, y), number = name => element[name].baseVal.value;
            let points, closed = !['line', 'polyline'].includes (element.localName);
            if (element.localName === 'line') { points = [local (number ('x1'), number ('y1')), local (number ('x2'), number ('y2'))]; }
            else if (['polyline', 'polygon'].includes (element.localName)) { points = Array.from ({ length : element.points.numberOfItems }, (_, index) => { const point = element.points.getItem (index); return local (point.x, point.y); }); }
            else if (element.localName === 'rect' && !number ('rx') && !number ('ry')) {
                const x = number ('x'), y = number ('y'), w = number ('width'), h = number ('height'); points = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map (point => local (...point));
            } else {
                const length = element.getTotalLength ();
                if (!Number.isFinite (length) || length <= 0) { return fallback ('A vector path has no finite length.'); }
                const at = position => { const point = element.getPointAtLength (position); return local (point.x, point.y); };
                points = [at (0)]; let overflow = false;
                const segment = (start, end, a, b, depth) => {
                    if (points.length + count >= maxPoints) { overflow = true; return; }
                    const midpoint = (start + end) / 2, m = at (midpoint), chord = distance (a, b), deviation = chord ? Math.abs ((b[0] - a[0]) * (a[1] - m[1]) - (a[0] - m[0]) * (b[1] - a[1])) / chord : distance (a, m);
                    if (depth < 10 && (deviation > toleranceMm || distance (a, m) + distance (m, b) - chord > toleranceMm)) { segment (start, midpoint, a, m, depth + 1); if (!overflow) { segment (midpoint, end, m, b, depth + 1); } }
                    else { points.push (b); }
                };
                for (let i = 0; i < 32 && !overflow; i++) { segment (length * i / 32, length * (i + 1) / 32, points.at (-1), at (length * (i + 1) / 32), 0); }
                if (overflow) { return fallback ('The artwork exceeds the 1800 editable point limit.'); }
                if (element.localName === 'path') { closed = /[zZ]\s*$/.test (element.getAttribute ('d') || ''); }
            }
            if (fill !== 'none' && element.localName !== 'line') { closed = true; }
            points = points.filter ((point, index) => !index || distance (point, points[index - 1]) > 1e-7);
            if (closed && points.length > 1 && distance (points[0], points.at (-1)) < 1e-7) { points.pop (); }
            if (points.length < (closed ? 3 : 2) || points.some (point => !point.every (Number.isFinite)) || (count += points.length) > maxPoints) { return fallback ('The artwork contains degenerate geometry or exceeds editable point limits.'); }
            if (points.some (point => Math.abs (point[0]) > widthMm / 2 + 1e-6 || Math.abs (point[1]) > heightMm / 2 + 1e-6)) { return fallback ('Geometry clipped by the image boundary remains in the original artwork.'); }
            if (fill === 'none' && (stroke === 'none' || !strokeWidth)) { continue; }
            paths.push ({ id : 'svg-' + (paths.length + 1), type : 'artwork', closed, points, fill : element.localName === 'line' ? 'none' : fill, stroke, strokeWidth });
        }
        return paths.length ? { paths, unsupported : false, vectorized : true } : fallback ('The artwork has no visible vector paths.');
    } finally { mount.remove (); }
}

function TracePalette (pixels)
{
    const buckets = new Map ();
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) { continue; }
        const key = (pixels[i] >> 3) * 1024 + (pixels[i + 1] >> 3) * 32 + (pixels[i + 2] >> 3), bucket = buckets.get (key) || { count : 0, rgb : [0, 0, 0] };
        bucket.count++; for (let channel = 0; channel < 3; channel++) { bucket.rgb[channel] += pixels[i + channel]; } buckets.set (key, bucket);
    }
    const colors = [...buckets.values ()].map (bucket => ({ count : bucket.count, rgb : bucket.rgb.map (value => value / bucket.count) }));
    const difference = (a, b) => a.reduce ((sum, value, channel) => sum + (value - b[channel]) ** 2, 0);
    const palette = colors.sort ((a, b) => b.count - a.count).slice (0, 1).map (color => color.rgb);
    while (palette.length < 8 && palette.length < colors.length) {
        let best = null, score = 0;
        for (const color of colors) { const candidate = Math.min (...palette.map (other => difference (color.rgb, other))) * color.count; if (candidate > score) { best = color.rgb; score = candidate; } }
        if (!best) { break; } palette.push (best);
    }
    const nearest = rgb => { let index = 0, best = Infinity; palette.forEach ((color, i) => { const candidate = difference (color, rgb); if (candidate < best) { index = i; best = candidate; } }); return index; };
    for (let iteration = 0; iteration < 4; iteration++) {
        const clusters = palette.map (() => ({ count : 0, rgb : [0, 0, 0] }));
        for (const color of colors) { const cluster = clusters[nearest (color.rgb)]; cluster.count += color.count; color.rgb.forEach ((value, channel) => { cluster.rgb[channel] += value * color.count; }); }
        clusters.forEach ((cluster, index) => { if (cluster.count) { palette[index] = cluster.rgb.map (value => value / cluster.count); } });
    }
    return { colors : palette.map (color => '#' + color.map (value => Math.round (value).toString (16).padStart (2, '0')).join ('')), nearest };
}

function TraceRectangles (pixels, width, height, palette)
{
    const rectangles = []; let previous = new Map ();
    for (let y = 0; y < height; y++) {
        const current = new Map (); let x = 0;
        const colorAt = column => { const at = (y * width + column) * 4; return pixels[at + 3] < 128 ? -1 : palette.nearest ([pixels[at], pixels[at + 1], pixels[at + 2]]); };
        while (x < width) {
            const start = x, color = colorAt (x++); while (x < width && colorAt (x) === color) { x++; }
            if (color < 0) { continue; }
            const key = start + ':' + x + ':' + color, old = previous.get (key), rectangle = old || { x : start, y, width : x - start, height : 0, color };
            rectangle.height++; if (!old) { rectangles.push (rectangle); } current.set (key, rectangle);
        }
        previous = current;
        if (rectangles.length > maxPaths) { return null; }
    }
    return rectangles;
}

// Text, photographs and unsupported SVG paint may be explicitly converted to a
// small color mosaic. The rectangles preserve holes/transparency at the chosen
// resolution and remain ordinary editable paths; this is a disclosed approximation.
export async function TraceLabelImage (buffer, mime, widthMm, heightMm)
{
    if (![widthMm, heightMm].every (value => Number.isFinite (value) && value >= 1 && value <= 10000)) { throw new Error ('Use finite physical label dimensions between 1 and 10000 mm.'); }
    const info = ArtworkImageInfo (buffer);
    if (info.mime !== mime) { throw new Error ('The label image type does not match its bytes.'); }
    const bitmap = await createImageBitmap (new Blob ([buffer], { type : mime }));
    try {
        if (bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width * bitmap.height > 16 * 1024 * 1024) { throw new Error ('Decoded label image is too large.'); }
        const canvas = document.createElement ('canvas'), context = canvas.getContext ('2d', { willReadFrequently : true });
        for (const size of [128, 96, 64, 48, 32, 24, 16, 12, 8]) {
            const width = Math.max (1, Math.round (size * widthMm / Math.max (widthMm, heightMm))), height = Math.max (1, Math.round (size * heightMm / Math.max (widthMm, heightMm)));
            canvas.width = width; canvas.height = height; context.imageSmoothingEnabled = width < bitmap.width || height < bitmap.height; context.drawImage (bitmap, 0, 0, width, height);
            const pixels = context.getImageData (0, 0, width, height).data, palette = TracePalette (pixels);
            if (!palette.colors.length) { return fallback ('The label has no pixels opaque enough to trace.'); }
            const rectangles = TraceRectangles (pixels, width, height, palette); if (!rectangles) { continue; }
            const paths = rectangles.map ((rectangle, index) => {
                const left = rectangle.x / width * widthMm - widthMm / 2, right = (rectangle.x + rectangle.width) / width * widthMm - widthMm / 2;
                const top = heightMm / 2 - rectangle.y / height * heightMm, bottom = heightMm / 2 - (rectangle.y + rectangle.height) / height * heightMm;
                return { id : 'trace-' + (index + 1), type : 'artwork', closed : true, points : [[left, bottom], [right, bottom], [right, top], [left, top]], fill : palette.colors[rectangle.color], stroke : 'none', strokeWidth : 0 };
            });
            return { paths, unsupported : false, vectorized : true, approximate : true, widthPixels : width, heightPixels : height, paletteSize : palette.colors.length, reason : 'Approximate color trace: ' + width + ' × ' + height + ' pixels, up to eight colors; partial transparency is thresholded.' };
        }
        return fallback ('The label could not be traced within editable vector limits.');
    } finally { bitmap.close (); }
}
