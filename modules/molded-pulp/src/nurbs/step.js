// STEP AP214 (ISO 10303-21) writer for pulp shells: one MANIFOLD_SOLID_BREP per shell, B-spline faces and edges, in
// millimetres. Plain text, no CAD kernel; shared control points are written once and referenced by faces and edges.
import { ShellBrep, BrepEdgeUses } from './brep.js';

export function StepReal (value)
{
    if (!Number.isFinite (value)) { throw new Error ('STEP output needs finite coordinates.'); }
    if (Object.is (value, -0) || value === 0) { return '0.'; }
    let text = Number (value.toPrecision (12)).toString ().toUpperCase ();
    if (!text.includes ('.')) { text = text.includes ('E') ? text.replace ('E', '.E') : text + '.'; }
    return text;
}
const Text = value => '\'' + String (value).replace (/[^\x20-\x7e]/g, '?').replace (/'/g, '\'\'') + '\'';

// Distinct knots and multiplicities, as STEP stores them.
function KnotList (knots)
{
    const values = [], mults = [];
    for (const k of knots) { if (values.length && Math.abs (k - values[values.length - 1]) < 1e-12) { mults[mults.length - 1]++; } else { values.push (k); mults.push (1); } }
    return { values, mults };
}

class Writer
{
    constructor () { this.lines = []; this.next = 1; }
    Add (body) { const id = this.next++; this.lines.push ('#' + id + '=' + body + ';'); return '#' + id; }
    Point (p) { return this.Add ('CARTESIAN_POINT(\'\',(' + StepReal (p[0]) + ',' + StepReal (p[1]) + ',' + StepReal (p[2]) + '))'); }
}

function WriteShell (w, shell)
{
    const brep = ShellBrep (shell), uses = BrepEdgeUses (brep);
    for (const [name, use] of Object.entries (uses)) { if (use.forward !== 1 || use.reversed !== 1) { throw new Error ('Pulp shell topology is not closed at edge ' + name + '.'); } }
    const nets = { t : shell.top, b : shell.bottom }, ids = { t : new Array (shell.top.countU * shell.top.countV), b : new Array (shell.bottom.countU * shell.bottom.countV) };
    const point = (face, index) => {
        if (!ids[face][index]) { const p = nets[face].points; ids[face][index] = w.Point ([p[index * 3], p[index * 3 + 1], p[index * 3 + 2]]); }
        return ids[face][index];
    };
    const curve = (degree, refs, knots) => { const k = KnotList (knots); return w.Add ('B_SPLINE_CURVE_WITH_KNOTS(\'\','+ degree + ',(' + refs.join (',') + '),.UNSPECIFIED.,.F.,.F.,(' + k.mults.join (',') + '),(' + k.values.map (StepReal).join (',') + '),.UNSPECIFIED.)'); };
    const surface = (degreeU, degreeV, rows, knotsU, knotsV) => {
        const u = KnotList (knotsU), v = KnotList (knotsV);
        return w.Add ('B_SPLINE_SURFACE_WITH_KNOTS(\'\',' + degreeU + ',' + degreeV + ',(' + rows.map (row => '(' + row.join (',') + ')').join (',') + '),.UNSPECIFIED.,.F.,.F.,.F.,(' + u.mults.join (',') + '),(' + v.mults.join (',') + '),(' + u.values.map (StepReal).join (',') + '),(' + v.values.map (StepReal).join (',') + '),.UNSPECIFIED.)');
    };
    const vertex = {}; for (const [name, v] of Object.entries (brep.vertices)) { vertex[name] = w.Add ('VERTEX_POINT(\'\',' + point (v.face, v.index) + ')'); }
    const edge = {};
    for (const [name, e] of Object.entries (brep.edges)) {
        const geometry = e.curve.kind === 'line'
            ? curve (1, [point (brep.vertices[e.from].face, brep.vertices[e.from].index), point (brep.vertices[e.to].face, brep.vertices[e.to].index)], [0, 0, 1, 1])
            : curve (e.curve.degree, e.curve.indices.map (i => point (e.curve.face, i)), e.curve.knots);
        edge[name] = w.Add ('EDGE_CURVE(\'\',' + vertex[e.from] + ',' + vertex[e.to] + ',' + geometry + ',.T.)');
    }
    const faces = brep.faces.map (face => {
        let geometry;
        if (face.kind === 'surface') {
            const net = nets[face.face], rows = [];
            // STEP lists control points [u][v]: one inner list per u index.
            for (let a = 0; a < net.countU; a++) { const row = []; for (let b = 0; b < net.countV; b++) { row.push (point (face.face, b * net.countU + a)); } rows.push (row); }
            geometry = surface (net.degreeU, net.degreeV, rows, net.knotsU, net.knotsV);
        } else {
            const rows = face.perimeter.top.map ((ti, k) => [point ('t', ti), point ('b', face.perimeter.bottom[k])]);
            geometry = surface (1, 1, rows, face.knots, [0, 0, 1, 1]);
        }
        const oriented = face.loop.map (([e, forward]) => w.Add ('ORIENTED_EDGE(\'\',*,*,' + edge[e] + ',' + (forward ? '.T.' : '.F.') + ')'));
        const loop = w.Add ('EDGE_LOOP(\'\',(' + oriented.join (',') + '))'), bound = w.Add ('FACE_OUTER_BOUND(\'\',' + loop + ',.T.)');
        return w.Add ('ADVANCED_FACE(' + Text (face.name) + ',(' + bound + '),' + geometry + ',' + (face.sameSense ? '.T.' : '.F.') + ')');
    });
    return w.Add ('MANIFOLD_SOLID_BREP(' + Text (shell.id) + ',' + w.Add ('CLOSED_SHELL(\'\',' + '(' + faces.join (',') + '))') + ')');
}

// shells: NurbsShell results (world mm). Returns the STEP file text.
export function WriteStep (shells, { name = 'Molded pulp', timestamp = new Date ().toISOString ().slice (0, 19) } = {})
{
    if (!shells.length) { throw new Error ('Form a sheet or tray before exporting STEP.'); }
    const w = new Writer ();
    const context = w.Add ('APPLICATION_CONTEXT(\'core data for automotive mechanical design processes\')');
    w.Add ('APPLICATION_PROTOCOL_DEFINITION(\'international standard\',\'automotive_design\',2000,' + context + ')');
    const productContext = w.Add ('PRODUCT_CONTEXT(\'\',' + context + ',\'mechanical\')');
    const product = w.Add ('PRODUCT(' + Text (name) + ',' + Text (name) + ',\'\',(' + productContext + '))');
    w.Add ('PRODUCT_RELATED_PRODUCT_CATEGORY(\'part\',$,(' + product + '))');
    const formation = w.Add ('PRODUCT_DEFINITION_FORMATION(\'\',\'\',' + product + ')');
    const definition = w.Add ('PRODUCT_DEFINITION(\'design\',\'\',' + formation + ',' + w.Add ('PRODUCT_DEFINITION_CONTEXT(\'part definition\',' + context + ',\'design\')') + ')');
    const shape = w.Add ('PRODUCT_DEFINITION_SHAPE(\'\',' + '\'\',' + definition + ')');
    const mm = w.Add ('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )'), rad = w.Add ('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )'), sr = w.Add ('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
    const uncertainty = w.Add ('UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-04),' + mm + ',\'distance_accuracy_value\',\'confusion accuracy\')');
    const representationContext = w.Add ('( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((' + uncertainty + ')) GLOBAL_UNIT_ASSIGNED_CONTEXT((' + mm + ',' + rad + ',' + sr + ')) REPRESENTATION_CONTEXT(\'Context #1\',\'3D Context with UNIT and UNCERTAINTY\') )');
    const placement = w.Add ('AXIS2_PLACEMENT_3D(\'\',' + w.Point ([0, 0, 0]) + ',' + w.Add ('DIRECTION(\'\',(0.,0.,1.))') + ',' + w.Add ('DIRECTION(\'\',(1.,0.,0.))') + ')');
    const solids = shells.map (shell => WriteShell (w, shell));
    const representation = w.Add ('ADVANCED_BREP_SHAPE_REPRESENTATION(' + Text (name) + ',(' + [placement, ...solids].join (',') + '),' + representationContext + ')');
    w.Add ('SHAPE_DEFINITION_REPRESENTATION(' + shape + ',' + representation + ')');
    const file = Text (name.replace (/[^\w .-]+/g, '').trim () || 'molded-pulp') ;
    return ['ISO-10303-21;', 'HEADER;', 'FILE_DESCRIPTION((\'Auto3D molded pulp B-rep\'),\'2;1\');', 'FILE_NAME(' + file + ',' + Text (timestamp) + ',(\'\'),(\'\'),\'Auto3D\',\'Auto3D Molded Pulp\',\'\');', 'FILE_SCHEMA((\'AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }\'));', 'ENDSEC;', 'DATA;', ...w.lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join ('\n');
}
