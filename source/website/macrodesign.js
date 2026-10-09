export function CommandGroup (command)
{
    const parts = command.id.split ('.');
    if (parts[0] === 'animation') { return parts[1] === 'embedded' ? 'Imported clips' : parts[1] === 'keyframe' ? 'Keyframes' : 'Timeline'; }
    if (parts[0] === 'library') { return parts.includes ('folder') ? 'Folders' : 'Saved models'; }
    if (parts[0] === 'admin') { return 'Administration'; }
    if (parts[0] === 'auth') { return 'Sign-in and account'; }
    if (parts[0] === 'object') { return ['transform', 'dimension', 'drop_to_floor'].includes (parts[1]) ? 'Placement and size' : ['array', 'duplicate'].includes (parts[1]) ? 'Copies and arrays' : 'Selection and properties'; }
    return command.category;
}

export function StepSummary (command, args)
{
    if (command.id === 'object.array') { return `Array (${args.width} W × ${args.length} L × ${args.height} H)` + (args.layerRotation ? ` · alternate layers ${args.layerRotation}°` : ''); }
    if (command.id === 'object.transform') { return ['position', 'rotation', 'scale'].filter ((key) => args[key]).map ((key) => `${key === 'position' ? 'Move' : key === 'rotation' ? 'Rotate' : 'Scale'} (${Array.isArray (args[key]) ? args[key].join (', ') : 'previous result'})`).join (' · ') || command.title; }
    if (command.id === 'library.account.open') { return args.append ? 'Add saved model to scene' : 'Open saved model'; }
    return command.title;
}

export function EditMacro (macro, action, step, index)
{
    const next = JSON.parse (JSON.stringify (macro));
    if (next.version !== 1 || !Array.isArray (next.steps)) { throw new Error ('Use a version 1 macro.'); }
    if (action === 'add') {
        if (next.steps.length >= 100) { throw new Error ('A macro supports up to 100 steps.'); }
        let id = 1; while (next.steps.some ((item) => item.id === 'step' + id)) { id++; }
        next.steps.push ({ ...step, id : 'step' + id });
    } else {
        const at = next.steps.findIndex ((item) => item.id === step.id);
        if (at < 0) { throw new Error ('Step is unavailable.'); }
        if (action === 'remove') { next.steps.splice (at, 1); }
        else if (action === 'update') { next.steps[at] = { ...step, id : next.steps[at].id }; }
        else if (action === 'move') {
            if (!Number.isInteger (index) || index < 0 || index >= next.steps.length) { throw new Error ('Invalid step position.'); }
            next.steps.splice (index, 0, next.steps.splice (at, 1)[0]);
        } else { throw new Error ('Unknown macro edit.'); }
    }
    return next;
}
