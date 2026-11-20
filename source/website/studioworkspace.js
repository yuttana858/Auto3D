import * as THREE from 'three';
import { AgentError, ErrorCode } from '../../mcp/common.js';
import { CreatePrimitiveDefinition, ValidateStudioDefinition, UpdateStudioNode, SetStudioTip, CombineStudioDefinitionsWithMap } from '../../modules/3dstudio/src/definition.js';
import { Unit } from '../engine/model/unit.js';
import { StudioModel, StudioUnitFactor, PreserveStudioMaterials } from './studioadapter.js';
import { PlaceGeneratedObject } from './generatedplacement.js';

export const StudioDataKey = '_auto3dStudio';
const documentIds = new WeakMap (); let documentSequence = 0;
const copy = value => JSON.parse (JSON.stringify (value));

function Selection (editor) { return { primary : editor.selected, ids : [...(editor.selectedIds || (editor.selected ? [editor.selected.id] : []))] }; }
function Select (editor, selection)
{
    editor.selected = selection.primary && editor.document.objects.includes (selection.primary) ? selection.primary : null;
    editor.selectedIds = new Set (selection.ids.filter (id => editor.document.objects.some (object => object.id === id)));
}
function SelectionKey (editor) { return JSON.stringify ([editor.selected?.id || null, [...(editor.selectedIds || [])].sort ()]); }
function ObjectKey (object)
{
    // Rendering normalizes absent timeline tracks into empty arrays. Those
    // defaults are the same authoring state, not a concurrent scene edit.
    return JSON.stringify ([object.id, object.name, object.visible, object.position, object.rotation, object.scale, object.userData, object.hiddenParts || [], object.keyframes || [], object.visibilityKeys || []]);
}
function Definition (object)
{
    if (!object?.userData?.[StudioDataKey]) { throw AgentError ('invalid_arguments', 'Select a 3Dstudio solid. Other modules keep their own editable geometry.'); }
    try { return ValidateStudioDefinition (JSON.parse (object.userData[StudioDataKey])); }
    catch (error) { throw AgentError ('invalid_arguments', 'Invalid saved 3Dstudio history: ' + error.message); }
}
function Input (value, keys)
{
    if (!value || typeof value !== 'object' || Array.isArray (value) || Object.keys (value).some (key => !keys.includes (key))) { throw AgentError ('invalid_arguments', 'Use supported 3Dstudio action fields.'); }
}
function Editable (workspace)
{
    const website = workspace.panel.website, editor = website.sessionEditor;
    if (!website.auth?.user?.id || website.accountReady === false || editor.readOnly) { throw AgentError ('permission_required', 'Open an editable, signed-in session.'); }
    if (workspace.active || editor.busy || workspace.panel.Blocked?.()) { throw AgentError ('conflict', 'Wait for the current scene operation.'); }
}
function WorldMatrixMm (object, unit)
{
    const factor = StudioUnitFactor (unit);
    for (const key of ['position', 'rotation', 'scale']) { if (!Array.isArray (object[key]) || object[key].length !== 3 || !object[key].every (Number.isFinite)) { throw AgentError ('invalid_arguments', 'The selected solid has an invalid scene transform.'); } }
    const matrix = new THREE.Matrix4 ().compose (new THREE.Vector3 (...object.position.map (value => value * factor)), new THREE.Quaternion ().setFromEuler (new THREE.Euler (...object.rotation.map (THREE.MathUtils.degToRad))), new THREE.Vector3 (...object.scale));
    if (!Number.isFinite (matrix.determinant ()) || Math.abs (matrix.determinant ()) < 1e-18) { throw AgentError ('invalid_arguments', 'The selected solid has a singular scale.'); }
    return matrix;
}
async function RenderStudio (panel, guard = () => {})
{
    const website = panel.website, editor = website.sessionEditor, viewer = website.viewer;
    const document = editor.document, owner = website.auth?.user?.id;
    let camera = null, pivot = null;
    const capture = () => { guard (); camera = viewer?.GetCamera?.()?.Clone () || null; pivot = viewer?.navigation?.orbitCenter?.Clone () || null; };
    capture ();
    try { await editor.Render (false, capture); }
    finally { if (camera && editor.document === document && website.auth?.user?.id === owner) { viewer.SetCamera (camera); if (viewer.navigation) { viewer.navigation.orbitCenter = pivot; } } }
}

export class StudioWorkspace
{
    constructor (panel, evaluate) { this.panel = panel; this.evaluate = evaluate; this.active = false; this.operation = null; }
    Cancel () { if (this.operation) { this.operation.cancelled = true; } return { cancelled : Boolean (this.operation) }; }
    Selected (objectId)
    {
        const editor = this.panel.website.sessionEditor;
        const object = objectId === undefined ? editor.selected : editor.document.objects.find (item => item.id === objectId);
        if (!object || !editor.document.objects.includes (object)) { throw AgentError ('not_found', 'Choose a solid in the current session.'); }
        return { object, definition : Definition (object) };
    }
    Inspect ({ objectId } = {})
    {
        const website = this.panel.website, editor = website.sessionEditor, document = editor.document;
        if (!documentIds.has (document)) { documentIds.set (document, ++documentSequence); }
        const objects = [];
        for (const object of document.objects) { if (object.userData?.[StudioDataKey]) { try { Definition (object); objects.push ({ objectId : object.id, name : object.name, visible : object.visible !== false }); } catch { /* Malformed imported history is never offered as an editable solid. */ } } }
        let chosen = null;
        if (objectId !== undefined) { chosen = this.Selected (objectId); }
        else if (editor.selected?.userData?.[StudioDataKey]) { try { chosen = this.Selected (); } catch { /* Still expose other valid objects and the create controls. */ } }
        return { available : Boolean (chosen), objectId : chosen?.object.id || null, name : chosen?.object.name || null, definition : chosen?.definition || null, objects, selectedIds : [...(editor.selectedIds || [])], busy : this.active || editor.busy, units : 'mm', editContext : JSON.stringify ([documentIds.get (document), website.auth?.user?.id || null, SelectionKey (editor)]) };
    }
    async Create (args = {})
    {
        Input (args, ['type', 'parameters', 'material', 'transform', 'name']); Editable (this);
        const { type = 'box', parameters = {}, ...options } = args;
        const definition = this.Validate (() => CreatePrimitiveDefinition (type, parameters, options));
        return this.Commit ({ definition, name : definition.nodes[0].name });
    }
    async UpdateNode (args = {})
    {
        Editable (this); Input (args, ['objectId', 'nodeId', 'name', 'type', 'parameters', 'material', 'transform', 'matrix', 'operation', 'enabled']); const { objectId, nodeId, ...patch } = args;
        const { object, definition } = this.Selected (objectId);
        const next = this.Validate (() => UpdateStudioNode (definition, nodeId, patch));
        return this.Commit ({ definition : next, source : object, materialSources : [{ ...this.MaterialSource (object, definition), materialChanges : { [nodeId] : Object.keys (patch.material || {}) } }] });
    }
    async SetTip (args = {})
    {
        Input (args, ['objectId', 'nodeId']); Editable (this);
        const { object, definition } = this.Selected (args.objectId);
        const next = this.Validate (() => SetStudioTip (definition, args.nodeId ?? null));
        return this.Commit ({ definition : next, source : object, materialSources : [this.MaterialSource (object, definition)] });
    }
    async Boolean (args = {})
    {
        Input (args, ['operation', 'targetId', 'toolId', 'keepOperands', 'name']); Editable (this);
        const editor = this.panel.website.sessionEditor;
        const target = this.Selected (args.targetId);
        const other = (editor.SelectedObjects?.() || editor.document.objects.filter (object => editor.selectedIds?.has (object.id))).filter (object => object !== target.object);
        const toolId = args.toolId ?? (other.length === 1 ? other[0].id : null);
        if (!toolId) { throw AgentError ('invalid_arguments', 'Select two 3Dstudio solids, or provide the tool object ID.'); }
        const tool = this.Selected (toolId);
        if (target.object === tool.object) { throw AgentError ('invalid_arguments', 'Choose two different solids for a Boolean operation.'); }
        if (args.keepOperands !== undefined && typeof args.keepOperands !== 'boolean') { throw AgentError ('invalid_arguments', 'keepOperands must be true or false.'); }
        if (args.name !== undefined && (typeof args.name !== 'string' || !args.name.trim () || args.name.length > 80)) { throw AgentError ('invalid_arguments', 'Use a result name of 1–80 characters.'); }
        const unit = editor.document.model.GetUnit ();
        const relative = WorldMatrixMm (target.object, unit).invert ().multiply (WorldMatrixMm (tool.object, unit)).toArray ();
        // Multiplication can introduce tiny round-off in the affine bottom row.
        relative[3] = 0; relative[7] = 0; relative[11] = 0; relative[15] = 1;
        const combined = this.Validate (() => CombineStudioDefinitionsWithMap (target.definition, tool.definition, relative, args.operation));
        return this.Commit ({ definition : combined.definition, name : args.name?.trim () || combined.definition.nodes.find (node => node.id === combined.definition.rootId).name, placement : target.object, operands : [target.object, tool.object], keepOperands : args.keepOperands === true, materialSources : [this.MaterialSource (target.object, target.definition), this.MaterialSource (tool.object, tool.definition, combined.toolNodeIds)] });
    }
    Validate (action)
    {
        try { return action (); } catch (error) { if (ErrorCode (error)) { throw error; } throw AgentError ('invalid_arguments', error.message); }
    }
    MaterialSource (object, definition, nodeIds = {}) { return { model : this.panel.website.sessionEditor.document.CompactModel ([object], true), definition, materials : object.studioMaterials || {}, nodeIds }; }

    async Commit ({ definition, source = null, name, placement = null, operands = [], keepOperands = false, materialSources = [] })
    {
        Editable (this);
        const panel = this.panel, website = panel.website, editor = website.sessionEditor, target = editor.document, owner = website.auth.user.id, history = editor.history;
        const dependencies = [...new Set ([source, ...operands].filter (Boolean))];
        if (dependencies.some (object => object.hiddenParts?.length || object.animationAsset)) { throw AgentError ('invalid_arguments', 'Remove hidden mesh parts or imported animation before rebuilding this solid.'); }
        if (!source && target.objects.length >= 1000) { throw AgentError ('invalid_arguments', 'The session has reached its 1000-object limit.'); }
        const previousUnit = target.model.GetUnit (), unit = target.objects.length ? previousUnit : Unit.Millimeter;
        this.Validate (() => StudioUnitFactor (unit));
        const previous = Selection (editor), previousKey = SelectionKey (editor), beforeObjects = [...target.objects], index = source ? target.objects.indexOf (source) : target.objects.length;
        const fingerprints = new Map (dependencies.map (object => [object, ObjectKey (object)]));
        const visibility = operands.map (object => object.visible), meshCount = target.model.meshes.length, materialCount = target.model.materials.length;
        const beforeUndo = [...history.undo], beforeRedo = [...history.redo];
        const operation = { cancelled : false }; this.operation = operation; this.active = true; editor.busy = true;
        let object = null, applied = false, historyAttempted = false, afterObjects = null, afterFingerprints = null;
        const accountGuard = () => {
            if (operation.cancelled) { throw AgentError ('conflict', '3Dstudio modeling was canceled.'); }
            if (editor.document !== target || website.auth?.user?.id !== owner || website.accountReady === false || editor.readOnly || editor.history !== history) { throw AgentError ('conflict', 'The account or session changed during modeling.'); }
        };
        const guard = () => {
            accountGuard ();
            if (!applied) {
                if (SelectionKey (editor) !== previousKey || target.model.GetUnit () !== previousUnit || target.objects.length !== beforeObjects.length || target.objects.some ((item, at) => item !== beforeObjects[at]) || dependencies.some (item => ObjectKey (item) !== fingerprints.get (item))) { throw AgentError ('conflict', 'The selection or source solids changed during modeling.'); }
            } else if (editor.selected !== object || target.model.GetUnit () !== unit || target.objects.length !== afterObjects.length || target.objects.some ((item, at) => item !== afterObjects[at]) || [...afterFingerprints].some (([item, key]) => ObjectKey (item) !== key)) { throw AgentError ('conflict', 'The scene changed while displaying the solid.'); }
            if (history.undo.length !== beforeUndo.length || history.redo.length !== beforeRedo.length) { throw AgentError ('conflict', 'Scene history changed during modeling.'); }
        };
        const place = forward => {
            target.Remove (forward ? source : object);
            const add = forward ? object : source;
            if (add && !target.objects.includes (add)) { target.Restore (add, index); }
            operands.forEach ((item, at) => { item.visible = forward && !keepOperands ? false : visibility[at]; });
            if (forward) { target.model.SetUnit (unit); } else if (!target.objects.length) { target.model.SetUnit (previousUnit); }
        };
        const choose = forward => Select (editor, forward ? { primary : object, ids : source ? [...new Set ([...previous.ids, object.id])] : [object.id] } : previous);
        const refresh = () => { editor.RefreshButtons?.(); panel.Refresh?.(); };
        try {
            refresh ();
            const data = await this.evaluate (definition, guard); guard ();
            const model = this.Validate (() => StudioModel (data, unit)); const studioMaterials = PreserveStudioMaterials (model, definition, materialSources);
            object = target.AddImported (model, source?.name || name);
            object.studioMaterials = studioMaterials;
            if (source) {
                for (const key of ['id', 'name', 'source', 'visible', 'castShadow', 'receiveShadow']) { object[key] = source[key]; }
                object.userData = { ...source.userData };
                for (const key of ['keyframes', 'visibilityKeys']) { if (source[key]) { object[key] = copy (source[key]); } }
            }
            const located = source || placement;
            if (located) { for (const key of ['position', 'rotation', 'scale']) { object[key] = [...located[key]]; } target.ApplyTransform (object); }
            else { PlaceGeneratedObject (target, object); }
            object.userData[StudioDataKey] = JSON.stringify (definition);
            target.Remove (object); place (true); applied = true; choose (true);
            afterObjects = [...target.objects]; afterFingerprints = new Map ([object, ...operands].map (item => [item, ObjectKey (item)]));
            await RenderStudio (panel, guard); guard ();
            // Render rebuilds navigator selection; restore the exact selected ID set.
            choose (true);
            const apply = async forward => {
                if (editor.document !== target || website.auth?.user?.id !== owner || website.accountReady === false || editor.readOnly || editor.history !== history || this.active || editor.busy) { throw AgentError ('conflict', 'This modeling step requires its editable, idle original session.'); }
                if (operands.some (item => !target.objects.includes (item)) || !(forward ? source === null || target.objects.includes (source) : target.objects.includes (object))) { throw AgentError ('conflict', 'Restore the modeling inputs before changing this history step.'); }
                const oldSelection = Selection (editor), oldUnit = target.model.GetUnit (), oldVisibility = operands.map (item => item.visible);
                this.active = true; editor.busy = true;
                const check = () => { if (editor.document !== target || website.auth?.user?.id !== owner || website.accountReady === false || editor.readOnly) { throw AgentError ('conflict', 'The account or session changed during history restoration.'); } };
                try { place (forward); choose (forward); await RenderStudio (panel, check); check (); choose (forward); }
                catch (error) {
                    place (!forward); operands.forEach ((item, at) => { item.visible = oldVisibility[at]; }); target.model.SetUnit (oldUnit);
                    if (editor.document === target && website.auth?.user?.id === owner) { Select (editor, oldSelection); try { await RenderStudio (panel); } catch { /* Retain the first rendering error. */ } }
                    throw error;
                } finally { this.active = false; if (editor.document === target && editor.history === history && website.auth?.user?.id === owner) { editor.busy = false; } refresh (); }
            };
            // Focus is part of the transaction; a failure must not leave a committed Undo entry.
            if (!source && !placement) { editor.Focus?.(); website.viewer?.navigation?.FinishCameraMovement?.(); }
            let command;
            const restore = async forward => {
                try { await apply (forward); }
                catch (error) {
                    // SceneHistory removes a command before awaiting it. Keep
                    // a failed restoration retryable after its scene rollback.
                    if (!history.undo.includes (command) && !history.redo.includes (command)) { (forward ? history.redo : history.undo).push (command); }
                    throw error;
                }
            };
            command = { undo : () => restore (false), redo : () => restore (true) };
            historyAttempted = true; history.Push (command);
            editor.Status?.(source ? 'Updated 3Dstudio solid.' : 'Added 3Dstudio solid.');
            return { objectId : object.id, updated : Boolean (source), definition : copy (definition), units : 'mm', metrics : copy (data.statistics || {}), components : model.meshes.map (mesh => mesh.GetName ()), operandIds : operands.map (item => item.id), operandsHidden : operands.length > 0 && !keepOperands };
        } catch (error) {
            if (object) {
                if (applied) { place (false); } else { target.Remove (object); if (!target.objects.length) { target.model.SetUnit (previousUnit); } }
                if (editor.document === target && website.auth?.user?.id === owner) { Select (editor, previous); try { await RenderStudio (panel); Select (editor, previous); } catch { /* Preserve the original operation failure. */ } }
            }
            // Also handles an importer that failed after appending geometry but
            // before returning its object. Never truncate a concurrent import.
            if (target.objects.length === beforeObjects.length && target.objects.every ((item, at) => item === beforeObjects[at])) { target.model.meshes.length = meshCount; target.model.materials.length = materialCount; if (!target.objects.length) { target.model.SetUnit (previousUnit); } }
            if (historyAttempted) { history.undo = beforeUndo; history.redo = beforeRedo; }
            if (ErrorCode (error)) { throw error; }
            throw AgentError ('command_failed', error.message || '3Dstudio could not generate this solid.');
        } finally { if (this.operation === operation) { this.operation = null; this.active = false; if (editor.document === target && editor.history === history && website.auth?.user?.id === owner) { editor.busy = false; } } refresh (); }
    }
}
