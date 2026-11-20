// Pure, portable authoring data. Geometry and host/session services consume this
// contract; importing it must not load a renderer, worker or solid kernel.
export const StudioVersion = '0.1.0';
export const StudioAPIVersion = 1;
export const StudioDefinitionVersion = 1;
export const StudioLimits = Object.freeze ({ nodes : 64, definitionBytes : 256 * 1024, dimensionMm : 10000, positionMm : 1000000 });

const dimension = (label, value, minimum = .1) => ({ label, default : value, min : minimum, max : StudioLimits.dimensionMm, step : .1, unit : 'mm' });
const segments = (value = 32) => ({ label : 'Segments', default : value, min : 8, max : 128, step : 4, unit : 'count', integer : true });
function Freeze (value)
{
    for (const child of Object.values (value)) { if (child && typeof child === 'object') { Freeze (child); } }
    return Object.freeze (value);
}
export const StudioPrimitives = Freeze ({
    box : { label : 'Cube / box', parameters : { widthMm : dimension ('Width', 50), heightMm : dimension ('Height', 50), depthMm : dimension ('Depth', 50) } },
    sphere : { label : 'Sphere', parameters : { diameterMm : dimension ('Diameter', 60), segments : segments () } },
    cylinder : { label : 'Rod / cylinder', parameters : { diameterMm : dimension ('Diameter', 40), heightMm : dimension ('Height', 100), segments : segments () } },
    tube : { label : 'Tube', parameters : { outerDiameterMm : dimension ('Outer diameter', 50), innerDiameterMm : dimension ('Inner diameter', 40, .01), heightMm : dimension ('Height', 100), segments : segments () } },
    cone : { label : 'Cone', parameters : { diameterMm : dimension ('Base diameter', 60), topDiameterMm : dimension ('Top diameter', 0, 0), heightMm : dimension ('Height', 100), segments : segments () } },
    torus : { label : 'Torus', parameters : { majorDiameterMm : dimension ('Ring centerline diameter', 80), tubeDiameterMm : dimension ('Tube diameter', 20), segments : segments (48), tubeSegments : { ...segments (16), label : 'Tube segments' } } },
    capsule : { label : 'Capsule', parameters : { diameterMm : dimension ('Diameter', 40), heightMm : dimension ('Overall height', 100), segments : segments () } }
});
export const StudioOperations = Object.freeze (['union', 'subtract', 'intersect']);
export const DefaultStudioMaterial = Object.freeze ({ color : '#63c9df', roughness : .45, metalness : 0, opacity : 1 });
export const StudioIdentityMatrix = Object.freeze ([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function Record (value, keys, title)
{
    if (!value || typeof value !== 'object' || Array.isArray (value) || ![Object.prototype, null].includes (Object.getPrototypeOf (value)) || Reflect.ownKeys (value).some (key => !keys.includes (key))) { throw new Error ('Invalid ' + title + ' fields.'); }
    return value;
}
function NumberIn (value, min, max, title)
{
    if (!Number.isFinite (value) || value < min || value > max) { throw new Error (title + ' must be a finite number from ' + min + ' to ' + max + '.'); }
    return value;
}
function Identifier (value)
{
    if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test (value)) { throw new Error ('Use a valid modeling node ID of 1–64 characters.'); }
    return value;
}
function Name (value)
{
    if (typeof value !== 'string' || !value.trim () || value.length > 80) { throw new Error ('Use a modeling step name of 1–80 characters.'); }
    return value.trim ();
}
function Type (type)
{
    if (typeof type !== 'string' || !Object.hasOwn (StudioPrimitives, type)) { throw new Error ('Choose a supported 3Dstudio primitive.'); }
    return type;
}
export function DefaultStudioParameters (type = 'box')
{
    return Object.fromEntries (Object.entries (StudioPrimitives[Type (type)].parameters).map (([key, field]) => [key, field.default]));
}
function Parameters (type, values = {})
{
    const fields = StudioPrimitives[Type (type)].parameters;
    Record (values, Object.keys (fields), 'primitive parameter');
    const parameters = { ...DefaultStudioParameters (type), ...values };
    for (const [key, field] of Object.entries (fields)) {
        NumberIn (parameters[key], field.min, field.max, field.label);
        if (field.integer && !Number.isInteger (parameters[key])) { throw new Error (field.label + ' must be an integer.'); }
    }
    // Decimal dimensions such as 20 - 19.98 need a floating-point tolerance at
    // the declared limit; it remains far below the kernel's useful resolution.
    if (type === 'tube' && parameters.outerDiameterMm - parameters.innerDiameterMm < .02 - 1e-10) { throw new Error ('Tube inner diameter must be at least 0.02 mm smaller than its outer diameter.'); }
    if (type === 'torus' && parameters.majorDiameterMm - parameters.tubeDiameterMm < .02 - 1e-10) { throw new Error ('Torus centerline diameter must exceed its tube diameter by at least 0.02 mm.'); }
    if (type === 'capsule' && parameters.heightMm < parameters.diameterMm) { throw new Error ('Capsule overall height must be at least its diameter.'); }
    return parameters;
}
function Material (values = {})
{
    Record (values, Object.keys (DefaultStudioMaterial), 'primitive material');
    const material = { ...DefaultStudioMaterial, ...values };
    if (typeof material.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test (material.color)) { throw new Error ('Choose a six-digit hex material color.'); }
    material.color = material.color.toLowerCase ();
    for (const key of ['roughness', 'metalness', 'opacity']) { NumberIn (material[key], 0, 1, key); }
    return material;
}
function Vector (value, title, min, max)
{
    if (!Array.isArray (value) || value.length !== 3) { throw new Error (title + ' must have three coordinates.'); }
    return Array.from (value, component => NumberIn (component, min, max, title));
}
function Transform (values = {})
{
    Record (values, ['position', 'rotation', 'scale'], 'primitive transform');
    const transform = {
        position : Vector (values.position === undefined ? [0, 0, 0] : values.position, 'Local position (mm)', -StudioLimits.positionMm, StudioLimits.positionMm),
        rotation : Vector (values.rotation === undefined ? [0, 0, 0] : values.rotation, 'Local rotation (degrees)', -36000, 36000),
        scale : Vector (values.scale === undefined ? [1, 1, 1] : values.scale, 'Local scale', -1000, 1000)
    };
    if (transform.scale.some (component => Math.abs (component) < .0001)) { throw new Error ('Local scale must be nonzero, with absolute components of at least 0.0001.'); }
    return transform;
}
export function ValidateStudioMatrix (matrix)
{
    if (!Array.isArray (matrix) || matrix.length !== 16) { throw new Error ('A modeling transform needs a 16-value column-major matrix.'); }
    matrix = Array.from (matrix, value => NumberIn (value, -1000000000, 1000000000, 'Transform matrix value'));
    if (matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) { throw new Error ('Modeling transforms must be affine matrices.'); }
    const determinant = matrix[0] * (matrix[5] * matrix[10] - matrix[6] * matrix[9]) - matrix[4] * (matrix[1] * matrix[10] - matrix[2] * matrix[9]) + matrix[8] * (matrix[1] * matrix[6] - matrix[2] * matrix[5]);
    if (!Number.isFinite (determinant) || Math.abs (determinant) < 1e-18) { throw new Error ('Modeling transforms must be nonsingular.'); }
    return matrix;
}
function Operation (value)
{
    if (!StudioOperations.includes (value)) { throw new Error ('Choose union, subtract or intersect.'); }
    return value;
}
function Node (input)
{
    const kind = input?.kind;
    const keys = kind === 'primitive' ? ['id', 'kind', 'name', 'type', 'parameters', 'material', 'transform'] : kind === 'transform' ? ['id', 'kind', 'name', 'input', 'matrix'] : kind === 'boolean' ? ['id', 'kind', 'name', 'left', 'right', 'operation', 'enabled'] : null;
    if (!keys) { throw new Error ('Unknown modeling node kind.'); }
    Record (input, keys, 'modeling node');
    const id = Identifier (input.id);
    if (kind === 'primitive') {
        const type = Type (input.type);
        return { id, kind, name : Name (input.name === undefined ? StudioPrimitives[type].label : input.name), type, parameters : Parameters (type, input.parameters), material : Material (input.material), transform : Transform (input.transform) };
    }
    if (kind === 'transform') { return { id, kind, name : Name (input.name === undefined ? 'Tool placement' : input.name), input : Identifier (input.input), matrix : ValidateStudioMatrix (input.matrix) }; }
    const enabled = input.enabled === undefined ? true : input.enabled;
    if (typeof enabled !== 'boolean') { throw new Error ('Choose whether the Boolean operation is enabled.'); }
    return { id, kind, name : Name (input.name === undefined ? 'Boolean' : input.name), left : Identifier (input.left), right : Identifier (input.right), operation : Operation (input.operation), enabled };
}
function References (node) { return node.kind === 'transform' ? [node.input] : node.kind === 'boolean' ? [node.left, node.right] : []; }

export function ValidateStudioDefinition (input)
{
    Record (input, ['schemaVersion', 'units', 'nodes', 'rootId', 'tipId'], '3Dstudio definition');
    if (input.schemaVersion !== StudioDefinitionVersion || input.units !== 'mm') { throw new Error ('Unsupported 3Dstudio definition version or units.'); }
    if (!Array.isArray (input.nodes) || !input.nodes.length || input.nodes.length > StudioLimits.nodes) { throw new Error ('A 3Dstudio model needs 1–' + StudioLimits.nodes + ' modeling nodes.'); }
    const nodes = Array.from (input.nodes, Node), map = new Map (nodes.map (node => [node.id, node]));
    if (map.size !== nodes.length) { throw new Error ('Modeling node IDs must be unique.'); }
    const rootId = Identifier (input.rootId), tipId = Identifier (input.tipId);
    if (!map.has (rootId) || !map.has (tipId)) { throw new Error ('The active and final modeling steps must exist.'); }
    // Validate every branch, including steps beyond a rolled-back output. A bad
    // hidden/future node must not become executable when the user resumes it.
    const state = new Map ();
    const visit = id => {
        if (!map.has (id)) { throw new Error ('A modeling step refers to a missing input.'); }
        if (state.get (id) === 1) { throw new Error ('Modeling history cannot contain a cycle.'); }
        if (state.get (id) === 2) { return; }
        state.set (id, 1); for (const reference of References (map.get (id))) { visit (reference); } state.set (id, 2);
    };
    for (const node of nodes) { visit (node.id); }
    const definition = { schemaVersion : StudioDefinitionVersion, units : 'mm', nodes, rootId, tipId };
    if (new TextEncoder ().encode (JSON.stringify (definition)).byteLength > StudioLimits.definitionBytes) { throw new Error ('The 3Dstudio authoring definition is too large.'); }
    return definition;
}

export function CreatePrimitiveDefinition (type = 'box', parameters = {}, options = {})
{
    Record (options, ['name', 'material', 'transform'], 'primitive creation option');
    const node = Node ({ id : 'primitive-1', kind : 'primitive', type, parameters, ...options });
    return ValidateStudioDefinition ({ schemaVersion : StudioDefinitionVersion, units : 'mm', nodes : [node], rootId : node.id, tipId : node.id });
}

export function UpdateStudioNode (input, nodeId, changes)
{
    const definition = ValidateStudioDefinition (input), node = definition.nodes.find (item => item.id === nodeId);
    if (!node) { throw new Error ('Choose an existing modeling step to edit.'); }
    const allowed = node.kind === 'primitive' ? ['name', 'type', 'parameters', 'material', 'transform'] : node.kind === 'transform' ? ['name', 'matrix'] : ['name', 'operation', 'enabled'];
    Record (changes, allowed, 'modeling edit');
    let next = { ...node, ...changes };
    if (node.kind === 'primitive') {
        const type = changes.type === undefined ? node.type : Type (changes.type);
        if (changes.parameters !== undefined) { Record (changes.parameters, Object.keys (StudioPrimitives[Type (type)].parameters), 'primitive parameter'); }
        if (changes.material !== undefined) { Record (changes.material, Object.keys (DefaultStudioMaterial), 'primitive material'); }
        if (changes.transform !== undefined) { Record (changes.transform, ['position', 'rotation', 'scale'], 'primitive transform'); }
        next = { ...next, type, parameters : { ...(type === node.type ? node.parameters : DefaultStudioParameters (type)), ...changes.parameters }, material : { ...node.material, ...changes.material }, transform : { ...node.transform, ...changes.transform } };
    }
    definition.nodes = definition.nodes.map (item => item.id === nodeId ? next : item);
    return ValidateStudioDefinition (definition);
}

export function SetStudioTip (input, nodeId = null)
{
    const definition = ValidateStudioDefinition (input);
    definition.rootId = nodeId === null ? definition.tipId : nodeId;
    return ValidateStudioDefinition (definition);
}

function NextId (taken, prefix)
{
    let index = 1;
    while (taken.has (prefix + '-' + index)) { index++; }
    const id = prefix + '-' + index; taken.add (id); return id;
}

export function CombineStudioDefinitionsWithMap (targetInput, toolInput, relativeMatrix, operation)
{
    const target = ValidateStudioDefinition (targetInput), tool = ValidateStudioDefinition (toolInput), matrix = ValidateStudioMatrix (relativeMatrix);
    Operation (operation);
    if (target.nodes.length + tool.nodes.length + 2 > StudioLimits.nodes) { throw new Error ('The combined history exceeds the ' + StudioLimits.nodes + '-node modeling limit.'); }
    const taken = new Set (target.nodes.map (node => node.id));
    const toolNodeIds = Object.fromEntries (tool.nodes.map (node => [node.id, NextId (taken, 'tool')]));
    const copied = tool.nodes.map (node => ({ ...node, id : toolNodeIds[node.id], ...(node.kind === 'transform' ? { input : toolNodeIds[node.input] } : node.kind === 'boolean' ? { left : toolNodeIds[node.left], right : toolNodeIds[node.right] } : {}) }));
    const placement = { id : NextId (taken, 'placement'), kind : 'transform', name : 'Tool placement', input : toolNodeIds[tool.rootId], matrix };
    const result = { id : NextId (taken, 'boolean'), kind : 'boolean', name : operation === 'union' ? 'Add solids' : operation === 'subtract' ? 'Subtract solid' : 'Intersect solids', left : target.rootId, right : placement.id, operation, enabled : true };
    return { definition : ValidateStudioDefinition ({ ...target, nodes : [...target.nodes, ...copied, placement, result], rootId : result.id, tipId : result.id }), toolNodeIds };
}

export function CombineStudioDefinitions (target, tool, relativeMatrix, operation)
{
    return CombineStudioDefinitionsWithMap (target, tool, relativeMatrix, operation).definition;
}
