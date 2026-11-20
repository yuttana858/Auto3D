import { ExpandSceneGroups, SelectedSceneGroups } from './scenegroups.js';

const GroupKeys = ['_auto3dGroup', '_auto3dGroupName', '_auto3dGroupKind'];

function Editable (editor)
{
    if (editor.readOnly || editor.busy || !editor.website.auth?.user || editor.website.accountReady === false) { throw new Error ('Choose an editable, idle signed-in session.'); }
}

function ValidateObjects (editor, objects)
{
    if (!Array.isArray (objects) || objects.some (object => !editor.document.objects.includes (object))) { throw new Error ('Select objects in the current session.'); }
    return [...new Set (objects)];
}

function GroupData (object)
{
    return Object.fromEntries (GroupKeys.filter (key => Object.hasOwn (object.userData || {}, key)).map (key => [key, object.userData[key]]));
}

function WriteGroupData (object, data)
{
    const next = { ...(object.userData || {}) };
    for (const key of GroupKeys) { delete next[key]; }
    object.userData = Object.assign (next, data);
}

function Selection (editor)
{
    const objects = editor.SelectedObjects (); return { objects, primary : objects.includes (editor.selected) ? editor.selected : null };
}

function RestoreSelection (editor, selection)
{
    editor.SetSelection (selection.objects, { mode : 'replace', expandGroups : false, primary : selection.primary });
}

function ChangeGroups (editor, records, selection)
{
    const document = editor.document, owner = editor.website.auth.user.id, previous = Selection (editor);
    const apply = forward => {
        Editable (editor);
        if (editor.document !== document || editor.website.auth.user.id !== owner || records.some (item => !document.objects.includes (item.object))) { throw new Error ('The group belongs to a different account or session.'); }
        const rollback = records.map (item => GroupData (item.object)), oldSelection = Selection (editor);
        try {
            for (const item of records) { WriteGroupData (item.object, forward ? item.after : item.before); }
            RestoreSelection (editor, forward ? selection : previous); editor.MarkDirty ();
        } catch (error) {
            records.forEach ((item, index) => WriteGroupData (item.object, rollback[index]));
            try { RestoreSelection (editor, oldSelection); } catch { /* Keep the original selection/render failure. */ }
            throw error;
        }
    };
    apply (true); editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) });
}

export function GroupSceneObjects (editor, objects = editor.SelectedObjects (), name = 'Group')
{
    Editable (editor); objects = ValidateObjects (editor, objects);
    if (typeof name !== 'string' || !name.trim () || name.trim ().length > 100) { throw new Error ('Use a group name of 1–100 characters.'); }
    // There is one grouping level. Selecting a member absorbs its whole existing
    // group so regrouping cannot leave an accidental partial array or assembly.
    objects = ExpandSceneGroups (editor.document.objects, objects);
    if (objects.length < 2) { throw new Error ('Select at least two editable objects.'); }
    const id = crypto.randomUUID (), after = { _auto3dGroup : id, _auto3dGroupName : name.trim (), _auto3dGroupKind : 'group' };
    const records = objects.map (object => ({ object, before : GroupData (object), after }));
    ChangeGroups (editor, records, { objects, primary : objects.includes (editor.selected) ? editor.selected : objects[0] });
    editor.Status?.('Grouped ' + objects.length + ' objects.');
    return { groupId : id, objectIds : objects.map (object => object.id) };
}

export function UngroupSceneObjects (editor, { arraysOnly = false, objects = editor.SelectedObjects () } = {})
{
    Editable (editor); objects = ValidateObjects (editor, objects);
    if (typeof arraysOnly !== 'boolean') { throw new Error ('Choose whether to ungroup only arrays.'); }
    const groups = SelectedSceneGroups (editor.document.objects, objects).filter (group => !arraysOnly || group.array);
    if (!groups.length) { throw new Error (arraysOnly ? 'Select an array group to ungroup.' : 'Select a group to ungroup.'); }
    const members = new Set (groups.flatMap (group => group.objects));
    const records = editor.document.objects.filter (object => members.has (object)).map (object => ({ object, before : GroupData (object), after : {} }));
    const selected = editor.document.objects.filter (object => members.has (object) || objects.includes (object));
    ChangeGroups (editor, records, { objects : selected, primary : selected.includes (editor.selected) ? editor.selected : selected[0] });
    editor.Status?.('Ungrouped ' + records.length + ' objects; placement preserved.');
    return { ungrouped : records.length, groupIds : groups.map (group => group.id), objectIds : records.map (item => item.object.id), arraysOnly };
}
