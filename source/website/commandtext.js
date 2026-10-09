const aliases = {
    fit : 'view.fit', 'fit all' : 'view.fit', 'fit model' : 'view.fit',
    focus : 'view.focus', 'focus model' : 'view.focus',
    undo : 'history.undo', redo : 'history.redo',
    duplicate : 'object.duplicate', 'duplicate model' : 'object.duplicate',
    delete : 'object.delete', 'delete model' : 'object.delete',
    'drop to floor' : 'object.drop_to_floor', 'drop model to floor' : 'object.drop_to_floor',
    library : 'ui.library', save : 'ui.save', commands : 'ui.commands', macros : 'ui.commands',
    ai : 'ui.ai', packaging : 'ui.ai.packaging', array : 'ui.array', 'array model' : 'ui.array',
    'add model' : 'ui.add_model', 'update model' : 'ui.update_model', export : 'ui.export'
};

export function ParseCommandText (input)
{
    if (typeof input !== 'string' || !input.trim () || input.length > 2000) { throw new Error ('Enter a command, up to 2,000 characters.'); }
    const text = input.trim ();
    const macro = text.match (/^(?:run\s+)?macro\s+(.+)$/i);
    if (macro) { return { macroName : macro[1].trim () }; }
    const phrases = text.split (';').map (part => part.trim ());
    if (phrases.length > 100 || phrases.some (part => !part)) { throw new Error ('Separate up to 100 commands with semicolons.'); }
    const steps = phrases.map ((phrase, index) => {
        const normalized = phrase.toLowerCase ().replace (/\s+/g, ' ');
        let command; let args = {};
        const array = normalized.match (/^array(?: model)?\s+(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)$/);
        const tool = normalized.match (/^(select|move|rotate|scale)(?: model)?$/);
        if (array) {
            const counts = array.slice (1).map (Number);
            if (counts.some (count => count < 1 || count > 20) || counts.reduce ((a, b) => a * b) > 1000) { throw new Error ('Array counts must be 1–20 with at most 1,000 objects.'); }
            command = 'object.array'; args = { width : counts[0], length : counts[1], height : counts[2] };
        } else if (tool) {
            command = 'object.tool'; args = { mode : tool[1] === 'move' ? 'translate' : tool[1] };
        } else if (/^(hide|show)(?: model)?$/.test (normalized)) {
            command = 'object.visibility'; args = { visible : normalized.startsWith ('show') };
        } else { command = aliases[normalized]; }
        if (!command) { throw new Error ('Unknown command: ' + phrase + '. Try array model 4x4x6, fit, undo, or commands.'); }
        return { id : 'step' + (index + 1), command, arguments : args };
    });
    return { macro : { version : 1, steps } };
}

export async function ExecuteCommandText (registry, input)
{
    const parsed = ParseCommandText (input);
    let macro = parsed.macro;
    if (parsed.macroName) {
        const saved = await registry.Invoke ('macro.list');
        const item = saved.find (entry => entry.name.toLowerCase () === parsed.macroName.toLowerCase ());
        if (!item) { throw new Error ('No saved macro named “' + parsed.macroName + '”. Open macros to save one first.'); }
        macro = item.macro;
    }
    const result = await registry.InvokeMacro (macro);
    if (!result.ok) { throw new Error (result.error?.message || 'Macro stopped after ' + result.completed.length + ' steps.'); }
    return result;
}
