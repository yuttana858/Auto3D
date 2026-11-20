// Exact CAD (STEP AP214, millimetres) of round products as solids of revolution, with label zones as named, coloured faces.
//
// A product's outer profile is a list of (r, y) points from the bottom of the axis up the outside to the top of the
// axis. Each segment revolves into an analytic face: a plane (horizontal), a cylinder (vertical) or a cone. Circles at
// the profile points are the edges. Label zones split the printed wall exactly at their heights and, for front and back
// labels, at their angles; those faces carry the zone's name and a colour, so CAD tools show the label regions.
// Curved parts of the real construction (domes, tapers, necks, seams) are the same short segments the mesh uses.
//
// Orientation: the outward normal of a profile segment (dr, dy) is (dy, −dr) in (r, y). Angles θ run from +x towards +z
// (the front of a product faces +z).
import { CanProfile } from './detailmesh.js';
import { GetArtworkZones } from './zones.js';
import { DefaultProductDraft, UpdateProductDraft } from './state.js';

const Tau = 2 * Math.PI;

// Outer profile of a can: from the axis at the bottom, up the outside, to the axis at the top. Segments that touch the
// axis are horizontal (a dome apex gets a small flat), so every face of revolution has circle edges only.
export function CanOutline (input)
{
    const d = UpdateProductDraft (DefaultProductDraft (), input), r = d.diameterMm / 2, h = d.heightMm;
    if (d.family !== 'can') { throw new Error ('Exact product CAD currently covers cans.'); }
    if (!d.details) { const lo = h * .025, hi = h * .975; return [[0, 0], [r, 0], [r, lo], [r, hi], [r, h], [0, h]]; }
    const c = CanProfile (d), out = [];
    if (c.style === 'beverage') {
        // Dome (spherical cap) from a small flat at the apex out to the stand, tapered lower wall, printed wall, neck.
        const domeEdge = c.standRadius - Math.min (1.2, r * .04), base = Math.min (1.6, h * .013), sag = c.domeDepth - base, R = (domeEdge * domeEdge + sag * sag) / (2 * sag);
        const dome = rho => base + sag - (R - Math.sqrt (R * R - rho * rho)), flat = Math.min (1, domeEdge * .05);
        out.push ([0, dome (0)], [flat, dome (0)]);
        for (let i = 1; i <= 10; i++) { const rho = flat + (domeEdge - flat) * i / 10; out.push ([rho, dome (rho)]); }
        const stand = Math.min (.8, r * .025);
        out.push ([c.standRadius - stand, stand * .6], [c.standRadius, 0], [c.standRadius + stand, stand * .6]);
        const from = [c.standRadius + stand, stand * .6];
        for (let i = 1; i <= 8; i++) { const f = i / 8; out.push ([from[0] + (r - from[0]) * Math.sin (f * Math.PI / 2), from[1] + (c.taperTop - from[1]) * f]); }
        out.push ([r, c.neckStart]);
        const neckTop = h - c.seamHeight - Math.min (1.5, h * .012);
        for (let i = 1; i < 8; i++) { const f = (1 - Math.cos (Math.PI * i / 8)) / 2; out.push ([r + (c.neckRadius - r) * f, c.neckStart + (neckTop - c.neckStart) * i / 8]); }
        const n = c.neckRadius, panel = h - c.countersink, s2 = c.seamHeight;
        out.push ([n, neckTop], [n, h - s2], [c.seamRadius, h - s2], [c.seamRadius, h], [n * .97, h], [n * .93, h - s2 * .4], [n * .9, panel + .6], [n * .84, panel], [0, panel]);
    } else if (c.style === 'food') {
        const s = c.seamHeight, b = c.bodyRadius, cs = c.countersink, rc = b - Math.min (1.6, r * .04), ring = Math.min (.7, h * .006);
        const end = flip => { const y = v => flip ? h - v : v, p = [[0, cs], [rc * .35, cs], [rc * .4, cs + ring], [rc * .45, cs], [rc * .62, cs], [rc * .67, cs + ring], [rc * .72, cs], [rc, cs], [b - .4, .5], [r - .5, 0], [r, .5], [r, s]].map (([x, v]) => [x, y (v)]); return flip ? p.reverse () : p; };
        out.push (...end (false), [b, s]);
        // Printed wall between the seams (the mesh's circumferential beads are presentation relief and are left out).
        out.push ([b, h - s], ...end (true));
    } else {
        const lid = c.lidHeight, b = c.bodyRadius;
        out.push ([0, 0], [b * .97, 0], [b, h * .02], [b, h - lid], [r, h - lid], [r, h - Math.min (1, lid * .1)], [r * .97, h], [0, h]);
    }
    return out.filter ((p, i) => i === 0 || Math.hypot (p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-6);
}

// Split vertical segments at the label heights so the label band has its own faces.
function SplitAt (profile, heights)
{
    const out = [profile[0]];
    for (let i = 1; i < profile.length; i++) {
        const [r0, y0] = profile[i - 1], [r1, y1] = profile[i];
        if (Math.abs (r1 - r0) < 1e-9 && Math.abs (y1 - y0) > 1e-9) { for (const y of heights.filter (y => y > Math.min (y0, y1) + 1e-6 && y < Math.max (y0, y1) - 1e-6).sort ((a, b) => (y1 > y0 ? a - b : b - a))) { out.push ([r0, y]); } }
        out.push (profile[i]);
    }
    return out;
}

// Label regions: { name, zone, bottomMm, topMm, ranges: [[θa, θb], …] } from the product's label zones.
export function LabelRegions (draft, zoneIds)
{
    const zones = GetArtworkZones (draft).filter (z => z.surface === 'cylinder' && zoneIds.includes (z.id));
    return zones.map (z => {
        const half = z.id === 'wrap' ? Math.PI : z.widthMm / z.radiusMm / 2, centre = z.id === 'back' ? -Math.PI / 2 : Math.PI / 2;
        const ranges = z.id === 'wrap' ? [[0, Tau]] : [[centre - half, centre + half]].map (([a, b]) => [(a % Tau + Tau) % Tau, (b % Tau + Tau) % Tau]);
        return { name : 'Label ' + z.id, zone : z.id, radiusMm : z.radiusMm, bottomMm : z.bottomMm, topMm : z.bottomMm + z.heightMm, ranges };
    });
}

// Neutral B-rep of the solid of revolution: vertices, edges (circle arcs, lines) and faces (plane, cylinder, cone).
export function RevolvedSolid (profile, { id = 'Product', regions = [], name = 'Body' } = {})
{
    const split = SplitAt (profile, [...new Set (regions.flatMap (g => [g.bottomMm, g.topMm]))]);
    const pts = split.filter ((p, i) => i === 0 || Math.hypot (p[0] - split[i - 1][0], p[1] - split[i - 1][1]) > 1e-6);
    const vertices = [], edges = [], faces = [], P = (r, y, t) => [r * Math.cos (t), y, r * Math.sin (t)];
    // Labels on a wall segment (front and back share one band); its split angles are their range ends, plus θ = 0 (seam).
    const inBand = (r0, y0, r1, y1) => regions.filter (g => Math.abs (r0 - r1) < 1e-9 && Math.abs (r0 - g.radiusMm) < 1e-6 && Math.min (y0, y1) >= g.bottomMm - 1e-6 && Math.max (y0, y1) <= g.topMm + 1e-6);
    const segments = pts.slice (1).map ((p, i) => { const [r0, y0] = pts[i], [r1, y1] = p, labels = inBand (r0, y0, r1, y1); return { r0, y0, r1, y1, labels, cuts : [0, ...labels.filter (g => g.zone !== 'wrap').flatMap (g => g.ranges.flat ())] }; });
    // Circles: one per profile point with r > 0, cut at the union of the angles of the faces that meet it.
    const circles = pts.map (([r, y], i) => {
        if (r < 1e-9) { return null; }
        const cuts = [...new Set ([...(segments[i - 1]?.cuts || []), ...(segments[i]?.cuts || [])].map (a => Math.round (a * 1e12) / 1e12))].filter (a => a < Tau - 1e-9).sort ((a, b) => a - b);
        const ids = cuts.map (t => { vertices.push ({ point : P (r, y, t) }); return vertices.length - 1; });
        const arcs = cuts.map ((t, k) => { const t1 = k + 1 < cuts.length ? cuts[k + 1] : Tau, end = ids[(k + 1) % ids.length]; edges.push ({ kind : 'circle', from : ids[k], to : end, centre : [0, y, 0], radius : r, t0 : t, t1 }); return edges.length - 1; });
        return { r, y, cuts, ids, arcs };
    });
    // Arcs of circle c that cover [a, b] in order (a < b, both cuts of c).
    const arcsBetween = (c, a, b) => { const out = []; c.cuts.forEach ((t, k) => { const t1 = k + 1 < c.cuts.length ? c.cuts[k + 1] : Tau; if (t >= a - 1e-9 && t1 <= b + 1e-9) { out.push (c.arcs[k]); } }); return out; };
    const line = (c0, c1, t) => { const k0 = c0.cuts.findIndex (u => Math.abs (u - t) < 1e-9), k1 = c1.cuts.findIndex (u => Math.abs (u - t) < 1e-9); if (k0 < 0 || k1 < 0) { throw new Error ('Product CAD: a face edge does not meet its circles.'); } edges.push ({ kind : 'line', from : c0.ids[k0], to : c1.ids[k1], points : [P (c0.r, c0.y, t), P (c1.r, c1.y, t)] }); return edges.length - 1; };
    segments.forEach ((s, i) => {
        const c0 = circles[i], c1 = circles[i + 1], out = [s.y1 - s.y0, -(s.r1 - s.r0)];
        if (Math.abs (s.y1 - s.y0) < 1e-9) {
            // Plane: full annulus or disc. Seen from +y a circle (θ from +x to +z) runs clockwise.
            const up = out[1] > 0, outer = s.r1 > s.r0 ? c1 : c0, inner = s.r1 > s.r0 ? c0 : c1;
            const ring = (c, isOuter) => { const forward = up ? !isOuter : isOuter, list = c.arcs.map (e => [e, forward]); return forward ? list : list.reverse (); };
            const bounds = [{ outer : true, loop : ring (outer, true) }]; if (inner) { bounds.push ({ outer : false, loop : ring (inner, false) }); }
            faces.push ({ name, kind : 'plane', origin : [0, s.y0, 0], normal : [0, up ? 1 : -1, 0], xAxis : [1, 0, 0], sameSense : true, bounds });
            return;
        }
        // Cylinder or cone, between angles; (θ, t) runs clockwise seen from outside, so the loop is listed reversed.
        const geometry = Math.abs (s.r1 - s.r0) < 1e-9 ? { kind : 'cylinder', origin : [0, s.y0, 0], axis : [0, 1, 0], radius : s.r0 }
            : (() => { const up = (s.r1 - s.r0) / (s.y1 - s.y0) > 0; return { kind : 'cone', origin : [0, s.y0, 0], axis : [0, up ? 1 : -1, 0], radius : s.r0, semiAngle : Math.atan (Math.abs ((s.r1 - s.r0) / (s.y1 - s.y0))) }; }) ();
        const cuts = [...new Set (s.cuts.map (a => Math.round (a * 1e12) / 1e12))].filter (a => a < Tau - 1e-9).sort ((a, b) => a - b);
        const spans = cuts.map ((t, k) => [t, k + 1 < cuts.length ? cuts[k + 1] : Tau]), lines = new Map ();
        // One line per angle on this face (the seam at θ = 0 closes the last span and opens the first).
        const lineAt = t => { const key = Math.abs (t - Tau) < 1e-9 ? 0 : t; if (!lines.has (key)) { lines.set (key, line (c0, c1, key)); } return lines.get (key); };
        for (const [a, b] of spans) {
            const mid = (a + b) / 2, label = s.labels.find (g => g.zone === 'wrap' || g.ranges.some (([u, v]) => (u <= v ? mid > u && mid < v : mid > u || mid < v)));
            const right = lineAt (b), left = lineAt (a);
            const param = [...arcsBetween (c0, a, b).map (e => [e, true]), [right, true], ...arcsBetween (c1, a, b).reverse ().map (e => [e, false]), [left, false]];
            faces.push ({ name : label ? label.name : name, label : label ? label.zone : null, ...geometry, sameSense : s.y1 > s.y0, bounds : [{ outer : true, loop : param.slice ().reverse ().map (([e, f]) => [e, !f]) }] });
        }
    });
    return { id, vertices, edges, faces };
}

// --- STEP writer (self-contained: the Primary Products module does not depend on other modules) ----------------------
const Real = value => { if (!Number.isFinite (value)) { throw new Error ('STEP output needs finite coordinates.'); } if (value === 0 || Object.is (value, -0)) { return '0.'; } let t = Number (value.toPrecision (12)).toString ().toUpperCase (); if (!t.includes ('.')) { t = t.includes ('E') ? t.replace ('E', '.E') : t + '.'; } return t; };
const Text = value => '\'' + String (value).replace (/[^\x20-\x7e]/g, '?').replace (/'/g, '\'\'') + '\'';
const Rgb = hex => [1, 3, 5].map (i => parseInt (hex.slice (i, i + 2), 16) / 255);

// solid: RevolvedSolid result. colors: { body : '#rrggbb', label : '#rrggbb' }.
export function WriteProductStep (solid, { name = 'Product', colors = { body : '#b0b4ba', label : '#e0457b' }, timestamp = new Date ().toISOString ().slice (0, 19) } = {})
{
    const lines = []; let next = 1; const add = body => { const id = '#' + next++; lines.push (id + '=' + body + ';'); return id; };
    const point = p => add ('CARTESIAN_POINT(\'\',(' + p.map (Real).join (',') + '))'), dir = v => add ('DIRECTION(\'\',(' + v.map (Real).join (',') + '))');
    const place = (o, axis, ref = [1, 0, 0]) => add ('AXIS2_PLACEMENT_3D(\'\',' + point (o) + ',' + dir (axis) + ',' + dir (ref) + ')');
    const context = add ('APPLICATION_CONTEXT(\'core data for automotive mechanical design processes\')');
    add ('APPLICATION_PROTOCOL_DEFINITION(\'international standard\',\'automotive_design\',2000,' + context + ')');
    const product = add ('PRODUCT(' + Text (name) + ',' + Text (name) + ',\'\',(' + add ('PRODUCT_CONTEXT(\'\',' + context + ',\'mechanical\')') + '))');
    add ('PRODUCT_RELATED_PRODUCT_CATEGORY(\'part\',$,(' + product + '))');
    const definition = add ('PRODUCT_DEFINITION(\'design\',\'\',' + add ('PRODUCT_DEFINITION_FORMATION(\'\',\'\',' + product + ')') + ',' + add ('PRODUCT_DEFINITION_CONTEXT(\'part definition\',' + context + ',\'design\')') + ')');
    const shape = add ('PRODUCT_DEFINITION_SHAPE(\'\',\'\',' + definition + ')');
    const mm = add ('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )'), rad = add ('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )'), sr = add ('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
    const uncertainty = add ('UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-04),' + mm + ',\'distance_accuracy_value\',\'confusion accuracy\')');
    const representationContext = add ('( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((' + uncertainty + ')) GLOBAL_UNIT_ASSIGNED_CONTEXT((' + mm + ',' + rad + ',' + sr + ')) REPRESENTATION_CONTEXT(\'Context #1\',\'3D Context with UNIT and UNCERTAINTY\') )');
    const vertex = solid.vertices.map (v => add ('VERTEX_POINT(\'\',' + point (v.point) + ')'));
    // Circles about −y with reference +x run from +x towards +z, matching θ.
    const edge = solid.edges.map (e => {
        const curve = e.kind === 'circle' ? add ('CIRCLE(\'\',' + place (e.centre, [0, -1, 0]) + ',' + Real (e.radius) + ')')
            : add ('LINE(\'\',' + point (e.points[0]) + ',' + add ('VECTOR(\'\',' + dir (e.points[1].map ((v, i) => v - e.points[0][i]).map ((v, i, a) => v / Math.hypot (...a))) + ',' + Real (Math.hypot (...e.points[1].map ((v, i) => v - e.points[0][i]))) + ')') + ')');
        return add ('EDGE_CURVE(\'\',' + vertex[e.from] + ',' + vertex[e.to] + ',' + curve + ',.T.)');
    });
    const faceIds = solid.faces.map (f => {
        const surface = f.kind === 'plane' ? add ('PLANE(\'\',' + place (f.origin, f.normal, f.xAxis) + ')')
            : f.kind === 'cylinder' ? add ('CYLINDRICAL_SURFACE(\'\',' + place (f.origin, f.axis) + ',' + Real (f.radius) + ')')
            : add ('CONICAL_SURFACE(\'\',' + place (f.origin, f.axis) + ',' + Real (f.radius) + ',' + Real (f.semiAngle) + ')');
        const bounds = f.bounds.map (b => add ((b.outer ? 'FACE_OUTER_BOUND' : 'FACE_BOUND') + '(\'\',' + add ('EDGE_LOOP(\'\',(' + b.loop.map (([e, forward]) => add ('ORIENTED_EDGE(\'\',*,*,' + edge[e] + ',' + (forward ? '.T.' : '.F.') + ')')).join (',') + '))') + ',.T.)'));
        return add ('ADVANCED_FACE(' + Text (f.name) + ',(' + bounds.join (',') + '),' + surface + ',' + (f.sameSense ? '.T.' : '.F.') + ')');
    });
    const brep = add ('MANIFOLD_SOLID_BREP(' + Text (solid.id) + ',' + add ('CLOSED_SHELL(\'\',(' + faceIds.join (',') + '))') + ')');
    const representation = add ('ADVANCED_BREP_SHAPE_REPRESENTATION(' + Text (name) + ',(' + place ([0, 0, 0], [0, 0, 1]) + ',' + brep + '),' + representationContext + ')');
    add ('SHAPE_DEFINITION_REPRESENTATION(' + shape + ',' + representation + ')');
    // Colours: the solid in the body colour, label faces in the label colour (named by their zone).
    const style = (hex, target, label) => { const [r, g, b] = Rgb (hex); return add ('STYLED_ITEM(' + Text (label) + ',(' + add ('PRESENTATION_STYLE_ASSIGNMENT((' + add ('SURFACE_STYLE_USAGE(.BOTH.,' + add ('SURFACE_SIDE_STYLE(\'\',(' + add ('SURFACE_STYLE_FILL_AREA(' + add ('FILL_AREA_STYLE(\'\',(' + add ('FILL_AREA_STYLE_COLOUR(\'\',' + add ('COLOUR_RGB(\'\',' + [r, g, b].map (Real).join (',') + ')') + ')') + '))') + ')') + '))') + ')') + '))') + '),' + target + ')'); };
    const styled = [style (colors.body, brep, 'Body'), ...solid.faces.map ((f, i) => f.label ? style (colors.label, faceIds[i], f.name) : null).filter (Boolean)];
    add ('MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION(\'\',(' + styled.join (',') + '),' + representationContext + ')');
    const file = Text (name.replace (/[^\w .-]+/g, '').trim () || 'product');
    return ['ISO-10303-21;', 'HEADER;', 'FILE_DESCRIPTION((\'Auto3D product with label regions\'),\'2;1\');', 'FILE_NAME(' + file + ',' + Text (timestamp) + ',(\'\'),(\'\'),\'Auto3D\',\'Auto3D Primary Products\',\'\');', 'FILE_SCHEMA((\'AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }\'));', 'ENDSEC;', 'DATA;', ...lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join ('\n');
}

// Product draft (with its applied label zones) to STEP text.
export function ProductStep (input, { zones, name, colors } = {})
{
    const d = UpdateProductDraft (DefaultProductDraft (), input), wanted = zones || (d.artwork || []).map (a => a.zone);
    const regions = LabelRegions (d, wanted), solid = RevolvedSolid (CanOutline (d), { id : name || 'Product', regions });
    return { text : WriteProductStep (solid, { name : name || 'Product', ...(colors ? { colors } : {}) }), faces : solid.faces.length, labels : [...new Set (solid.faces.filter (f => f.label).map (f => f.label))], solid };
}
