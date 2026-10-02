import { LibraryCategories } from './sessionarchive.js';

export class DeviceLibrary
{
    async Database ()
    {
        if (!this.database) {
            this.database = new Promise ((resolve, reject) => {
                const request = indexedDB.open ('sw-auto3d-library', 1);
                request.onupgradeneeded = () => request.result.createObjectStore ('saves', { keyPath : 'id' });
                request.onsuccess = () => resolve (request.result);
                request.onerror = () => reject (new Error ('Device storage is unavailable. Download your session instead.'));
            });
        }
        return this.database;
    }

    async Request (mode, operation)
    {
        const database = await this.Database ();
        return new Promise ((resolve, reject) => {
            const transaction = database.transaction ('saves', mode);
            const request = operation (transaction.objectStore ('saves'));
            transaction.oncomplete = () => resolve (request.result);
            transaction.onerror = transaction.onabort = () => reject (new Error ('Could not save to device storage. Download your session instead.'));
        });
    }

    async List () { const items = await this.Request ('readonly', (store) => store.getAll ()); return items.sort ((a, b) => b.updatedAt.localeCompare (a.updatedAt)); }
    async Save (item) { return this.Request ('readwrite', (store) => store.put (item)); }
    async Get (id) { return this.Request ('readonly', (store) => store.get (id)); }
}

export function WorkspaceDialog (title)
{
    const dialog = document.createElement ('dialog');
    dialog.className = 'workspace_dialog';
    dialog.setAttribute ('aria-label', title);
    const header = document.createElement ('div'); header.className = 'workspace_dialog_header';
    const heading = document.createElement ('h2'); heading.textContent = title;
    const close = document.createElement ('button'); close.textContent = '×'; close.setAttribute ('aria-label', 'Close ' + title);
    close.addEventListener ('click', () => dialog.close ()); header.append (heading, close); dialog.appendChild (header);
    dialog.addEventListener ('close', () => dialog.remove ());
    document.body.appendChild (dialog);
    dialog.showModal ();
    return dialog;
}

export class ModelLibrary
{
    constructor (editor)
    {
        this.editor = editor;
        this.storage = new DeviceLibrary ();
        this.category = 'All sessions';
    }

    SaveDialog (download = false)
    {
        const dialog = WorkspaceDialog (download ? 'Save session' : 'Save to library');
        const form = document.createElement ('form'); form.className = 'workspace_save_form';
        const nameLabel = document.createElement ('label'); nameLabel.textContent = 'Name';
        const name = document.createElement ('input'); name.setAttribute ('aria-label', 'Save name'); name.required = true; name.maxLength = 100;
        name.value = this.editor.document.name === 'Untitled session' && this.editor.selected ? this.editor.selected.name.replace (/\.[^.]+$/, '') : this.editor.document.name;
        nameLabel.appendChild (name);
        const categoryLabel = document.createElement ('label'); categoryLabel.textContent = 'Category';
        const category = document.createElement ('select'); category.setAttribute ('aria-label', 'Library category');
        LibraryCategories.forEach ((item) => category.add (new Option (item, item))); categoryLabel.appendChild (category);
        const kindLabel = document.createElement ('label'); kindLabel.textContent = 'Save';
        const kind = document.createElement ('select'); kind.setAttribute ('aria-label', 'Save contents');
        kind.add (new Option ('Entire session', 'session'));
        if (!download && this.editor.selected) { kind.add (new Option ('Selected model', 'model')); }
        kindLabel.appendChild (kind);
        const hint = document.createElement ('p'); hint.className = 'section_hint';
        hint.textContent = download ? 'A portable .auto3d file preserves objects, materials, textures and your view.' : 'Device library · Shared Supabase storage is awaiting connection.';
        const status = document.createElement ('p'); status.className = 'section_hint'; status.setAttribute ('role', 'status');
        const submit = document.createElement ('button'); submit.className = 'workspace_primary'; submit.type = 'submit'; submit.textContent = download ? 'Download session' : 'Save to library';
        submit.disabled = !this.editor.document.objects.length;
        const open = document.createElement ('button'); open.type = 'button'; open.textContent = 'Open session file';
        open.addEventListener ('click', () => { dialog.close (); this.editor.OpenSessionFile (); });
        form.append (nameLabel, categoryLabel, kindLabel, hint, status, submit);
        if (download) { form.appendChild (open); }
        form.addEventListener ('submit', async (event) => {
            event.preventDefault (); if (!name.value.trim ()) { return; }
            submit.disabled = true; status.textContent = 'Preparing session…';
            try {
                const objects = kind.value === 'model' ? [this.editor.selected] : this.editor.document.objects;
                const saved = this.editor.Archive (objects, kind.value, name.value.trim ());
                if (download) {
                    this.editor.Download (saved, name.value.trim () + '.auto3d', 'application/octet-stream');
                    this.editor.Status ('Session downloaded.');
                } else {
                    const thumbnail = this.editor.Thumbnail (objects);
                    await this.storage.Save ({ id : crypto.randomUUID (), name : name.value.trim (), category : category.value, kind : kind.value, updatedAt : new Date ().toISOString (), thumbnail, objects : objects.length, archive : new Blob ([saved], { type : 'application/octet-stream' }) });
                    this.editor.Status ('Saved to device library: ' + name.value.trim ());
                }
                if (kind.value === 'session') { this.editor.document.name = name.value.trim (); this.editor.website.parameters.fileNameDiv.textContent = this.editor.document.name; }
                dialog.close ();
            } catch (error) { status.textContent = error.message; submit.disabled = false; }
        });
        dialog.appendChild (form);
    }

    async Open ()
    {
        const dialog = WorkspaceDialog ('Model library'); dialog.classList.add ('library_dialog');
        const hint = document.createElement ('p'); hint.className = 'library_connection'; hint.textContent = 'Device saves · Shared library and viewer links await Supabase connection.';
        dialog.appendChild (hint);
        const shell = document.createElement ('div'); shell.className = 'library_shell';
        const categories = document.createElement ('nav'); categories.className = 'library_categories'; categories.setAttribute ('aria-label', 'Library categories');
        const body = document.createElement ('div'); body.className = 'library_body';
        const search = document.createElement ('input'); search.type = 'search'; search.placeholder = 'Search saved models and sessions'; search.setAttribute ('aria-label', 'Search library');
        const grid = document.createElement ('div'); grid.className = 'library_grid';
        const status = document.createElement ('p'); status.setAttribute ('role', 'status'); status.className = 'section_hint';
        body.append (search, status, grid); shell.append (categories, body); dialog.appendChild (shell);
        const save = document.createElement ('button'); save.className = 'workspace_primary'; save.textContent = 'Save current session'; save.disabled = !this.editor.document.objects.length;
        save.addEventListener ('click', () => { dialog.close (); this.SaveDialog (); }); dialog.appendChild (save);
        let items = [];
        const render = () => {
            grid.replaceChildren ();
            const filtered = items.filter ((item) => (this.category === 'All sessions' || item.category === this.category) && item.name.toLowerCase ().includes (search.value.toLowerCase ()));
            status.textContent = filtered.length ? filtered.length + ' saved item(s)' : 'No saved items here yet. Save a model or session to get started.';
            for (const item of filtered) {
                const card = document.createElement ('article'); card.className = 'library_card';
                const image = document.createElement ('img'); image.src = item.thumbnail; image.alt = item.name + ' preview';
                const name = document.createElement ('h3'); name.textContent = item.name;
                const info = document.createElement ('p'); info.textContent = item.category + ' · ' + item.objects + ' object(s) · ' + new Date (item.updatedAt).toLocaleDateString ();
                const actions = document.createElement ('div'); actions.className = 'library_actions';
                for (const [title, append] of [['Open', false], ['Add', true]]) {
                    const button = document.createElement ('button'); button.textContent = title; button.setAttribute ('aria-label', title + ' ' + item.name);
                    button.title = append ? 'Add saved objects to the current session' : 'Open as a new session';
                    button.addEventListener ('click', async () => {
                        button.disabled = true;
                        try { await this.editor.OpenArchive (await item.archive.arrayBuffer (), append); dialog.close (); }
                        catch (error) { status.textContent = error.message; button.disabled = false; }
                    });
                    actions.appendChild (button);
                }
                const share = document.createElement ('button'); share.textContent = 'Share'; share.setAttribute ('aria-label', 'Share ' + item.name);
                share.addEventListener ('click', () => { status.textContent = 'Viewer links require the shared Supabase library. This save is currently stored on this device.'; });
                actions.appendChild (share); card.append (image, name, info, actions); grid.appendChild (card);
            }
        };
        for (const name of ['All sessions', ...LibraryCategories]) {
            const button = document.createElement ('button'); button.textContent = name; button.setAttribute ('aria-pressed', String (name === this.category));
            button.addEventListener ('click', () => {
                this.category = name;
                for (const other of categories.children) { other.setAttribute ('aria-pressed', String (other === button)); }
                render ();
            }); categories.appendChild (button);
        }
        search.addEventListener ('input', render);
        try { items = await this.storage.List (); render (); }
        catch (error) { status.textContent = error.message; }
    }
}
