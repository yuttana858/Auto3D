// Filled closed-envelope presentation pouches. The thin perimeter represents seals, not manufacturing walls or a
// volume/filling simulation. Pillow packs bulge from all four seals; stand-up packs open into a flat elliptical bottom
// gusset that lets them stand; flat-bottom (box) packs keep a rectangular W × L section with full-depth side gussets.
// All taper to a flat top seal. Zippers are raised press-to-close tracks below the top seal; spouts are fitments in the
// top seal, and overall height includes the spout and cap.
import { Revolve } from './revolve.js';
import { PouchSpoutHeight } from './state.js';
export const StandUpTopSeal = .08;
const FlatBottomTaper = .62, ZipperHeightMm = 5, ZipperRidgeMm = .8;

// The bag without its spout fitment.
export function PouchBody (draft) { return { ...draft, heightMm : draft.heightMm - PouchSpoutHeight (draft.pouchShape?.spout) }; }
// Front-panel band of the zipper track, measured on the bag body; null without a zipper.
export function PouchZipperBand (draft)
{
    if (!draft.pouchShape?.zipper) { return null; }
    const h = PouchBody (draft).heightMm, top = draft.pouchShape.style === 'pillow' ? h * .9 : h * (1 - StandUpTopSeal) - Math.min (8, h * .04);
    return { bottomMm : top - ZipperHeightMm, topMm : top };
}
// Usable front/back panel between the bottom (gusset or seal) and the top seal or zipper.
export function PouchPanel (draft)
{
    const body = PouchBody (draft), h = body.heightMm, style = draft.pouchShape?.style || 'pillow', zipper = PouchZipperBand (draft);
    let bottom = h * .1, top = h * .9;
    if (style === 'standup') { bottom = draft.pouchShape.gussetMm + h * .03; top = h * (1 - StandUpTopSeal - .03); }
    if (style === 'flatbottom') { bottom = h * .04; top = h * (1 - StandUpTopSeal - .03); }
    if (zipper) { top = Math.min (top, zipper.bottomMm - Math.max (2, h * .02)); }
    return { bottomMm : bottom, heightMm : Math.max (1, top - bottom) };
}
function Thickness (draft)
{
    const style = draft.pouchShape?.style || 'pillow', h = PouchBody (draft).heightMm, top = 1 - StandUpTopSeal;
    if (style === 'pillow') { return (u, v) => .01 + .49 * Math.sin (Math.PI * u) * Math.sin (Math.PI * v); }
    if (style === 'flatbottom') {
        // Rectangular section at full depth, then the side gussets fold in towards the top seal.
        return (u, v) => { const t = Math.max (0, Math.min (1, (v - FlatBottomTaper) / (top - FlatBottomTaper))); return .01 + .49 * Math.cos (t * Math.PI / 2) ** .75; };
    }
    const gusset = draft.pouchShape.gussetMm / h;
    return (u, v) => {
        // Full gusset depth up to the fold line, then a smooth taper to the top seal band.
        const t = Math.max (0, Math.min (1, (v - gusset) / Math.max (1e-6, top - gusset))), taper = v <= gusset ? 1 : Math.cos (t * Math.PI / 2) ** .75;
        return .01 + .49 * Math.sin (Math.PI * u) ** (v <= gusset ? .5 : .5 + .5 * t) * taper;
    };
}
function Surface (draft)
{
    const body = PouchBody (draft), w = body.widthMm, h = body.heightMm, d = body.depthMm, thickness = Thickness (draft);
    return (u, v, side) => [w * (u - 0.5), h * v, side * d * thickness (u, v)];
}
function Mesh (id, role)
{
    const mesh = { id, materialRole : role, positions : [], normals : [], uvs : [], indices : [] };
    mesh.triangle = (a, b, c, uv) => {
        const ab = b.map ((x, i) => x - a[i]), ac = c.map ((x, i) => x - a[i]);
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const length = Math.hypot (...normal); if (length < 1e-12) { return; }
        const base = mesh.positions.length / 3;
        for (const p of [a, b, c]) { mesh.positions.push (...p); mesh.normals.push (...normal.map (x => x / length)); }
        mesh.uvs.push (...uv.flat ()); mesh.indices.push (base, base + 1, base + 2);
    };
    mesh.quad = (a, b, c, e, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) => { mesh.triangle (a, b, c, [uv[0], uv[1], uv[2]]); mesh.triangle (a, c, e, [uv[0], uv[2], uv[3]]); };
    return mesh;
}
const Clean = mesh => { delete mesh.triangle; delete mesh.quad; return mesh; };

export function CreatePouch (draft, segments)
{
    const mesh = Mesh ('body', 'body'), n = segments / 2, point = Surface (draft);
    for (let row = 0; row < n; row++) { for (let col = 0; col < n; col++) {
        const u = col / n, v = row / n, u1 = (col + 1) / n, v1 = (row + 1) / n;
        const uv = [[u, v], [u1, v], [u1, v1], [u, v1]];
        mesh.quad (point (u, v, 1), point (u1, v, 1), point (u1, v1, 1), point (u, v1, 1), uv);
        mesh.quad (point (u1, v, -1), point (u, v, -1), point (u, v1, -1), point (u1, v1, -1), uv);
    } }
    // Counterclockwise boundary viewed from the front; bridge back to front. On stand-up and flat-bottom pouches the
    // bottom bridge is the flat base, and on flat-bottom pouches the side bridges are the side gussets.
    const boundary = [];
    for (let i = 0; i < n; i++) { boundary.push ([i / n, 0]); }
    for (let i = 0; i < n; i++) { boundary.push ([1, i / n]); }
    for (let i = 0; i < n; i++) { boundary.push ([1 - i / n, 1]); }
    for (let i = 0; i < n; i++) { boundary.push ([0, 1 - i / n]); }
    for (let i = 0; i < boundary.length; i++) {
        const a = boundary[i], b = boundary[(i + 1) % boundary.length];
        mesh.quad (point (...a, -1), point (...b, -1), point (...b, 1), point (...a, 1));
    }
    return Clean (mesh);
}

// A closed raised slab following one panel between v0 and v1 (body fractions), inset from the side seals.
function ZipperTrack (draft, side, segments)
{
    const body = PouchBody (draft), band = PouchZipperBand (draft), point = Surface (draft), mesh = Mesh ('zipper-' + (side > 0 ? 'front' : 'back'), 'closure');
    const v0 = band.bottomMm / body.heightMm, v1 = band.topMm / body.heightMm, u0 = .04, u1 = .96, cols = segments / 2;
    const normal = (u, v) => {
        const e = 1e-4, du = point (u + e, v, side).map ((x, i) => x - point (u - e, v, side)[i]), dv = point (u, v + e, side).map ((x, i) => x - point (u, v - e, side)[i]);
        let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]]; if (n[2] * side < 0) { n = n.map (x => -x); }
        const length = Math.hypot (...n) || 1; return n.map (x => x / length);
    };
    const at = (i, j, lift) => { const u = u0 + (u1 - u0) * i / cols, v = j ? v1 : v0, p = point (u, v, side), q = normal (u, v); return p.map ((x, k) => x + q[k] * lift); };
    // Wind counter-clockwise as seen from outside the panel.
    const face = (a, b, c, e) => side > 0 ? mesh.quad (a, b, c, e) : mesh.quad (b, a, e, c);
    for (let i = 0; i < cols; i++) {
        face (at (i, 0, ZipperRidgeMm), at (i + 1, 0, ZipperRidgeMm), at (i + 1, 1, ZipperRidgeMm), at (i, 1, ZipperRidgeMm));
        face (at (i + 1, 0, 0), at (i, 0, 0), at (i, 1, 0), at (i + 1, 1, 0));
        face (at (i + 1, 0, 0), at (i + 1, 0, ZipperRidgeMm), at (i, 0, ZipperRidgeMm), at (i, 0, 0));
        face (at (i, 1, 0), at (i, 1, ZipperRidgeMm), at (i + 1, 1, ZipperRidgeMm), at (i + 1, 1, 0));
    }
    face (at (0, 0, 0), at (0, 0, ZipperRidgeMm), at (0, 1, ZipperRidgeMm), at (0, 1, 0));
    face (at (cols, 1, 0), at (cols, 1, ZipperRidgeMm), at (cols, 0, ZipperRidgeMm), at (cols, 0, 0));
    return Clean (mesh);
}

// Spout fitment: a neck through the top seal and a screw cap, centred or near a top corner.
export function PouchSpoutCenter (draft)
{
    const spout = draft.pouchShape.spout, w = draft.widthMm, capRadius = spout.diameterMm * .725;
    return spout.position === 'center' ? 0 : w / 2 - Math.max (w * .2, capRadius * 1.6);
}
function Spout (draft, segments)
{
    const spout = draft.pouchShape.spout, d = spout.diameterMm, top = PouchBody (draft).heightMm, x = PouchSpoutCenter (draft);
    const insert = Math.min (d * .8, top * StandUpTopSeal * .9), neckTop = top + d * .8, h = draft.heightMm;
    const move = mesh => { for (let i = 0; i < mesh.positions.length; i += 3) { mesh.positions[i] += x; } return mesh; };
    const cylinder = (id, radius, low, high) => move (Revolve (id, 'closure', [[0, low], [radius, low], [radius, high], [0, high]], segments));
    return [cylinder ('spout', d / 2, top - insert, neckTop), cylinder ('spout-cap', d * .725, neckTop, h)];
}

export function CreatePouchComponents (draft, segments)
{
    const components = [CreatePouch (draft, segments)];
    if (draft.pouchShape?.zipper) { components.push (ZipperTrack (draft, 1, segments), ZipperTrack (draft, -1, segments)); }
    if (draft.pouchShape?.spout) { components.push (...Spout (draft, segments)); }
    return components;
}
