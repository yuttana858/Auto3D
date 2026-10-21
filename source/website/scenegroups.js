export function SceneGroups (objects)
{
    const groups = new Map ();
    for (const object of objects) {
        const id = object.userData?._auto3dGroup; if (!id) { continue; }
        if (!groups.has (id)) {
            const name = object.userData._auto3dGroupName || 'Group'; const array = object.userData._auto3dGroupKind === 'array' || / array$/.test (name) || name.startsWith ('Array group of ');
            groups.set (id, { id, name : array ? name.startsWith ('Array group of ') ? name : 'Array group of ' + name.replace (/ array$/, '') : name, array, objects : [] });
        }
        groups.get (id).objects.push (object);
    }
    return [...groups.values ()];
}
