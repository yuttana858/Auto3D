import { CaptureSummary } from './agentcapture.js';
import { WorkspaceDialog } from './modellibrary.js';
import { CommandGroup, StepSummary } from './macrodesign.js';

function Element (tag, text, parent)
{
    const node = document.createElement (tag); if (text) { node.textContent = text; } if (parent) { parent.appendChild (node); } return node;
}

function Section (title, parent, open = false)
{
    const section = Element ('details', '', parent); section.open = open; Element ('summary', title, section); return section;
}

function ArgumentForm (command, values, parent, website, changed = () => {})
{
    const fields = [];
    for (const [key, schema] of Object.entries (command.inputSchema.properties)) {
        const required = command.inputSchema.required.includes (key);
        const label = Element ('label', '', parent); label.className = 'command_field';
        const words = key.replace (/([A-Z])/g, ' $1'); const title = words.charAt (0).toUpperCase () + words.slice (1); Element ('span', title, label);
        const enabled = Element ('input', '', label); enabled.type = 'checkbox'; enabled.checked = required || values[key] !== undefined; enabled.hidden = required; enabled.setAttribute ('aria-label', 'Include ' + key);
        let inputs = [];
        const reference = values[key] && typeof values[key] === 'object' && !Array.isArray (values[key]);
        if (schema.enum || (key === 'objectId' && !reference) || (key === 'id' && command.id === 'library.account.open' && !reference)) {
            const input = Element ('select', '', label);
            const choices = schema.enum || (key === 'id' ? [] : website.sessionEditor.document.objects.map ((item) => ({ value : item.id, title : item.name })));
            if (!required) { input.add (new Option ('Current selection', '')); }
            choices.forEach ((item) => input.add (new Option (item.title || item, item.value || item)));
            if (values[key] && !choices.some ((item) => (item.value || item) === values[key])) { input.add (new Option (values[key], values[key])); }
            input.value = values[key] ?? ''; inputs = [input];
            if (key === 'id' && command.id === 'library.account.open') {
                website.commands.Execute ('library.account.list').then ((result) => { if (result.ok) { result.result.items.forEach ((item) => input.add (new Option (item.name, item.id))); } }).catch (() => { /* Keep the current ID available offline. */ });
            }
        } else if (schema.type === 'array' && !reference) {
            const row = Element ('div', '', label); row.className = 'command_vector';
            inputs = ['X', 'Y', 'Z'].map ((axis, index) => { const input = Element ('input', '', row); input.type = 'number'; input.step = 'any'; input.placeholder = axis; input.setAttribute ('aria-label', title + ' ' + axis); input.value = values[key]?.[index] ?? ''; return input; });
        } else {
            const input = Element ('input', '', label); input.type = reference ? 'text' : schema.type === 'boolean' ? 'checkbox' : schema.type === 'number' ? 'number' : 'text';
            if (schema.type === 'boolean' && !reference) { input.checked = values[key] ?? false; }
            else { input.value = reference ? JSON.stringify (values[key]) : values[key] ?? ''; }
            if (schema.type === 'number') { input.step = 'any'; if (schema.minimum !== undefined) { input.min = schema.minimum; } if (schema.maximum !== undefined) { input.max = schema.maximum; } }
            inputs = [input];
        }
        const sync = () => { inputs.forEach ((input) => { input.disabled = !enabled.checked; }); changed (); };
        enabled.addEventListener ('change', sync);
        inputs.forEach ((input) => { input.setAttribute ('aria-label', input.getAttribute ('aria-label') || title); input.disabled = !enabled.checked; input.addEventListener ('change', changed); });
        fields.push (() => {
            if (!enabled.checked) { return null; }
            let value;
            if (reference) { value = JSON.parse (inputs[0].value); }
            else if (schema.type === 'boolean') { value = inputs[0].checked; }
            else if (schema.type === 'array') { value = inputs.map ((input) => { if (input.value === '') { throw new Error ('Enter all ' + title + ' coordinates.'); } return Number (input.value); }); }
            else if (schema.type === 'number') { if (inputs[0].value === '') { throw new Error ('Enter ' + title + '.'); } value = Number (inputs[0].value); }
            else { value = inputs[0].value; }
            return [key, value];
        });
    }
    if (!fields.length) { Element ('p', 'No settings needed.', parent); }
    return () => Object.fromEntries (fields.map ((read) => read ()).filter (Boolean));
}

export function OpenCommandPanel (website)
{
    const registry = website.commands; const commands = registry.Catalog ();
    const dialog = WorkspaceDialog ('Commands and macros'); dialog.classList.add ('command_dialog');
    const account = Section ('Account inspection', dialog);
    Element ('p', 'View your current sign-in status without showing credentials.', account);
    const inspect = Element ('button', 'Refresh account status', account);
    const accountStatus = Element ('p', '', account); accountStatus.setAttribute ('role', 'status');
    inspect.onclick = async () => { const result = await registry.Execute ('auth.inspect'); accountStatus.textContent = result.ok ? (result.result.signedIn ? 'Signed in as ' + (result.result.user.name || result.result.user.email) : 'Signed out') : result.error.message; };
    const shell = Element ('div', '', dialog); shell.className = 'command_shell';
    const catalog = Element ('div', '', shell); catalog.className = 'command_catalog';
    const search = Element ('input', '', catalog); search.type = 'search'; search.placeholder = 'Search commands…'; search.setAttribute ('aria-label', 'Search commands');
    const list = Element ('div', '', catalog); list.className = 'command_list';
    const detail = Element ('div', '', shell); detail.className = 'command_detail';
    const output = Element ('p', '', dialog); output.className = 'command_output'; output.setAttribute ('role', 'status');
    const resultDetails = Section ('Advanced: last command result', dialog); const resultCode = Element ('pre', '', resultDetails); const capturePreview = Element ('div', '', dialog); capturePreview.setAttribute ('data-capture-preview', '');
    const showResult = (result) => {
        resultCode.textContent = CaptureSummary (result); capturePreview.replaceChildren ();
        const images = result.result?.content || result.completed?.flatMap ((step) => step.result?.content || []) || [];
        for (const item of images) { if (item.type !== 'image' || item.mimeType !== 'image/png') { continue; } const image = Element ('img', '', capturePreview); image.src = 'data:image/png;base64,' + item.data; image.alt = 'Auto3D capture'; image.style.maxWidth = '100%'; const link = Element ('a', 'Download capture', capturePreview); link.href = image.src; link.download = 'auto3d-capture.png'; }
    };
    const macros = Section ('Macro builder', dialog, true); macros.className = 'macro_editor';
    Element ('p', 'Build a sequence by adding commands. Edit each step below. Steps run in order and stop on failure; completed changes remain. Open Library item can open a model or add a saved pallet. Commands that open dialogs require separate user interaction.', macros);
    const name = Element ('input', '', macros); name.value = 'My macro'; name.setAttribute ('aria-label', 'Macro name');
    const saved = Element ('select', '', macros); saved.setAttribute ('aria-label', 'Saved macros');
    const steps = Element ('div', '', macros); steps.className = 'macro_steps';
    let macro = { version : 1, steps : [] }; let selected; let readArgs;
    const advanced = Section ('Advanced: macro code and export', macros);
    const source = Element ('textarea', '', advanced); source.rows = 8; source.setAttribute ('aria-label', 'Macro JSON');
    const apply = Element ('button', 'Apply code to visual steps', advanced);
    const download = (value, filename) => { const url = URL.createObjectURL (new Blob ([JSON.stringify (value, null, 2)], { type : 'application/json' })); const link = Element ('a'); link.href = url; link.download = filename; link.click (); window.setTimeout (() => URL.revokeObjectURL (url), 1000); };
    Element ('button', 'Download macro', advanced).onclick = () => download (macro, 'auto3d-macro.json');
    Element ('button', 'Download command catalog', advanced).onclick = () => download ({ apiVersion : 1, commands }, 'auto3d-commands.json');
    const edit = async (action, step, index) => {
        const result = await registry.Execute ('macro.design.edit', { definition : JSON.stringify (macro), action, step : JSON.stringify (step), ...(index === undefined ? {} : { index }) });
        if (!result.ok) { throw new Error (result.error.message); } macro = result.result.macro; renderSteps ();
    };
    const attempt = async (work) => { try { await work (); } catch (error) { output.textContent = error.message; } };
    const renderSteps = () => {
        source.value = JSON.stringify (macro, null, 2); steps.replaceChildren ();
        if (!macro.steps.length) { Element ('p', 'Choose a command and click Add to macro to begin.', steps); }
        macro.steps.forEach ((step, index) => {
            const command = commands.find ((item) => item.id === step.command);
            const card = Section ((index + 1) + '. ' + (command ? StepSummary (command, step.arguments || {}) : step.command), steps); card.className = 'macro_step';
            if (!command) { Element ('p', 'Unknown command. Remove this step or edit it in Advanced.', card); }
            else {
                const form = Element ('div', '', card);
                const read = ArgumentForm (command, step.arguments || {}, form, website);
                Element ('button', 'Update step', card).onclick = () => attempt (() => edit ('update', { ...step, arguments : read () }));
            }
            const up = Element ('button', 'Move up', card); up.disabled = index === 0; up.onclick = () => attempt (() => edit ('move', step, index - 1));
            const down = Element ('button', 'Move down', card); down.disabled = index === macro.steps.length - 1; down.onclick = () => attempt (() => edit ('move', step, index + 1));
            Element ('button', 'Remove step', card).onclick = () => attempt (() => edit ('remove', step));
        });
    };
    apply.onclick = () => attempt (() => { const next = JSON.parse (source.value); if (next.version !== 1 || !Array.isArray (next.steps) || next.steps.length > 100 || next.steps.some ((step) => !step || typeof step.id !== 'string' || typeof step.command !== 'string')) { throw new Error ('Use a version 1 macro with valid steps.'); } macro = next; renderSteps (); });
    const show = (command) => {
        selected = command; detail.replaceChildren (); Element ('h3', command.title, detail); Element ('p', command.description, detail);
        const form = Element ('div', '', detail); readArgs = ArgumentForm (command, command.example, form, website);
        const run = Element ('button', 'Run command', detail); run.onclick = () => attempt (async () => { run.disabled = true; try { const result = await registry.Execute (selected.id, readArgs ()); showResult (result); output.textContent = result.ok ? 'Completed: ' + command.title : result.error.message; } finally { run.disabled = false; } });
        Element ('button', 'Add to macro', detail).onclick = () => attempt (async () => { await edit ('add', { command : selected.id, arguments : readArgs () }); macros.open = true; });
        const technical = Section ('Advanced: command details', detail); Element ('pre', JSON.stringify ({ id : command.id, schema : command.inputSchema }, null, 2), technical);
    };
    const render = () => {
        list.replaceChildren (); const matches = registry.Catalog (search.value); const groups = new Map ();
        for (const command of matches) { if (!groups.has (command.category)) { groups.set (command.category, new Map ()); } const sub = groups.get (command.category); const group = CommandGroup (command); if (!sub.has (group)) { sub.set (group, []); } sub.get (group).push (command); }
        for (const [category, sub] of groups) { const section = Section (category, list, Boolean (search.value)); for (const [group, items] of sub) { const inner = Section (group + ' (' + items.length + ')', section, Boolean (search.value)); for (const command of items) { const button = Element ('button', command.title, inner); button.onclick = () => show (command); } } }
        if (!matches.length) { Element ('p', 'No commands match your search.', list); }
    };
    let library = [];
    const refresh = async () => { const result = await registry.Execute ('macro.list'); library = result.ok ? result.result : []; saved.replaceChildren (new Option ('Choose a saved macro', '')); library.forEach ((item, index) => saved.add (new Option (item.name, String (index)))); };
    saved.onchange = () => { if (saved.value !== '') { const item = library[Number (saved.value)]; name.value = item.name; macro = JSON.parse (JSON.stringify (item.macro)); renderSteps (); } };
    Element ('button', 'Save macro on this device', macros).onclick = () => attempt (async () => { const result = await registry.Execute ('macro.save', { name : name.value, definition : JSON.stringify (macro) }); if (!result.ok) { throw new Error (result.error.message); } await refresh (); output.textContent = 'Macro saved on this device.'; });
    const play = Element ('button', 'Run macro', macros); play.className = 'workspace_primary'; play.onclick = () => attempt (async () => { play.disabled = true; output.textContent = 'Running macro…'; try { const result = await registry.RunMacro (macro); showResult (result); output.textContent = result.ok ? 'Macro completed.' : result.error.message; } finally { play.disabled = false; } });
    Element ('button', 'Stop after current step', macros).onclick = () => registry.Cancel ();
    search.oninput = render; show (commands.find ((command) => command.id === 'object.array') || commands[0]); render (); renderSteps (); refresh ();
}
