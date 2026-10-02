import { WorkspaceDialog } from './modellibrary.js';

export function OpenCommandPanel (website)
{
    const registry = website.commands;
    const dialog = WorkspaceDialog ('Commands and macros'); dialog.classList.add ('command_dialog');
    const shell = document.createElement ('div'); shell.className = 'command_shell';
    const catalog = document.createElement ('div'); catalog.className = 'command_catalog';
    const search = document.createElement ('input'); search.type = 'search'; search.placeholder = 'Search commands, categories, IDs'; search.setAttribute ('aria-label', 'Search commands');
    const list = document.createElement ('div'); list.className = 'command_list';
    const detail = document.createElement ('div'); detail.className = 'command_detail';
    let selected = registry.Catalog ()[0];
    const title = document.createElement ('h3'); const description = document.createElement ('p');
    const schema = document.createElement ('pre'); schema.className = 'command_schema';
    const args = document.createElement ('textarea'); args.rows = 5; args.setAttribute ('aria-label', 'Command arguments JSON');
    const run = document.createElement ('button'); run.textContent = 'Run command';
    const add = document.createElement ('button'); add.textContent = 'Add to macro';
    const output = document.createElement ('pre'); output.className = 'command_output'; output.setAttribute ('role', 'status');
    const show = (command) => { selected = command; title.textContent = command.id; description.textContent = command.description; schema.textContent = JSON.stringify (command.inputSchema, null, 2); args.value = JSON.stringify (command.example, null, 2); };
    const render = () => {
        list.replaceChildren ();
        for (const command of registry.Catalog (search.value)) {
            const button = document.createElement ('button'); button.textContent = command.category + ' · ' + command.title; button.title = command.id;
            button.addEventListener ('click', () => show (command)); list.appendChild (button);
        }
    };
    search.addEventListener ('input', render);
    run.addEventListener ('click', async () => {
        run.disabled = true;
        try { output.textContent = JSON.stringify (await registry.Execute (selected.id, JSON.parse (args.value)), null, 2); }
        catch (error) { output.textContent = error.message; }
        finally { run.disabled = false; }
    });
    const download = (value, name) => { const url = URL.createObjectURL (new Blob ([JSON.stringify (value, null, 2)], { type : 'application/json' })); const link = document.createElement ('a'); link.href = url; link.download = name; link.click (); window.setTimeout (() => URL.revokeObjectURL (url), 1000); };
    const exportCatalog = document.createElement ('button'); exportCatalog.textContent = 'Download command catalog'; exportCatalog.addEventListener ('click', () => download ({ apiVersion : 1, commands : registry.Catalog () }, 'auto3d-commands.json'));
    catalog.append (search, list, exportCatalog); detail.append (title, description, schema, args, run, add, output); shell.append (catalog, detail); dialog.appendChild (shell);
    const macros = document.createElement ('section'); macros.className = 'macro_editor';
    const heading = document.createElement ('h3'); heading.textContent = 'Macro builder';
    const hint = document.createElement ('p'); hint.textContent = 'Add commands above, edit their arguments, and reorder steps in JSON. Steps run in order and stop on failure. Completed changes remain; object edits support Undo. Use {"$ref":"step1.id"} to pass a result to a later step.';
    const name = document.createElement ('input'); name.placeholder = 'Macro name'; name.setAttribute ('aria-label', 'Macro name'); name.value = 'My macro';
    const saved = document.createElement ('select'); saved.setAttribute ('aria-label', 'Saved macros');
    const source = document.createElement ('textarea'); source.rows = 10; source.setAttribute ('aria-label', 'Macro JSON'); source.value = JSON.stringify ({ version : 1, steps : [{ id : 'step1', command : 'scene.inspect', arguments : {} }] }, null, 2);
    let library = [];
    try { const stored = JSON.parse (localStorage.getItem ('auto3d-macros-v1') || '[]'); if (Array.isArray (stored)) { library = stored; } } catch { /* Start a fresh local macro list. */ }
    const refresh = () => { saved.replaceChildren (new Option ('Choose a saved macro', '')); library.forEach ((item, index) => saved.add (new Option (item.name, String (index)))); };
    refresh ();
    saved.addEventListener ('change', () => { if (saved.value !== '') { const item = library[Number (saved.value)]; name.value = item.name; source.value = JSON.stringify (item.macro, null, 2); } });
    const save = document.createElement ('button'); save.textContent = 'Save macro on this device';
    save.addEventListener ('click', async () => {
        try { const macro = JSON.parse (source.value); if (!name.value.trim () || macro.version !== 1 || !Array.isArray (macro.steps)) { throw new Error ('Enter a name and a version 1 macro.'); }
            const result = await registry.Execute ('macro.save', { name : name.value.trim (), definition : source.value }); if (!result.ok) { throw new Error (result.error.message); }
            library = (await registry.Execute ('macro.list')).result; refresh (); output.textContent = 'Macro saved locally.';
        } catch (error) { output.textContent = error.message; }
    });
    const play = document.createElement ('button'); play.className = 'workspace_primary'; play.textContent = 'Run macro';
    play.addEventListener ('click', async () => {
        play.disabled = true; output.textContent = 'Running macro…';
        try { output.textContent = JSON.stringify (await registry.RunMacro (JSON.parse (source.value)), null, 2); }
        catch (error) { output.textContent = error.message; }
        finally { play.disabled = false; }
    });
    const stop = document.createElement ('button'); stop.textContent = 'Stop after current step'; stop.addEventListener ('click', () => { registry.Cancel (); });
    const exportMacro = document.createElement ('button'); exportMacro.textContent = 'Download macro'; exportMacro.addEventListener ('click', () => { try { download (JSON.parse (source.value), 'auto3d-macro.json'); } catch (error) { output.textContent = error.message; } });
    add.addEventListener ('click', () => {
        try { const macro = JSON.parse (source.value); let index = macro.steps.length + 1; while (macro.steps.some ((step) => step.id === 'step' + index)) { index++; } macro.steps.push ({ id : 'step' + index, command : selected.id, arguments : JSON.parse (args.value) }); source.value = JSON.stringify (macro, null, 2); }
        catch (error) { output.textContent = error.message; }
    });
    macros.append (heading, hint, name, saved, source, save, play, stop, exportMacro); dialog.appendChild (macros); show (selected); render ();
}
