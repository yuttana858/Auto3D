import { CreateAutoPackPlan, AutoPackStyles } from '../../modules/packaging/src/autopackplan.js';
import { Unit } from '../engine/model/unit.js';
import { LoadPackagingModule, PackagingModel, PackagingUnitMM } from './packagingadapter.js';
import { AutoPackDefinition, AutoPackPlanInput } from './autopackfold.js';
import { CreateNestedPartitionPlan } from '../../modules/packaging/src/partitionnest.js';
import { BoardRectangle, PadPositions } from '../../modules/packaging/src/accessories.js';
import { AddBoardPiece } from './accessoriesworkspace.js';
import { ValidateFefco, DefaultFefco } from '../../modules/packaging/src/fefco.js';
import { PackSequencePlayback } from './autopacksequence.js';

// World-space bounds of an object's transformed triangles in canonical mm (doubles, never display-rounded).
// Shared by Auto Pack and Auto pallet.
// Accepts one object or several (an array group is measured as one combined box).
export function MeasureWorldBoundsMm (document, objects, factor, noun = 'object')
{
    const list = Array.isArray (objects) ? objects : [objects];
    let triangles = 0; for (const object of list) { object.node.EnumerateMeshIndices (index => { triangles += document.model.GetMesh (index).TriangleCount (); }); }
    if (triangles > 2000000) { throw new Error ('Simplify the ' + noun + ' below 2,000,000 triangles before fitting.'); }
    list.forEach (object => document.ApplyTransform (object));
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; let count = 0;
    document.CompactModel (list).EnumerateTriangleVertices ((...points) => {
        if (++count > 2000000) { throw new Error ('Simplify the ' + noun + ' below 2,000,000 triangles before fitting.'); }
        for (const point of points) { [point.x, point.y, point.z].forEach ((value, axis) => { const mm = value * factor; if (!Number.isFinite (mm)) { throw new Error ('The ' + noun + ' geometry has invalid coordinates.'); } min[axis] = Math.min (min[axis], mm); max[axis] = Math.max (max[axis], mm); }); }
    });
    const size = max.map ((value, axis) => value - min[axis]);
    if (!count || size.some (v => !Number.isFinite (v) || v <= 0)) { throw new Error ('Select a solid ' + noun + ' with three nonzero bounding dimensions.'); }
    return { min, max, size };
}

// RSC length is the longer horizontal side; report score spans on the world W = X / L = Z axes like the other rows.
const WorldScore = p => ({ width : p.swapped ? p.parameters.length : p.parameters.width, length : p.swapped ? p.parameters.width : p.parameters.length, height : p.parameters.height });

// Measure canonical, transformed geometry in doubles; never round the fitting dimensions for display.
export class AutoPackWorkspace
{
    constructor (packaging) { this.packaging = packaging; this.editor = packaging.editor; this.code = '0201'; }
    // Box styles come from the Packaging generator catalog, so a style added there is available to Auto Pack.
    Styles () { return AutoPackStyles ().map (style => ({ ...style, selected : style.code === this.code })); }
    SetStyle (code)
    {
        if (!AutoPackStyles ().some (style => style.code === code)) { throw new Error ('Choose a box style from the Packaging generator catalog.'); }
        this.code = code; this.editor.website.packagingPanel?.Refresh?.(); return { code, styles : this.Styles () };
    }
    // Re-measure the selection from its current geometry. Files without unit information (STL, OBJ and many older or
    // CAD exports) leave the scene's units unknown, which blocks every millimetre fit; units assigns the units the model
    // was authored in to such a scene, as one Undo step, so Auto Pack (and the other generators) can measure it.
    async RefreshBounds ({ units = null } = {})
    {
        const editor = this.editor, document = editor.document, names = { mm : Unit.Millimeter, cm : Unit.Centimeter, m : Unit.Meter, in : Unit.Inch, ft : Unit.Foot };
        let assigned = null;
        if (units !== null) {
            if (!Object.hasOwn (names, units)) { throw new Error ('Choose model units: mm, cm, m, in or ft.'); }
            this.packaging.Editable ();
            const before = document.model.GetUnit ();
            if (before !== Unit.Unknown && before !== names[units]) { throw new Error ('The scene already has units; Refresh bounds only assigns units to a scene that has none.'); }
            if (before === Unit.Unknown) {
                const objects = document.objects.filter (object => object.unit === undefined || object.unit === Unit.Unknown), apply = async unit => {
                    if (editor.document !== document) { throw new Error ('These units belong to another session.'); }
                    document.model.SetUnit (unit); objects.forEach (object => { object.unit = unit; }); await editor.Render?.(); editor.RefreshUI?.(); editor.website.packagingPanel?.Refresh?.();
                };
                await apply (names[units]); editor.history.Push ({ undo : () => apply (Unit.Unknown), redo : () => apply (names[units]) }); editor.MarkDirty?.();
                assigned = units;
            }
        }
        const result = this.Inspect ();
        return { ...result, unitsAssigned : assigned, message : assigned ? 'Assigned ' + assigned + ' to the scene and re-measured the selection.' : result.available ? 'Re-measured the selection.' : result.reason };
    }
    Measure (contents = null)
    {
        const editor = this.editor, object = editor.selected, document = editor.document;
        if (!object || !document.objects.includes (object) || object.visible === false) { throw new Error ('Select one visible product, or a group or array of products, to pack.'); }
        // A selected group or array is packed as one product: the carton fits around their combined bounds.
        // Packed contents (partitions and pads Auto Pack added) join the products in the fit.
        const selection = editor.SelectedObjects ? editor.SelectedObjects () : [object], objects = [...(selection.length ? selection : [object]), ...(contents || [])];
        if (!objects.includes (object)) { objects.unshift (object); }
        if (objects.length > 500) { throw new Error ('Select up to 500 products to pack together.'); }
        if (objects.some (item => item.visible === false)) { throw new Error ('Show every selected product before packing.'); }
        if (objects.some (item => item.userData?._auto3dAutoPack !== undefined)) { throw new Error ('Select the products, rather than their Auto Pack carton.'); }
        if (objects.some (item => item.userData?._auto3dPallet !== undefined)) { throw new Error ('Deselect the pallet before using Auto Pack.'); }
        if (objects.some (item => item.animationAsset || item.keyframes?.length || item.hiddenParts?.length)) { throw new Error ('Auto Pack requires complete static models. Remove animation or hidden parts before fitting.'); }
        const factor = PackagingUnitMM[document.model.GetUnit ()]; if (!factor) { throw new Error ('This scene has no units (common for STL, OBJ and older CAD exports). Choose the model units and press Refresh bounds.'); }
        const { min, max, size } = MeasureWorldBoundsMm (document, objects, factor, 'product');
        // Same board record and allowance factors as Generate with the inside basis. Every style uses the RSC (FEFCO
        // reference) body allowances; the plan adds each style's extra flap layers to the height itself.
        const thickness = this.packaging.generationBoard?.caliperMm ?? this.packaging.FefcoInspect ().thickness;
        let plan, reason, material = null;
        try { material = this.packaging.GenerationMaterial (ValidateFefco ({ ...DefaultFefco, code : this.code, thickness }), '0201'); plan = CreateAutoPackPlan ({ size, clearanceMm : .0254, material, code : this.code }); } catch (error) { reason = error.message; }
        const group = objects.length > 1 ? (object.userData?._auto3dGroupName || objects.length + ' products') : null;
        return { object, objects, name : group ? group + ' · ' + objects.length + ' products' : object.name, document, factor, bounds : { min, max }, size, plan, material, reason, origin : [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2] };
    }
    // Predicted contents and carton for the current selection, without changing the scene.
    ContentsPreview (options)
    {
        const m = this.Measure (), plan = this.PlanContents (m, options), t = plan.thickness, has = p => options.pads.includes (p) ? t : 0;
        const span = [0, 1, 2].map (a => plan.envelope.max[a] - plan.envelope.min[a]);
        const local = [span[0], span[1] + has ('bottom') + has ('top'), span[2] + has ('front') + has ('back')], size = [0, 0, 0];
        size[plan.lengthAxis] = local[0]; size[1] = local[1]; size[plan.widthAxis] = local[2];
        const fit = CreateAutoPackPlan ({ size, clearanceMm : .0254, material : m.material, code : this.code });
        return { board : plan.material.name, thicknessMm : t, pads : plan.pads.map (p => ({ position : p.position, lengthMm : p.length, acrossMm : p.across })),
            partitions : plan.partitions ? { layout : plan.partitions.layout, strips : plan.partitions.strips, requiredGapMm : plan.partitions.requiredGapMm, growthMm : plan.partitions.growthMm, moves : plan.partitions.moves.length, collapsedMm : plan.partitions.layers[0].set.collapsedMm } : null,
            packedMm : { width : size[0], length : size[2], height : size[1] }, insideMm : { ...fit.insideMm }, scoreMm : WorldScore (fit) };
    }
    Inspect (contentOptions = null)
    {
        try {
            const carton = this.editor.selected, saved = AutoPackDefinition (carton);
            if (saved) {
                const parameters = JSON.parse (carton.userData._auto3dFefco), p = CreateAutoPackPlan (AutoPackPlanInput (saved, parameters, carton.packagingProfile));
                const product = this.editor.document.objects.find (item => item.id === saved.productId);
                return { available : false, fitted : true, reason : 'Saved fit dimensions. Use Fold/Unfold carton to replay; select the product to create a new fit.', objectId : saved.productId, objectName : (saved.productIds?.length > 1 ? saved.productIds.length + ' products' : product?.name || 'Packed product') + ' · saved fit', units : 'mm', productMm : { ...p.productMm }, insideMm : { ...p.insideMm }, usableInsideMm : { ...p.usableInsideMm }, glueTabAllowanceMm : p.glueTabAllowanceMm, basis : p.basis, scoreMm : WorldScore (p), allowanceMm : { ...p.allowanceMm }, clearanceMm : saved.clearanceMm, thicknessMm : parameters.thickness };
            }
            const m = this.Measure (), p = m.plan;
            let contents = null;
            if (contentOptions) { try { const options = this.ContentsOptions (contentOptions); if (options.partitions || options.pads.length) { contents = this.ContentsPreview (options); } } catch (error) { contents = { reason : error.message }; } }
            if (!p) { return { available : false, reason : m.reason, code : this.code, unitsUnknown : false, objectId : m.object.id, objectIds : m.objects.map (item => item.id), objectName : m.name, units : 'mm', productMm : { width : m.size[0], length : m.size[2], height : m.size[1] }, contents }; }
            return { available : true, code : this.code, unitsUnknown : false, objectId : m.object.id, objectIds : m.objects.map (item => item.id), objectName : m.name, units : 'mm', productMm : { width : m.size[0], length : m.size[2], height : m.size[1] }, insideMm : { ...p.insideMm }, usableInsideMm : { ...p.usableInsideMm }, glueTabAllowanceMm : p.glueTabAllowanceMm, basis : p.basis, scoreMm : WorldScore (p), allowanceMm : { ...p.allowanceMm }, clearanceMm : .0254, thicknessMm : p.parameters.thickness, boardName : m.material?.name || this.packaging.generationBoard?.name || 'Current packaging caliper', contents };
        } catch (error) { return { available : false, reason : error.message, code : this.code, unitsUnknown : this.editor.document.model.GetUnit () === Unit.Unknown }; }
    }
    // What Auto Pack will put in the carton with the products: nested partitions between them and pads around them.
    ContentsOptions ({ pads = [], partitions = false, boardId, grade } = {})
    {
        if (!Array.isArray (pads) || pads.some (p => !PadPositions.includes (p)) || new Set (pads).size !== pads.length) { throw new Error ('Choose pad positions from bottom, top, front and back.'); }
        if (typeof partitions !== 'boolean') { throw new Error ('partitions must be true or false.'); }
        return { pads : PadPositions.filter (p => pads.includes (p)), partitions, boardId, grade };
    }
    // Plans contents in the carton frame (axis 0 = RSC length = longer horizontal side, 1 = up, 2 = width).
    PlanContents (m, options)
    {
        const f = m.factor, material = this.packaging.accessories.PadMaterial ({ boardId : options.boardId, grade : options.grade }, { material : m.material }), t = material.caliperMm;
        const lengthAxis = m.size[0] > m.size[2] ? 0 : 2, widthAxis = lengthAxis === 0 ? 2 : 0;
        const local = world => [world[lengthAxis], world[1], world[widthAxis]], toWorld = v => { const w = [0, v[1], 0]; w[lengthAxis] = v[0]; w[widthAxis] = v[2]; return w; };
        const boxes = m.objects.map (object => { const b = MeasureWorldBoundsMm (m.document, object, f, 'product'); return { id : object.id, min : local (b.min), max : local (b.max) }; });
        const partitions = options.partitions ? CreateNestedPartitionPlan ({ boxes, thickness : t }) : null;
        const envelope = partitions ? partitions.envelope : { min : [0, 1, 2].map (a => Math.min (...boxes.map (b => b.min[a]))), max : [0, 1, 2].map (a => Math.max (...boxes.map (b => b.max[a]))) };
        const front = options.pads.includes ('front') ? t : 0, back = options.pads.includes ('back') ? t : 0;
        const span = [0, 1, 2].map (a => envelope.max[a] - envelope.min[a]);
        // Vertical pads cover the envelope's long faces; horizontal pads cover the envelope plus the vertical pads.
        const pads = options.pads.map (position => position === 'front' || position === 'back'
            ? { position, upright : true, along : 'length', length : span[0], across : span[1], min : [envelope.min[0], envelope.min[1], position === 'front' ? envelope.min[2] - t : envelope.max[2]] }
            : { position, upright : false, along : 'length', length : span[0], across : span[2] + front + back, min : [envelope.min[0], position === 'bottom' ? envelope.min[1] - t : envelope.max[1], envelope.min[2] - front] });
        return { material, thickness : t, lengthAxis, widthAxis, toWorld, partitions, envelope, pads };
    }
    async PrepareContents (m, options)
    {
        const editor = this.editor, target = m.document, f = m.factor, plan = this.PlanContents (m, options), owner = editor.website.auth?.user?.id;
        const moved = [], added = [], firstIndex = target.objects.length;
        const unchanged = () => { if (editor.document !== target || editor.website.auth?.user?.id !== owner || editor.readOnly) { throw new Error ('The session changed while preparing Auto Pack contents.'); } };
        try {
            const module = await LoadPackagingModule (); unchanged ();
            const tag = data => JSON.stringify ({ version : 1, autoPack : true, thicknessMm : plan.thickness, boardName : plan.material.name, ...data });
            if (plan.partitions) {
                // Open the gaps: move whole columns and rows apart so each holds one partition.
                for (const move of plan.partitions.moves) {
                    const object = target.objects.find (o => o.id === move.id), before = [...object.position], offset = plan.toWorld (move.offset);
                    object.position = object.position.map ((v, i) => v + offset[i] / f); target.ApplyTransform (object); moved.push ({ object, before, after : [...object.position], offset });
                }
                const env = plan.partitions.envelope;
                for (const layer of plan.partitions.layers) {
                    for (const strip of layer.set.strips) {
                        const t = plan.thickness, min = strip.axis === 'length' ? [env.min[0], layer.baseMm, env.min[2] + strip.offsetMm - t / 2] : [env.min[0] + strip.offsetMm - t / 2, layer.baseMm, env.min[2]];
                        const object = AddBoardPiece (module, target, strip.profile, plan.material, { upright : true, runsAlongX : (strip.axis === 'length') === (plan.lengthAxis === 0), min : plan.toWorld (min) }, f, strip.profile.name, 'Auto Pack · partition');
                        object.userData = { _auto3dAccessory : tag ({ kind : 'partition', strip : strip.id, layer : layer.index + 1, slots : strip.slots }) }; added.push (object);
                    }
                }
            }
            for (const pad of plan.pads) {
                const name = pad.position[0].toUpperCase () + pad.position.slice (1) + ' pad · ' + Number (pad.length.toFixed (1)) + ' × ' + Number (pad.across.toFixed (1));
                const object = AddBoardPiece (module, target, BoardRectangle (name, plan.thickness, pad.length, pad.across), plan.material, { upright : pad.upright, runsAlongX : plan.lengthAxis === 0, min : plan.toWorld (pad.min) }, f, name, 'Auto Pack · pad');
                object.userData = { _auto3dAccessory : tag ({ kind : 'pad', position : pad.position, orientation : pad.upright ? 'vertical' : 'horizontal', lengthMm : pad.length, acrossMm : pad.across }) }; added.push (object);
            }
            unchanged ();
        } catch (error) { added.forEach (o => target.Remove (o)); moved.forEach (({ object, before }) => { object.position = before; target.ApplyTransform (object); }); throw error; }
        const apply = async forward => {
            if (editor.document !== target) { throw new Error ('These contents belong to another session.'); }
            moved.forEach (({ object, before, after }) => { object.position = [...(forward ? after : before)]; target.ApplyTransform (object); });
            if (forward) { added.forEach ((o, i) => target.Restore (o, firstIndex + i)); } else { added.forEach (o => target.Remove (o)); }
            await editor.Render?.(); editor.website.packagingPanel?.Refresh?.();
        };
        const entry = { undo : () => apply (false), redo : () => apply (true) }; editor.history.Push (entry);
        return { added, moved : moved.length, movedOffsets : moved.map (({ object, offset }) => ({ id : object.id, offset })), plan, rollback : async () => { await apply (false); const at = editor.history.undo.indexOf (entry); if (at >= 0) { editor.history.undo.splice (at, 1); } } };
    }
    // The assembly sequence for the packed result: products (at their packed, possibly spread positions), the pads and
    // partitions Auto Pack added, and the carton height. Offsets are planned in world millimetres.
    PackSequence (products, contents)
    {
        const f = products.factor, document = products.document, items = new Map (), bounds = object => { const b = MeasureWorldBoundsMm (document, object, f, 'product'); return { id : object.id, min : b.min, max : b.max }; };
        const productBoxes = products.objects.map (object => { items.set (object.id, object); return bounds (object); });
        const pads = [], partitions = [];
        for (const piece of contents?.added || []) {
            const data = JSON.parse (piece.userData._auto3dAccessory); items.set (piece.id, piece);
            if (data.kind === 'pad') { pads.push ({ ...bounds (piece), position : data.position }); } else { partitions.push ({ ...bounds (piece), layer : data.layer || 1 }); }
        }
        const spreads = (contents?.movedOffsets || []).map (move => ({ id : move.id, offset : move.offset }));
        const all = [...productBoxes, ...pads, ...partitions], top = Math.max (...all.map (b => b.max[1]));
        // Upright top flaps reach about the carton's shorter side above its walls (a full-overlap 0203 flap is that long).
        const reach = Math.min (products.plan.parameters.width, products.plan.parameters.length);
        return new PackSequencePlayback (this.editor, { products : productBoxes, pads, partitions, spreads, packedTopMm : top, flapReachMm : reach, closeLid : true, easing : this.editor.website.preferences?.motionEasing || 'smooth' }, items, f);
    }
    async Generate ({ duration = 14, ...contentOptions } = {})
    {
        this.packaging.Editable ();
        if (!Number.isFinite (duration) || duration < 1 || duration > 30) { throw new Error ('Animation duration must be 1–30 seconds.'); }
        const options = this.ContentsOptions (contentOptions); let contents = null, sequence = null;
        const editor = this.editor, products = this.Measure ();
        if (!products.plan) { throw new Error (products.reason); }
        const historyStart = editor.history.undo.length;
        if (options.partitions || options.pads.length) { contents = await this.PrepareContents (products, options); }
        let result;
        try {
            // Plan the assembly before the carton exists and hold its first frame (products in place, pieces hidden)
            // through every rebuild, so nothing appears packed before the animation starts.
            sequence = this.PackSequence ({ ...products, objects : products.objects }, contents); sequence.Frame (0);
            editor.motionOverride = () => sequence.Frame ();
            result = await this.Fit (duration, contents, sequence);
        }
        catch (error) { editor.motionOverride = null; sequence?.Reset (); if (contents) { await contents.rollback (); } throw error; }
        // One Undo step for the whole pack (contents, carton and fold) once the sequence completes.
        const operation = this.packaging.foldOperation;
        const finish = () => { if (editor.motionOverride) { editor.motionOverride = null; } sequence.Reset (); if (this.packaging.lastFold?.state === 'completed') { editor.history.Group (historyStart); } editor.RefreshButtons?.(); };
        if (operation?.completion) { operation.completion.then (finish, finish); } else { finish (); }
        this.sequence = sequence;
        // The packed contents belong to the new carton (the Accessories tab sees them as its accessories).
        for (const piece of contents?.added || []) { piece.userData._auto3dAccessory = JSON.stringify ({ ...JSON.parse (piece.userData._auto3dAccessory), cartonId : result.objectId }); }
        return result;
    }
    async Fit (duration, contents, sequence = null)
    {
        const editor = this.editor, m = this.Measure (contents?.added), target = m.document, previous = m.object, owner = editor.website.auth.user.id;
        if (!m.plan) { throw new Error (m.reason); }
        if (target.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const products = m.objects, transforms = () => JSON.stringify (products.map (item => [item.position, item.rotation, item.scale])), transform = transforms ();
        const unchanged = () => { if (editor.document !== target || editor.website.auth?.user?.id !== owner || editor.website.accountReady === false || editor.readOnly || products.some (item => !target.objects.includes (item)) || editor.selected !== previous || transform !== transforms ()) { throw new Error ('The product or session changed while preparing Auto Pack.'); } };
        let object; const before = target.packaging;
        const preparing = { source : previous, action : 'auto pack', stage : 'checking fit' }; this.packaging.foldOperation = preparing;
        editor.busy = true; editor.RefreshButtons?.();
        try {
            const module = await LoadPackagingModule (); unchanged ();
            // The carton is a generated FEFCO 0201 with the standard CAD profile and measurement layer.
            const profile = this.packaging.GenerationProfile (m.plan.parameters, { material : m.material, basis : 'inside' });
            const rig = module.CreateAutoPackRig ({ size : m.size, clearanceMm : .0254, material : m.material, code : this.code }, profile);
            const report = await module.InspectAutoPackFold (rig, async progress => { unchanged (); editor.Status?.('Auto Pack · checking clearance · ' + Math.round (progress * 100) + '%'); await new Promise (resolve => setTimeout (resolve, 0)); });
            unchanged (); if (!report.clear) { throw new Error ('This product and board cannot be packed without intersections. Choose a thinner board or another product.'); }
            const data = module.AutoPackFrame (rig, 0), model = PackagingModel (data, target.model.GetUnit ());
            object = target.AddImported (model, 'Auto Pack · ' + m.name); object.source = 'Auto Pack · FEFCO ' + data.parameters.code; object.packagingProfile = data.profile;
            object.position = m.origin.map (v => v / m.factor); object.rotation = [0, 0, 0]; object.scale = [1, 1, 1];
            object.userData = { _auto3dFefco : JSON.stringify (data.parameters), _auto3dPackagingState : 'flat', _auto3dAutoPack : JSON.stringify ({ version : 1, size : m.size, clearanceMm : .0254, productId : previous.id, productIds : products.map (item => item.id), productBounds : m.bounds, origin : m.origin, basis : 'engineering-inside' }) };
            target.ApplyTransform (object); target.packaging = data.profile; editor.selected = object; await editor.Render (true); editor.busy = true;
            if (editor.document !== target || editor.website.auth?.user?.id !== owner || editor.website.accountReady === false || editor.readOnly) { throw new Error ('The session changed during Auto Pack.'); }
            const index = target.objects.indexOf (object);
            const apply = async add => { if (editor.document !== target) { throw new Error ('This Auto Pack belongs to another session.'); } if (add) { target.Restore (object, index); target.packaging = data.profile; editor.selected = object; } else { target.Remove (object); target.packaging = before; editor.selected = target.objects.includes (previous) ? previous : null; } await editor.Render (); editor.website.packagingPanel?.Refresh (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); editor.MarkDirty?.();
        } catch (error) {
            if (object) { target.Remove (object); target.packaging = before; if (editor.document === target) { editor.selected = previous; await editor.Render (); } }
            throw error;
        } finally { if (this.packaging.foldOperation === preparing) { this.packaging.foldOperation = null; } editor.busy = false; editor.RefreshButtons?.(); editor.website.packagingPanel?.Refresh (); }
        const result = await this.packaging.AnimateFold (object.id, duration, { sequence });
        const pieces = contents?.added.length || 0, packed = products.length - pieces;
        const extra = contents ? ' with ' + [contents.plan.partitions && contents.plan.partitions.strips + ' partition strips', contents.plan.pads.length && contents.plan.pads.length + ' pads'].filter (Boolean).join (' and ') + (contents.moved ? '; ' + contents.moved + ' products moved apart to make room' : '') : '';
        return { ...result, productId : previous.id, productIds : products.map (item => item.id), contents : contents ? { pieces : contents.added.map (o => o.id), moved : contents.moved, board : contents.plan.material.name, thicknessMm : contents.plan.thickness, layout : contents.plan.partitions?.layout || null, growthMm : contents.plan.partitions?.growthMm || null } : null, clearanceMm : .0254, units : 'mm',
            message : 'Auto Pack · folding RSC around ' + (packed > 1 ? 'the ' + packed + ' selected products' : 'the product') + extra + '. Cancel restores the flat carton; Undo removes it' + (contents ? ', then Undo again removes the contents' : '') + '.' };
    }
}
