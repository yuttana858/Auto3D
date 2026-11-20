export function SceneGroups (objects)
{
    const groups = new Map ();
    for (const object of objects) {
        const id = object.userData?._auto3dGroup; if (!id) { continue; }
        if (!groups.has (id)) {
            const name = object.userData._auto3dGroupName || 'Group';
            groups.set (id, { id, name, array : false, objects : [] });
        }
        groups.get (id).objects.push (object);
    }
    for (const group of groups.values ()) {
        // New explicit kinds win over legacy display-name inference. In particular,
        // a user-created group named "Can array" is still an ordinary group.
        const kinds = group.objects.map (object => object.userData._auto3dGroupKind).filter (kind => ['group', 'array'].includes (kind));
        group.array = kinds.length ? kinds.includes ('array') : / array$/.test (group.name) || group.name.startsWith ('Array group of ');
        if (group.array && !group.name.startsWith ('Array group of ')) { group.name = 'Array group of ' + group.name.replace (/ array$/, ''); }
    }
    return [...groups.values ()];
}

export function SelectedSceneGroups (objects, selected)
{
    const ids = new Set (selected.map (object => object.userData?._auto3dGroup).filter (Boolean));
    return SceneGroups (objects).filter (group => ids.has (group.id));
}

export function ExpandSceneGroups (objects, selected)
{
    const members = new Set (selected), ids = new Set (selected.map (object => object.userData?._auto3dGroup).filter (Boolean));
    return objects.filter (object => members.has (object) || ids.has (object.userData?._auto3dGroup));
}
