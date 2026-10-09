import { WorkspaceDialog } from './modellibrary.js';
export function OpenErrorLog (website)
{
    const log = website.errorLogs; const dialog = WorkspaceDialog ('Error logs'); dialog.classList.add ('error_log_dialog');
    const note = document.createElement ('p'); note.textContent = 'Recent errors and rendering diagnostics for this account in this browser tab. Up to 200 entries survive refresh; signing out clears them. Logs are not uploaded automatically. Credentials and request bodies are omitted.'; dialog.appendChild (note);
    const filter = document.createElement ('select'); filter.setAttribute ('aria-label', 'Log level'); for (const level of ['all', 'error', 'warning', 'info']) { filter.add (new Option (level === 'all' ? 'All entries' : level, level)); } dialog.appendChild (filter);
    const actions = document.createElement ('div'); dialog.appendChild (actions);
    for (const [label, action] of [['Review shadow state', () => { log.RecordShadow (website.sceneEffects.InspectShadows ()); }], ['Download error log', () => log.Download ()], ['Clear error log', () => log.Clear ()]]) { const button = document.createElement ('button'); button.textContent = label; button.onclick = action; actions.appendChild (button); }
    const list = document.createElement ('div'); list.className = 'error_log_entries'; list.setAttribute ('aria-live', 'polite'); dialog.appendChild (list);
    const render = () => { list.replaceChildren (); const entries = log.List (filter.value).entries; if (!entries.length) { list.textContent = 'No entries recorded.'; } for (const entry of [...entries].reverse ()) { const row = document.createElement ('details'); const summary = document.createElement ('summary'); summary.textContent = new Date (entry.timestamp).toLocaleTimeString () + ' · ' + entry.level + ' · ' + entry.source + ' · ' + entry.message + (entry.count > 1 ? ' (×' + entry.count + ')' : ''); row.appendChild (summary); const details = document.createElement ('pre'); details.textContent = entry.details || 'No additional details.'; row.appendChild (details); list.appendChild (row); } };
    filter.onchange = render; log.listeners.add (render); dialog.addEventListener ('close', () => log.listeners.delete (render), { once : true }); render (); return { opened : true };
}
