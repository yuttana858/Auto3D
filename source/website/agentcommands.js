import { CommandRegistry } from './commandregistry.js';
import { Theme } from './settings.js';
import { HexStringToRGBColor } from '../engine/model/color.js';
import { GetMaterialEntries } from './materialpanel.js';
import { Base64DataURIToArrayBuffer } from '../engine/io/bufferutils.js';

const text = { type : 'string' }; const number = { type : 'number' }; const boolean = { type : 'boolean' };
const vector = { type : 'array', minItems : 3, maxItems : 3, items : number };
const enumOf = (...values) => ({ type : 'string', enum : values });

export function CreateAgentCommands (website)
{
    const editor = website.sessionEditor;
    const registry = new CommandRegistry (editor);
    const object = (id) => {
        const selected = id ? editor.document.objects.find ((item) => item.id === id) : editor.selected;
        if (!selected) { throw new Error ('Select an object or supply a valid objectId.'); } return selected;
    };
    const describe = (item) => ({ id : item.id, name : item.name, visible : item.visible, position : [...item.position], rotation : [...item.rotation], scale : [...item.scale] });
    const add = (id, title, category, description, properties, required, mutates, handler, example = {}) => registry.Register ({ id, title, category, description, mutates, inputSchema : { type : 'object', properties, required, additionalProperties : false }, example }, handler);
    add ('scene.inspect', 'Inspect scene', 'Scene', 'Return all objects, selected object ID and loading state.', {}, [], false, () => ({ name : editor.document.name, objects : editor.document.objects.map (describe), selectedObjectId : editor.selected?.id || null }));
    add ('object.select', 'Select object', 'Objects', 'Select an object by its stable ID.', { objectId : text }, ['objectId'], false, ({ objectId }) => { const item = object (objectId); editor.Select (item); return describe (item); });
    add ('object.transform', 'Transform object', 'Objects', 'Set position in model units, rotation in degrees, and scale. Omitted vectors stay unchanged. Undo supported.', { objectId : text, position : vector, rotation : vector, scale : vector }, [], true, (args) => {
        const item = object (args.objectId); if (args.scale?.some ((value) => Math.abs (value) < 1e-6)) { throw new Error ('Scale components must be nonzero.'); }
        const before = { position : [...item.position], rotation : [...item.rotation], scale : [...item.scale] };
        for (const key of ['position', 'rotation', 'scale']) { if (args[key]) { item[key] = [...args[key]]; } }
        editor.Select (item); editor.ApplyTransform (item); editor.RecordTransform (item, before); editor.UpdateDetails (); return describe (item);
    }, { position : [0, 0, 0] });
    add ('object.duplicate', 'Duplicate object', 'Objects', 'Duplicate and select an object. Returns the new ID. Undo supported.', { objectId : text }, [], true, async (args) => { editor.Select (object (args.objectId)); await editor.Duplicate (); return describe (editor.selected); });
    add ('object.visibility', 'Set visibility', 'Objects', 'Explicitly show or hide an object. Undo supported.', { objectId : text, visible : boolean }, ['visible'], true, (args) => { const item = object (args.objectId); editor.Select (item); if (item.visible !== args.visible) { editor.ToggleVisibility (); } return describe (item); }, { visible : true });
    add ('object.delete', 'Delete object', 'Objects', 'Remove an object from this session. Recover with history.undo.', { objectId : text }, [], true, async (args) => { const item = object (args.objectId); editor.Select (item); await editor.Delete (); return { deletedId : item.id }; });
    add ('view.focus', 'Focus object', 'View', 'Frame an object in the viewport.', { objectId : text }, [], false, (args) => { editor.Select (object (args.objectId)); editor.Focus (); return { focusedId : editor.selected.id }; });
    add ('view.fit', 'Fit scene', 'View', 'Frame all visible objects.', {}, [], false, () => { website.FitModelToWindow (false); return { fitted : true }; });
    for (const [id, method] of [['history.undo', 'Undo'], ['history.redo', 'Redo']]) {
        add (id, method, 'History', 'Step through object edit history.', {}, [], true, async () => { await editor[method] (); return { undo : editor.history.undo.length, redo : editor.history.redo.length }; });
    }
    add ('view.background', 'Set background', 'View', 'Choose a viewport background preset.', { preset : enumOf ('standard', 'dark', 'light', 'sunset', 'outdoor') }, ['preset'], false, ({ preset }) => { website.ApplyBackgroundPreset (preset); return { preset }; }, { preset : 'dark' });
    add ('view.guides', 'Set viewport guides', 'View', 'Set horizon gradient and ground grid visibility.', { horizon : boolean, grid : boolean }, [], false, (args) => { if (args.horizon !== undefined) { website.settings.horizonGradient = args.horizon; } if (args.grid !== undefined) { website.settings.showGroundGrid = args.grid; } website.UpdateViewport (); website.lightingPanel.SyncControls (); return { horizon : website.settings.horizonGradient, grid : website.settings.showGroundGrid }; }, { horizon : true, grid : true });
    add ('lighting.inspect', 'Inspect lighting', 'Lighting', 'Return current environment and adjustments.', {}, [], false, () => website.lightingPanel.Capture ());
    add ('lighting.restore', 'Set lighting', 'Lighting', 'Apply a lighting configuration obtained from lighting.inspect.', { mode : enumOf ('default', 'hdri'), environment : text, brightness : { ...number, minimum : 0, maximum : 3 }, rotation : { ...number, minimum : -180, maximum : 180 }, elevation : { ...number, minimum : -90, maximum : 90 }, background : boolean }, ['mode'], false, async (args) => { await website.lightingPanel.Restore (args); return website.lightingPanel.Capture (); }, { mode : 'default' });
    add ('material.list', 'List materials', 'Materials', 'Return material indices, properties and assigned texture names.', {}, [], false, () => editor.document.model.materials.map ((item, index) => ({ index, name : item.name, color : item.color, opacity : item.opacity, roughness : item.roughness, metalness : item.metalness, maps : Object.fromEntries (Object.entries (item).filter (([key, value]) => key.endsWith ('Map') && value).map (([key, value]) => [key, value.name])) })));
    add ('material.set', 'Set material property', 'Materials', 'Set a numeric surface property for a material index; preserves UVs and textures.', { index : { ...number, minimum : 0 }, property : enumOf ('opacity', 'roughness', 'metalness', 'specularIntensity', 'bumpScale', 'normalScale', 'aoIntensity', 'displacementScale'), value : number }, ['index', 'property', 'value'], true, async ({ index, property, value }) => {
        const item = editor.document.model.materials[index]; if (!item || !Object.hasOwn (item, property)) { throw new Error ('Material or property is unavailable.'); }
        if (['opacity', 'roughness', 'metalness'].includes (property) && (value < 0 || value > 1)) { throw new Error ('Value must be between 0 and 1.'); }
        item[property] = value; if (property === 'opacity') { item.transparent = value < 1; } await editor.Render (); return { index, property, value };
    }, { index : 0, property : 'roughness', value : 0.4 });
    add ('material.color', 'Set base color', 'Materials', 'Set a material base color using six-digit hex. Preserves assigned maps.', { index : { ...number, minimum : 0 }, color : text }, ['index', 'color'], true, async ({ index, color }) => { const item = editor.document.model.materials[index]; if (!item || !/^#[0-9a-f]{6}$/i.test (color)) { throw new Error ('Use a valid material index and #RRGGBB color.'); } item.color = HexStringToRGBColor (color.slice (1)); item.multiplyDiffuseMap = true; await editor.Render (); return { index, color }; }, { index : 0, color : '#222222' });
    add ('preferences.theme', 'Set theme', 'Preferences', 'Apply and remember a light or dark theme.', { theme : enumOf ('light', 'dark') }, ['theme'], false, ({ theme }) => { website.SwitchTheme (theme === 'light' ? Theme.Light : Theme.Dark, true); return { theme }; }, { theme : 'dark' });
    add ('preferences.units', 'Set display units', 'Preferences', 'Apply metric or standard display units.', { units : enumOf ('metric', 'standard') }, ['units'], false, ({ units }) => { website.preferences.SetUnits (units); return { units }; }, { units : 'metric' });
    add ('material.texture', 'Replace texture image', 'Materials', 'Replace a material map from a PNG/JPEG/WebP base64 data URI. Retains UVs and map placement.', { index : { ...number, minimum : 0 }, slot : enumOf ('map', 'normalMap', 'bumpMap', 'emissiveMap', 'specularMap', 'aoMap', 'displacementMap', 'metalnessMap'), name : text, dataUri : text }, ['index', 'slot', 'name', 'dataUri'], true, async ({ index, slot, name, dataUri }) => {
        if (!/^data:image\/(png|jpeg|webp);base64,/.test (dataUri) || dataUri.length > 90 * 1024 * 1024) { throw new Error ('Supply a base64 PNG, JPEG or WebP under 64 MB.'); }
        const entry = GetMaterialEntries (website.viewer, editor.document.model, null).find ((item) => item.index === index);
        if (!entry) { throw new Error ('Material is not present in the scene.'); }
        const decoded = Base64DataURIToArrayBuffer (dataUri); const before = entry.material[slot]; const status = { textContent : '' };
        const originalSlot = slot === 'map' ? 'diffuseMap' : slot;
        await website.materialPanel.LoadTexture (entry, [slot, slot, originalSlot], new File ([decoded.buffer], name, { type : decoded.mimeType }), status);
        if (entry.material[slot] === before) { throw new Error (status.textContent || 'Texture replacement failed.'); }
        return { index, slot, name };
    });
    add ('macro.list', 'List saved macros', 'Macros', 'Return macros stored in this browser.', {}, [], false, () => { const macros = JSON.parse (localStorage.getItem ('auto3d-macros-v1') || '[]'); if (!Array.isArray (macros)) { throw new Error ('Invalid macro storage.'); } return macros; });
    add ('macro.save', 'Save macro', 'Macros', 'Save a named version 1 macro locally. Definition is a JSON string; matching names are replaced.', { name : text, definition : text }, ['name', 'definition'], false, ({ name, definition }) => {
        const macro = JSON.parse (definition); if (!name.trim () || macro.version !== 1 || !Array.isArray (macro.steps) || !macro.steps.length || macro.steps.length > 100) { throw new Error ('Enter a name and a version 1 macro with 1–100 steps.'); }
        const macros = JSON.parse (localStorage.getItem ('auto3d-macros-v1') || '[]'); if (!Array.isArray (macros)) { throw new Error ('Invalid macro storage.'); }
        const next = macros.filter ((item) => item.name !== name.trim ()); next.push ({ name : name.trim (), macro }); localStorage.setItem ('auto3d-macros-v1', JSON.stringify (next)); return { name : name.trim (), steps : macro.steps.length };
    });
    add ('ui.materials', 'Open material editor', 'Panels', 'Open the material editor for the selected object.', {}, [], false, () => { if (!website.materialPanel.entries.length) { throw new Error ('Load and select a model first.'); } website.materialPanel.Open (); return { opened : true }; });
    add ('ui.library', 'Open library', 'Panels', 'Open the saved-model library.', {}, [], false, async () => { await editor.library.Open (); return { opened : true }; });
    add ('ui.save', 'Open save dialog', 'Panels', 'Ask the user where to save. This command opens a dialog; it does not publish.', {}, [], false, () => { editor.library.SaveDialog (true); return { opened : true }; });
    return registry;
}
