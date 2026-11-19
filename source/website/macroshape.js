// Structural check for a version 1 macro, shared by the browser and the Pages API.
// The browser additionally checks that every command exists (CheckMacro); the server
// cannot see the command registry, so it only enforces shape and size.
export const MacroNamePattern = /^\S(?:.{0,98}\S)?$/s;
export const MacroMaxBytes = 65536;

export function ValidateMacroName (name)
{
    if (typeof name !== 'string' || !MacroNamePattern.test (name) || name.length > 100 || [...name].some (character => character.charCodeAt (0) < 32 || character.charCodeAt (0) === 127)) { throw new Error ('Macro names must be 1–100 characters without leading or trailing spaces.'); }
    return name;
}

export function ValidateMacroShape (macro)
{
    if (!macro || typeof macro !== 'object' || Array.isArray (macro) || macro.version !== 1 || !Array.isArray (macro.steps) || !macro.steps.length || macro.steps.length > 100) { throw new Error ('Use a version 1 macro with 1–100 steps.'); }
    if (Object.keys (macro).some (key => !['version', 'steps'].includes (key))) { throw new Error ('Macros may only contain version and steps.'); }
    const ids = new Set ();
    for (const step of macro.steps) {
        if (!step || typeof step !== 'object' || Array.isArray (step) || Object.keys (step).some (key => !['id', 'command', 'arguments'].includes (key))) { throw new Error ('Each macro step may only contain id, command and arguments.'); }
        if (typeof step.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test (step.id) || ids.has (step.id)) { throw new Error ('Each step needs a unique ID.'); }
        if (typeof step.command !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z0-9_]+){0,6}$/.test (step.command) || step.command.length > 100) { throw new Error ('Step ' + step.id + ' has an invalid command name.'); }
        if (step.arguments !== undefined && (!step.arguments || typeof step.arguments !== 'object' || Array.isArray (step.arguments))) { throw new Error ('Step ' + step.id + ' arguments must be an object.'); }
        ids.add (step.id);
    }
    if (new TextEncoder ().encode (JSON.stringify (macro)).length > MacroMaxBytes) { throw new Error ('Macros must be at most 64 KiB.'); }
    return macro;
}
