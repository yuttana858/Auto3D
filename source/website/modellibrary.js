import { LibraryCategories } from './sessionarchive.js';
import { CloudLibrary } from './cloudlibrary.js';
import { EnablePopupFade } from './popuptransition.js';

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
    EnablePopupFade (dialog);
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
        this.deviceStorage = new DeviceLibrary ();
        this.sharedStorage = new CloudLibrary ();
        this.storage = this.sharedStorage;
        this.category = 'All sessions';
    }

    SignInDialog (onSuccess)
    {
        const dialog = WorkspaceDialog ('Publisher sign-in');
        const form = document.createElement ('form'); form.className = 'workspace_save_form';
        const hint = document.createElement ('p'); hint.className = 'section_hint'; hint.textContent = 'Use a publisher account from this project’s Supabase Authentication users. Everyone can browse the library; sign-in is required to publish.';
        const email = document.createElement ('input'); email.type = 'email'; email.required = true; email.autocomplete = 'username'; email.placeholder = 'Email'; email.setAttribute ('aria-label', 'Publisher email');
        const password = document.createElement ('input'); password.type = 'password'; password.required = true; password.autocomplete = 'current-password'; password.placeholder = 'Password'; password.setAttribute ('aria-label', 'Publisher password');
        const revealLabel = document.createElement ('label'); revealLabel.className = 'password_visibility';
        const reveal = document.createElement ('input'); reveal.type = 'checkbox';
        reveal.addEventListener ('change', () => { password.type = reveal.checked ? 'text' : 'password'; });
        revealLabel.append (reveal, document.createTextNode ('Show password'));
        const status = document.createElement ('p'); status.setAttribute ('role', 'status');
        const submit = document.createElement ('button'); submit.type = 'submit'; submit.className = 'workspace_primary'; submit.textContent = 'Sign in';
        form.append (hint, email, password, revealLabel, status, submit);
        form.addEventListener ('submit', async (event) => {
            event.preventDefault (); submit.disabled = true;
            try { await this.sharedStorage.SignIn (email.value.trim (), password.value); password.value = ''; dialog.close (); if (onSuccess) { onSuccess (); } }
            catch (error) { status.textContent = error.message; password.value = ''; submit.disabled = false; }
        });
        dialog.appendChild (form);
    }

    SaveDialog (download = false)
    {
        if (this.editor.readOnly) { return; }
        const dialog = WorkspaceDialog ('Save session');
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
        const destinationLabel = document.createElement ('label'); destinationLabel.textContent = 'Destination';
        const destination = document.createElement ('select'); destination.setAttribute ('aria-label', 'Save destination'); destination.add (new Option ('Shared library', 'shared')); destination.add (new Option ('Device library (this browser)', 'device')); destination.add (new Option ('File on disk (.auto3d)', 'file')); destinationLabel.appendChild (destination);
        destination.value = download ? 'file' : this.storage === this.sharedStorage ? 'shared' : 'device';
        const hint = document.createElement ('p'); hint.className = 'section_hint';
        const updateHint = () => {
            hint.textContent = destination.value === 'file' ? (typeof window.showSaveFilePicker === 'function' ? 'Choose a folder and filename for a portable .auto3d session with materials, textures and your view.' : 'Download a portable .auto3d session. Your browser chooses the folder; enable “Ask where to save each file” in browser settings to choose a location.') : destination.value === 'shared' ? 'Shared saves are visible to anyone visiting this prototype. Sign-in required to publish. Maximum 64 MB.' : 'Stored in this browser on this device, not in a folder. Clearing site data removes these saves. Choose File on disk for a portable copy.';
            submit.textContent = destination.value === 'file' ? 'Save session file' : 'Save to library';
        };
        const status = document.createElement ('p'); status.className = 'section_hint'; status.setAttribute ('role', 'status');
        const submit = document.createElement ('button'); submit.className = 'workspace_primary'; submit.type = 'submit';
        destination.addEventListener ('change', updateHint); updateHint ();
        submit.disabled = !this.editor.document.objects.length;
        const open = document.createElement ('button'); open.type = 'button'; open.textContent = 'Open session file';
        open.addEventListener ('click', () => { dialog.close (); this.editor.OpenSessionFile (); });
        form.append (nameLabel, categoryLabel, kindLabel);
        form.appendChild (destinationLabel);
        form.append (hint, status, submit);
        if (download) { form.appendChild (open); }
        form.addEventListener ('submit', async (event) => {
            event.preventDefault (); if (!name.value.trim ()) { return; }
            if (destination.value === 'shared' && !this.sharedStorage.session) { this.SignInDialog (() => { status.textContent = 'Signed in. Press Save to library to publish.'; }); return; }
            submit.disabled = true; status.textContent = 'Preparing session…';
            try {
                let fileHandle = null;
                if (destination.value === 'file' && typeof window.showSaveFilePicker === 'function') {
                    fileHandle = await window.showSaveFilePicker ({ suggestedName : name.value.trim () + '.auto3d', types : [{ description : 'Auto3D session', accept : { 'application/octet-stream' : ['.auto3d'] } }] });
                }
                const objects = kind.value === 'model' ? [this.editor.selected] : this.editor.document.objects;
                const saved = this.editor.Archive (objects, kind.value, name.value.trim ());
                if (destination.value === 'file') {
                    if (fileHandle) {
                        const writable = await fileHandle.createWritable ();
                        try { await writable.write (saved); await writable.close (); }
                        catch (error) { await writable.abort ().catch (() => {}); throw error; }
                        this.editor.Status ('Session saved: ' + fileHandle.name);
                    } else {
                        this.editor.Download (saved, name.value.trim () + '.auto3d', 'application/octet-stream');
                        this.editor.Status ('Session downloaded.');
                    }
                } else {
                    const thumbnail = this.editor.Thumbnail (objects);
                    const storage = destination.value === 'shared' ? this.sharedStorage : this.deviceStorage;
                    await storage.Save ({ id : crypto.randomUUID (), name : name.value.trim (), category : category.value, kind : kind.value, updatedAt : new Date ().toISOString (), thumbnail, objects : objects.length, archive : new Blob ([saved], { type : 'application/octet-stream' }) });
                    this.editor.Status ('Saved to ' + destination.value + ' library: ' + name.value.trim ());
                }
                if (kind.value === 'session') { this.editor.document.name = name.value.trim (); this.editor.website.parameters.fileNameDiv.textContent = this.editor.document.name; }
                dialog.close ();
            } catch (error) { status.textContent = error.name === 'AbortError' ? 'Save canceled. Choose a destination to try again.' : error.message; submit.disabled = false; }
        });
        dialog.appendChild (form);
    }

    async Open ()
    {
        if (this.editor.readOnly) { return; }
        const dialog = WorkspaceDialog ('Model library'); dialog.classList.add ('library_dialog');
        const hint = document.createElement ('p'); hint.className = 'library_connection';
        dialog.appendChild (hint);
        const tabs = document.createElement ('div'); tabs.className = 'library_source_tabs'; dialog.appendChild (tabs);
        const signIn = document.createElement ('button'); signIn.textContent = this.sharedStorage.session ? 'Sign out' : 'Publisher sign-in';
        signIn.addEventListener ('click', async () => {
            if (this.sharedStorage.session) {
                try { await this.sharedStorage.SignOut (); signIn.textContent = 'Publisher sign-in'; } catch (error) { status.textContent = error.message; }
            } else { this.SignInDialog (() => { signIn.textContent = 'Sign out'; }); }
        });
        const shell = document.createElement ('div'); shell.className = 'library_shell';
        const categories = document.createElement ('nav'); categories.className = 'library_categories'; categories.setAttribute ('aria-label', 'Library categories');
        const body = document.createElement ('div'); body.className = 'library_body';
        const search = document.createElement ('input'); search.type = 'search'; search.placeholder = 'Search saved models and sessions'; search.setAttribute ('aria-label', 'Search library');
        const grid = document.createElement ('div'); grid.className = 'library_grid';
        grid.tabIndex = 0; grid.setAttribute ('role', 'region'); grid.setAttribute ('aria-label', 'Saved models and sessions');
        const status = document.createElement ('p'); status.setAttribute ('role', 'status'); status.className = 'section_hint';
        body.append (search, status, grid); shell.append (categories, body); dialog.appendChild (shell);
        const save = document.createElement ('button'); save.className = 'workspace_primary'; save.textContent = 'Save current session'; save.disabled = !this.editor.document.objects.length;
        save.addEventListener ('click', () => { dialog.close (); this.SaveDialog (); }); dialog.appendChild (save);
        let items = [];
        let urls = []; let generation = 0;
        const clearUrls = () => { urls.forEach (URL.revokeObjectURL); urls = []; };
        dialog.addEventListener ('close', () => { generation++; clearUrls (); });
        const render = () => {
            const current = ++generation; clearUrls ();
            grid.replaceChildren ();
            const filtered = items.filter ((item) => (this.category === 'All sessions' || item.category === this.category) && item.name.toLowerCase ().includes (search.value.toLowerCase ()));
            status.textContent = filtered.length ? filtered.length + ' saved item(s)' : 'No saved items here yet. Save a model or session to get started.';
            for (const item of filtered) {
                const card = document.createElement ('article'); card.className = 'library_card';
                const image = document.createElement ('img'); image.alt = item.name + ' preview';
                if (item.shared) {
                    this.sharedStorage.File (item.thumbnailPath).then ((blob) => { if (current === generation && dialog.isConnected) { const url = URL.createObjectURL (blob); urls.push (url); image.src = url; } }).catch (() => { image.alt = item.name + ' · Preview unavailable'; });
                } else { image.src = item.thumbnail; }
                const name = document.createElement ('h3'); name.textContent = item.name;
                const info = document.createElement ('p'); info.textContent = item.category + ' · ' + item.objects + ' object(s) · ' + new Date (item.updatedAt).toLocaleDateString ();
                const actions = document.createElement ('div'); actions.className = 'library_actions';
                for (const [title, append] of [['Open', false], ['Add', true]]) {
                    const button = document.createElement ('button'); button.textContent = title; button.setAttribute ('aria-label', title + ' ' + item.name);
                    button.title = append ? 'Add saved objects to the current session' : 'Open as a new session';
                    button.addEventListener ('click', async () => {
                        button.disabled = true;
                        try { await this.editor.OpenArchive (item.shared ? await this.sharedStorage.Archive (item) : await item.archive.arrayBuffer (), append); dialog.close (); }
                        catch (error) { status.textContent = error.message; button.disabled = false; }
                    });
                    actions.appendChild (button);
                }
                const share = document.createElement ('button'); share.textContent = 'Share'; share.setAttribute ('aria-label', 'Share ' + item.name);
                share.addEventListener ('click', () => {
                    if (!item.shared) { status.textContent = 'This save is on this device. Open it and save to Shared library to create a viewer link.'; return; }
                    const shared = WorkspaceDialog ('Share model'); const form = document.createElement ('div'); form.className = 'workspace_save_form';
                    const hint = document.createElement ('p'); hint.className = 'section_hint'; hint.textContent = 'Anyone with this link can view the saved session and play its animations. Editing tools are hidden.';
                    const input = document.createElement ('input'); input.readOnly = true; input.setAttribute ('aria-label', 'Shared viewer link'); input.value = this.sharedStorage.Share (item); input.addEventListener ('click', () => input.select ());
                    const copy = document.createElement ('button'); copy.textContent = 'Copy link'; copy.addEventListener ('click', async () => { try { await navigator.clipboard.writeText (input.value); copy.textContent = 'Copied'; } catch { input.select (); copy.textContent = 'Select and copy link'; } });
                    const link = document.createElement ('a'); link.href = input.value; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Open shared view';
                    form.append (hint, input, copy, link); shared.appendChild (form);
                });
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
        let loadGeneration = 0;
        const load = async () => {
            const request = ++loadGeneration; generation++; clearUrls (); grid.replaceChildren (); status.textContent = 'Loading saved models…';
            hint.textContent = this.storage === this.sharedStorage ? 'Shared library · Public viewing · Publisher sign-in to save' : 'Device library · Saved only in this browser';
            try { const saved = await this.storage.List (); if (request === loadGeneration && dialog.isConnected) { items = saved; render (); } }
            catch (error) { if (request === loadGeneration) { status.textContent = error.message; } }
        };
        for (const [label, storage] of [['Shared library', this.sharedStorage], ['Device library', this.deviceStorage]]) {
            const button = document.createElement ('button'); button.textContent = label; button.setAttribute ('aria-pressed', String (this.storage === storage));
            button.addEventListener ('click', () => { this.storage = storage; Array.from (tabs.children).filter ((other) => other !== signIn).forEach ((other) => { other.setAttribute ('aria-pressed', String (other === button)); }); load (); }); tabs.appendChild (button);
        }
        tabs.appendChild (signIn);
        await load ();
    }
}
