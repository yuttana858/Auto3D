import { MaxLabelSVG } from '../../modules/primary-products/src/labelsource.js';
// Restricted, self-contained SVG. External resources, CSS, scripts, entities and animation are rejected.
export function SanitizeLabelSVG (text)
{
    if (typeof text !== 'string' || new TextEncoder ().encode (text).length > MaxLabelSVG || /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test (text)) { throw new Error ('Use a self-contained SVG up to 64 KiB without external resources.'); }
    const doc = new DOMParser ().parseFromString (text, 'image/svg+xml'), root = doc.documentElement;
    if (root.localName !== 'svg' || doc.querySelector ('parsererror')) { throw new Error ('Invalid SVG document.'); }
    const tags = new Set (['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'title', 'desc']);
    const attrs = new Set (['xmlns', 'viewBox', 'id', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'width', 'height', 'd', 'points', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'dx', 'dy', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clip-path', 'clipPathUnits']);
    const elements = [root, ...root.querySelectorAll ('*')]; if (elements.length > 1500) { throw new Error ('SVG has too many elements.'); }
    for (const el of elements) {
        if (!tags.has (el.localName) || el.namespaceURI !== 'http://www.w3.org/2000/svg') { throw new Error ('SVG contains an unsupported element: ' + el.localName); }
        for (const a of [...el.attributes]) {
            if (a.name === 'xmlns' && a.value === 'http://www.w3.org/2000/svg') { continue; }
            if (!attrs.has (a.name) || /[\\]|(?:https?:|data:|javascript:|@import)/i.test (a.value) || /url\s*\(/i.test (a.value) && !/^url\(#[A-Za-z_][\w.-]*\)$/.test (a.value)) { throw new Error ('SVG contains unsupported or external styling. Convert styles to presentation attributes and embed paths.'); }
        }
    }
    const box = root.getAttribute ('viewBox')?.trim ().split (/[\s,]+/).map (Number);
    if (!box || box.length !== 4 || !box.every (Number.isFinite) || box[2] <= 0 || box[3] <= 0 || Math.max (...box.map (Math.abs)) > 1e6 || box[2] / box[3] > 50 || box[3] / box[2] > 50) { throw new Error ('SVG needs a valid viewBox with a reasonable aspect ratio.'); }
    const scale = 2048 / Math.max (box[2], box[3]); root.setAttribute ('width', String (Math.max (1, Math.round (box[2] * scale)))); root.setAttribute ('height', String (Math.max (1, Math.round (box[3] * scale))));
    return new XMLSerializer ().serializeToString (root);
}
export async function RenderLabelSVG (input)
{
    const svg = SanitizeLabelSVG (input), url = URL.createObjectURL (new Blob ([svg], { type : 'image/svg+xml' })), img = new Image ();
    try {
        await new Promise ((resolve, reject) => { img.onload = resolve; img.onerror = () => reject (new Error ('Unable to decode the SVG label.')); img.src = url; });
        const canvas = document.createElement ('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; canvas.getContext ('2d').drawImage (img, 0, 0);
        const blob = await new Promise ((resolve, reject) => canvas.toBlob (value => value ? resolve (value) : reject (new Error ('Unable to render the SVG label.')), 'image/png'));
        return { svg, buffer : await blob.arrayBuffer () };
    } finally { img.src = ''; URL.revokeObjectURL (url); }
}
