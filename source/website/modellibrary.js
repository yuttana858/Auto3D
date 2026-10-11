import { AccountLibrary } from './accountlibrary.js';
import { LibraryCategories } from './sessionarchive.js';
import { CloudLibrary } from './cloudlibrary.js';
import { EnablePopupFade } from './popuptransition.js';

export async function RecoveryArchiveBuffer (archive)
{
    if (archive instanceof ArrayBuffer) { return archive.slice (0); }
    if (ArrayBuffer.isView (archive)) {
        return archive.buffer.slice (archive.byteOffset, archive.byteOffset + archive.byteLength);
    }
    if (typeof archive?.arrayBuffer === 'function') {
        return await archive.arrayBuffer ();
    }
    if (typeof Blob !== 'undefined' && archive instanceof Blob) {
        return await new Response (archive).arrayBuffer ();
    }
    throw new Error ('Recovery checkpoint data is unavailable.');
}

export function NormalizeLibraryPath (value)
{
    const segments = String (value || '').split ('/').map ((segment) => segment.trim ().replace (/[<>:"\\|?*]+/g, ' ').replace (/\s+/g, ' ').trim ().slice (0, 60)).filter (Boolean);
    return segments.slice (0, 8).join ('/');
}

export function LibraryPathParent (path)
{
    const normalized = NormalizeLibraryPath (path);
    const index = normalized.lastIndexOf ('/');
    return index < 0 ? '' : normalized.slice (0, index);
}

export function LibraryPathName (path)
{
    const normalized = NormalizeLibraryPath (path);
    const index = normalized.lastIndexOf ('/');
    return index < 0 ? normalized : normalized.slice (index + 1);
}

export function RenameLibraryPath (path, previous, next)
{
    const value = NormalizeLibraryPath (path);
    const oldPath = NormalizeLibraryPath (previous);
    const newPath = NormalizeLibraryPath (next);
    if (value === oldPath) { return newPath; }
    if (value.startsWith (oldPath + '/')) { return newPath + value.slice (oldPath.length); }
    return value;
}

export function ExpandLibraryPaths (paths)
{
    const expanded = new Set ();
    for (const value of paths || []) {
        let current = NormalizeLibraryPath (value);
        while (current) {
            expanded.add (current);
            current = LibraryPathParent (current);
        }
    }
    expanded.add ('Uncategorized');
    return Array.from (expanded).sort ((a, b) => a.localeCompare (b, undefined, { numeric : true, sensitivity : 'base' }));
}

export class DeviceLibrary
{
    async Database ()
    {
        if (!this.database) {
            this.database = new Promise ((resolve, reject) => {
                const request = indexedDB.open (this.accountId ? 'sw-auto3d-library-' + this.accountId : 'sw-auto3d-library', 1);
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

    async List ()
    {
        const items = await this.Request ('readonly', (store) => store.getAll ());
        return items.filter ((item) => !String (item.id).startsWith ('__auto3d_')).sort ((a, b) => String (b.updatedAt || '').localeCompare (String (a.updatedAt || '')));
    }

    async Save (item) { return this.Request ('readwrite', (store) => store.put (item)); }
    async Get (id) { return this.Request ('readonly', (store) => store.get (id)); }
    async Remove (id) { return this.Request ('readwrite', (store) => store.delete (id)); }

    async WriteBatch (records = [], deleteIds = [])
    {
        const database = await this.Database ();
        return new Promise ((resolve, reject) => {
            const transaction = database.transaction ('saves', 'readwrite');
            const store = transaction.objectStore ('saves');
            records.forEach ((record) => store.put (record));
            deleteIds.forEach ((id) => store.delete (id));
            transaction.oncomplete = () => resolve ();
            transaction.onerror = transaction.onabort = () => reject (new Error ('Could not update device library.'));
        });
    }

    async Folders ()
    {
        const [meta, items] = await Promise.all ([this.Get ('__auto3d_folders__'), this.List ()]);
        const paths = new Set ((meta?.paths?.length ? meta.paths : LibraryCategories).map (NormalizeLibraryPath).filter (Boolean));
        paths.add ('Uncategorized');
        for (const item of items) {
            let path = NormalizeLibraryPath (item.category);
            if (!path) { path = 'Uncategorized'; }
            while (path) {
                paths.add (path);
                path = LibraryPathParent (path);
            }
        }
        return Array.from (paths).sort ((a, b) => a.localeCompare (b, undefined, { numeric : true, sensitivity : 'base' }));
    }

    async SaveFolders (paths)
    {
        const normalized = ExpandLibraryPaths (paths);
        await this.Save ({ id : '__auto3d_folders__', paths : normalized, updatedAt : new Date ().toISOString () });
        return this.Folders ();
    }

    async AddFolder (path)
    {
        const normalized = NormalizeLibraryPath (path);
        if (!normalized) { throw new Error ('Enter a category or project folder name.'); }
        const folders = await this.Folders ();
        let current = normalized;
        while (current) {
            if (!folders.includes (current)) { folders.push (current); }
            current = LibraryPathParent (current);
        }
        await this.SaveFolders (folders);
        return normalized;
    }

    async RenameFolder (previous, next)
    {
        const oldPath = NormalizeLibraryPath (previous);
        const newPath = NormalizeLibraryPath (next);
        if (!oldPath || !newPath || oldPath === 'Uncategorized') { throw new Error ('Choose a folder that can be renamed.'); }
        if (newPath === oldPath || newPath.startsWith (oldPath + '/')) { throw new Error ('A folder cannot be renamed inside itself.'); }
        const [folders, items] = await Promise.all ([this.Folders (), this.List ()]);
        const renamedFolders = folders.map ((path) => RenameLibraryPath (path, oldPath, newPath));
        const changed = items.filter ((item) => NormalizeLibraryPath (item.category) === oldPath || NormalizeLibraryPath (item.category).startsWith (oldPath + '/'));
        for (const item of changed) {
            item.category = RenameLibraryPath (item.category, oldPath, newPath);
            item.updatedAt = new Date ().toISOString ();
        }
        await this.WriteBatch ([...changed, { id : '__auto3d_folders__', paths : ExpandLibraryPaths (renamedFolders), updatedAt : new Date ().toISOString () }]);
        return newPath;
    }

    async DeleteFolder (path)
    {
        const target = NormalizeLibraryPath (path);
        if (!target || target === 'Uncategorized') { throw new Error ('Uncategorized cannot be deleted.'); }
        const [folders, items] = await Promise.all ([this.Folders (), this.List ()]);
        const destination = LibraryPathParent (target) || 'Uncategorized';
        const remaining = folders.filter ((folder) => folder !== target && !folder.startsWith (target + '/'));
        remaining.push (destination, 'Uncategorized');
        const changed = items.filter ((item) => {
            const folder = NormalizeLibraryPath (item.category);
            return folder === target || folder.startsWith (target + '/');
        });
        for (const item of changed) {
            item.category = destination;
            item.updatedAt = new Date ().toISOString ();
        }
        await this.WriteBatch ([...changed, { id : '__auto3d_folders__', paths : ExpandLibraryPaths (remaining), updatedAt : new Date ().toISOString () }]);
        return destination;
    }

    async MoveMany (ids, category)
    {
        const folder = await this.AddFolder (category || 'Uncategorized');
        const selected = new Set (ids);
        const items = (await this.List ()).filter ((item) => selected.has (item.id));
        const now = new Date ().toISOString ();
        items.forEach ((item) => { item.category = folder; item.updatedAt = now; });
        await this.WriteBatch (items);
    }

    async RemoveMany (ids)
    {
        await this.WriteBatch ([], Array.from (new Set (ids)));
    }

    async SaveRecovery (archive, name) { return this.Save ({ id : '__auto3d_recovery__', name, updatedAt : new Date ().toISOString (), archive : new Blob ([archive], { type : 'application/octet-stream' }) }); }
    async GetRecovery () { return this.Get ('__auto3d_recovery__'); }
    async ClearRecovery () { return this.Remove ('__auto3d_recovery__'); }
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
        this.accountStorage = new AccountLibrary (editor.website.auth);
        this.storage = this.deviceStorage;
        this.category = 'All sessions';
    }

    InitializeAccount (id)
    {
        if (this.deviceStorage.accountId === id) { return; }
        this.deviceStorage = new DeviceLibrary (); this.deviceStorage.accountId = id;
        this.storage = this.accountStorage; this.category = 'All sessions';
    }

    async SaveAccount (name, category = 'Uncategorized', kind = 'session')
    {
        if (this.editor.readOnly || (!this.editor.document.objects.length && !this.editor.document.packaging?.paths?.length)) { throw new Error ('Open an editable session to save.'); }
        const owner = this.editor.website.auth.user?.id;
        const objects = kind === 'model' ? [this.editor.selected] : this.editor.document.objects;
        if (kind === 'model' && !objects[0]) { throw new Error ('Select a model to save.'); }
        this.editor.Status ('Saving to account Library…');
        const archive = await this.editor.ArchiveAsync (objects, kind, name);
        if (!owner || this.editor.website.auth.user?.id !== owner) { throw new Error ('Sign in again before saving.'); }
        const item = await this.accountStorage.Save ({ name, category, kind, objects : objects.length, archive : new Blob ([archive]), thumbnail : this.editor.Thumbnail (objects) });
        if (kind === 'session') { this.editor.document.name = item.name; this.editor.website.parameters.fileNameDiv.textContent = item.name; await this.editor.MarkClean (); }
        this.editor.Status ('Saved to account Library: ' + item.name); return item;
    }

    FolderLabel (path)
    {
        const depth = NormalizeLibraryPath (path).split ('/').filter (Boolean).length - 1;
        return '  '.repeat (Math.max (0, depth)) + LibraryPathName (path);
    }

    async ChooseFolder (title, current = '')
    {
        const folders = await this.storage.Folders ();
        return new Promise ((resolve) => {
            const dialog = WorkspaceDialog (title);
            const form = document.createElement ('form'); form.className = 'workspace_save_form';
            const select = document.createElement ('select'); select.setAttribute ('aria-label', title);
            for (const folder of folders) { select.add (new Option (this.FolderLabel (folder), folder)); }
            select.value = folders.includes (current) ? current : 'Uncategorized';
            const add = document.createElement ('button'); add.type = 'button'; add.textContent = 'New nested folder…';
            add.addEventListener ('click', async () => {
                const base = select.value && select.value !== 'Uncategorized' ? select.value + '/' : '';
                const value = window.prompt ('New category/project path', base);
                if (value === null) { return; }
                try {
                    const path = await this.storage.AddFolder (value);
                    select.add (new Option (this.FolderLabel (path), path)); select.value = path;
                } catch (error) { window.alert (error.message); }
            });
            const confirm = document.createElement ('button'); confirm.type = 'submit'; confirm.className = 'workspace_primary'; confirm.textContent = 'Choose folder';
            const cancel = document.createElement ('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
            cancel.addEventListener ('click', () => { dialog.close (); resolve (null); });
            form.addEventListener ('submit', (event) => { event.preventDefault (); const value = select.value; dialog.close (); resolve (value); });
            dialog.addEventListener ('close', () => resolve (null), { once : true });
            form.append (select, add, confirm, cancel); dialog.appendChild (form);
        });
    }

    async SaveDialog (download = false)
    {
        if (this.editor.readOnly) { return; }
        let saveStorage = this.accountStorage;
        let folders = await saveStorage.Folders ().catch (() => ['Uncategorized']);
        const dialog = WorkspaceDialog ('Save session');
        const form = document.createElement ('form'); form.className = 'workspace_save_form';
        const nameLabel = document.createElement ('label'); nameLabel.textContent = 'Name';
        const name = document.createElement ('input'); name.setAttribute ('aria-label', 'Save name'); name.required = true; name.maxLength = 100;
        name.value = this.editor.document.name === 'Untitled session' && this.editor.selected ? this.editor.selected.name.replace (/\.[^.]+$/, '') : this.editor.document.name;
        nameLabel.appendChild (name);

        const categoryLabel = document.createElement ('label'); categoryLabel.textContent = 'Category / project folder';
        const category = document.createElement ('select'); category.setAttribute ('aria-label', 'Library category');
        const populateFolders = (selected = null) => {
            category.replaceChildren ();
            folders.sort ((a, b) => a.localeCompare (b, undefined, { numeric : true, sensitivity : 'base' })).forEach ((item) => category.add (new Option (this.FolderLabel (item), item)));
            category.add (new Option ('＋ New category / project…', '__new_folder__'));
            const preferred = selected || (this.category !== 'All sessions' && folders.includes (this.category) ? this.category : folders[0] || 'Uncategorized');
            category.value = preferred;
        };
        populateFolders ();
        category.addEventListener ('change', async () => {
            if (category.value !== '__new_folder__') { return; }
            const base = this.category !== 'All sessions' && this.category !== 'Uncategorized' ? this.category + '/' : '';
            const value = window.prompt ('New category/project path. Use / to create nested folders.', base);
            if (value === null) { populateFolders (); return; }
            try {
                const path = await saveStorage.AddFolder (value);
                if (!folders.includes (path)) { folders.push (path); }
                let parent = LibraryPathParent (path);
                while (parent) { if (!folders.includes (parent)) { folders.push (parent); } parent = LibraryPathParent (parent); }
                populateFolders (path);
            } catch (error) { window.alert (error.message); populateFolders (); }
        });
        categoryLabel.appendChild (category);

        const kindLabel = document.createElement ('label'); kindLabel.textContent = 'Save';
        const kind = document.createElement ('select'); kind.setAttribute ('aria-label', 'Save contents');
        kind.add (new Option ('Entire session', 'session'));
        if (!download && this.editor.selected) { kind.add (new Option ('Selected model', 'model')); }
        kindLabel.appendChild (kind);

        const destinationLabel = document.createElement ('label'); destinationLabel.textContent = 'Destination';
        const destination = document.createElement ('select'); destination.setAttribute ('aria-label', 'Save destination');
        destination.add (new Option ('Account library (private cloud)', 'account'));
        destination.add (new Option ('Device library (this browser)', 'device'));
        destination.add (new Option ('File on disk (.auto3d)', 'file'));
        destination.add (new Option ('Shared library (publishing disabled)', 'shared'));
        destination.value = download ? 'file' : 'account'; destinationLabel.appendChild (destination);

        const hint = document.createElement ('p'); hint.className = 'section_hint';
        const status = document.createElement ('p'); status.className = 'section_hint'; status.setAttribute ('role', 'status');
        const progress = document.createElement ('progress'); progress.className = 'save_progress'; progress.hidden = true; progress.setAttribute ('aria-label', 'Save progress'); progress.style.width = '100%';
        const submit = document.createElement ('button'); submit.className = 'workspace_primary'; submit.type = 'submit';
        const updateHint = () => {
            categoryLabel.hidden = destination.value === 'file';
            hint.textContent = destination.value === 'file'
                ? (typeof window.showSaveFilePicker === 'function' ? 'Choose a portable .auto3d filename and folder.' : 'Download a portable .auto3d session.')
                : destination.value === 'shared'
                    ? 'Corporate publishing remains disabled while identity transitions. Save to Device library or a file.'
                    : destination.value === 'account' ? 'Private to your account · Available on your other devices · Up to 32 MB per save.' : 'Choose any category/project folder. Nested folders use paths such as Project A/Concepts.';
            submit.textContent = destination.value === 'file' ? 'Save session file' : destination.value === 'shared' ? 'Publishing unavailable' : 'Save to library';
            submit.disabled = (!this.editor.document.objects.length && !this.editor.document.packaging?.paths?.length) || destination.value === 'shared';
        };
        destination.addEventListener ('change', async () => { saveStorage = destination.value === 'device' ? this.deviceStorage : this.accountStorage; updateHint (); if (destination.value === 'file' || destination.value === 'shared') { return; } try { folders = await saveStorage.Folders (); populateFolders (); updateHint (); } catch (error) { status.textContent = error.message + ' You can save to File on disk instead.'; submit.disabled = true; } }); updateHint ();

        const open = document.createElement ('button'); open.type = 'button'; open.textContent = 'Open session file';
        open.addEventListener ('click', () => { dialog.close (); this.editor.OpenSessionFile (); });

        form.append (nameLabel, categoryLabel, kindLabel, destinationLabel, hint, progress, status, submit);
        if (download) { form.appendChild (open); }

        form.addEventListener ('submit', async (event) => {
            event.preventDefault ();
            if (!name.value.trim () || destination.value === 'shared' || category.value === '__new_folder__') { return; }
            submit.disabled = true; progress.hidden = false; progress.removeAttribute ('value'); status.textContent = 'Preparing session…';
            await new Promise ((resolve) => requestAnimationFrame (() => requestAnimationFrame (resolve)));
            try {
                let fileHandle = null;
                if (destination.value === 'file' && typeof window.showSaveFilePicker === 'function') {
                    fileHandle = await window.showSaveFilePicker ({ suggestedName : name.value.trim () + '.auto3d', types : [{ description : 'Auto3D session', accept : { 'application/octet-stream' : ['.auto3d'] } }] });
                }
                const owner = this.editor.website.auth.user?.id;
                const objects = kind.value === 'model' ? [this.editor.selected] : this.editor.document.objects;
                const saved = await this.editor.ArchiveAsync (objects, kind.value, name.value.trim ());
                if (destination.value === 'file') {
                    if (fileHandle) {
                        const writable = await fileHandle.createWritable ();
                        try {
                            const bytes = saved instanceof ArrayBuffer ? new Uint8Array (saved) : new Uint8Array (saved.buffer, saved.byteOffset || 0, saved.byteLength);
                            const chunkSize = 4 * 1024 * 1024;
                            progress.max = Math.max (1, bytes.byteLength); progress.value = 0;
                            status.textContent = 'Saving ' + fileHandle.name + '…';
                            for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
                                const chunk = bytes.subarray (offset, Math.min (bytes.byteLength, offset + chunkSize));
                                await writable.write ({ type : 'write', position : offset, data : chunk });
                                progress.value = Math.min (bytes.byteLength, offset + chunk.byteLength);
                                await new Promise ((resolve) => requestAnimationFrame (resolve));
                            }
                            await writable.close ();
                        } catch (error) { await writable.abort ().catch (() => {}); throw error; }
                        status.textContent = 'Saved successfully: ' + fileHandle.name;
                        this.editor.Status ('Session saved: ' + fileHandle.name);
                    } else {
                        this.editor.Download (saved, name.value.trim () + '.auto3d', 'application/octet-stream');
                        status.textContent = 'Download started successfully.'; progress.max = 1; progress.value = 1; this.editor.Status ('Session downloaded.');
                    }
                } else {
                    if (!owner || this.editor.website.auth.user?.id !== owner) { throw new Error ('Account changed. Sign in before saving.'); }
                    const folder = await saveStorage.AddFolder (category.value || 'Uncategorized');
                    status.textContent = destination.value === 'account' ? 'Uploading to your account Library…' : 'Saving to device Library…';
                    const thumbnail = this.editor.Thumbnail (objects);
                    await saveStorage.Save ({
                        id : crypto.randomUUID (), name : name.value.trim (), category : folder, kind : kind.value,
                        updatedAt : new Date ().toISOString (), thumbnail, objects : objects.length,
                        archive : new Blob ([saved], { type : 'application/octet-stream' })
                    });
                    this.category = folder;
                    status.textContent = 'Saved successfully to ' + folder + '.'; progress.max = 1; progress.value = 1; this.editor.Status ('Saved to ' + folder + ': ' + name.value.trim ());
                }
                if (kind.value === 'session') {
                    this.editor.document.name = name.value.trim ();
                    this.editor.website.parameters.fileNameDiv.textContent = this.editor.document.name;
                    await this.editor.MarkClean ();
                }
                if (!progress.hasAttribute ('value')) { progress.max = 1; progress.value = 1; }
                await new Promise ((resolve) => setTimeout (resolve, 650));
                dialog.close ();
            } catch (error) {
                progress.hidden = true;
                status.textContent = error.name === 'AbortError' ? 'Save canceled.' : 'Save failed: ' + error.message;
                this.editor.Status (status.textContent);
                submit.disabled = false;
            }
        });
        dialog.appendChild (form);
    }

    OpenShareDialog (item)
    {
        const shared = WorkspaceDialog ('Share model');
        const form = document.createElement ('div'); form.className = 'workspace_save_form';
        const hint = document.createElement ('p'); hint.className = 'section_hint';
        hint.textContent = 'Create a read-only Auto3D viewer link for internal or external users. The viewer adapts to desktop, tablet and mobile screens.';
        const downloadLabel = document.createElement ('label'); downloadLabel.className = 'share_option';
        const allowDownload = document.createElement ('input'); allowDownload.type = 'checkbox';
        downloadLabel.append (allowDownload, document.createTextNode (' Allow .auto3d download'));
        const codeLabel = document.createElement ('label'); codeLabel.className = 'share_option';
        const requireCode = document.createElement ('input'); requireCode.type = 'checkbox';
        codeLabel.append (requireCode, document.createTextNode (' Require 4-digit access code'));
        const codeInput = document.createElement ('input'); codeInput.type = 'password'; codeInput.inputMode = 'numeric'; codeInput.pattern = '[0-9]{4}'; codeInput.maxLength = 4; codeInput.placeholder = '4-digit code'; codeInput.setAttribute ('aria-label', 'Four digit access code'); codeInput.hidden = true;
        requireCode.addEventListener ('change', () => { codeInput.hidden = !requireCode.checked; if (!requireCode.checked) { codeInput.value = ''; } else { codeInput.focus (); } });
        codeInput.addEventListener ('input', () => { codeInput.value = codeInput.value.replace (/\D/g, '').slice (0, 4); });
        const generate = document.createElement ('button'); generate.className = 'workspace_primary'; generate.textContent = 'Generate viewer link';
        const shareStatus = document.createElement ('p'); shareStatus.className = 'section_hint'; shareStatus.setAttribute ('role', 'status');
        const input = document.createElement ('input'); input.readOnly = true; input.hidden = true; input.setAttribute ('aria-label', 'Shared viewer link'); input.addEventListener ('click', () => input.select ());
        const copy = document.createElement ('button'); copy.textContent = 'Copy link'; copy.hidden = true;
        const link = document.createElement ('a'); link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Open mini viewer'; link.hidden = true;
        const qrButton = document.createElement ('button'); qrButton.textContent = 'Show QR code'; qrButton.hidden = true;
        const qrContainer = document.createElement ('div'); qrContainer.hidden = true; qrContainer.className = 'share_qr_container';
        qrContainer.style.cssText = 'width:max-content;max-width:100%;background:#fff;padding:16px;border-radius:12px;margin-top:8px;';
        const qrStatus = document.createElement ('p'); qrStatus.className = 'section_hint'; qrStatus.hidden = true;
        const qrSave = document.createElement ('button'); qrSave.textContent = 'Save QR as PNG'; qrSave.hidden = true;
        const loadQRLibrary = async () => {
            if (typeof window.QRCode === 'function') { return; }
            await new Promise ((resolve, reject) => {
                const script = document.createElement ('script'); script.src = '/assets/vendor/qrcode.min.js';
                script.onload = resolve; script.onerror = () => reject (new Error ('The QR generator is unavailable.'));
                document.head.appendChild (script);
            });
            if (typeof window.QRCode !== 'function') { throw new Error ('The QR generator is unavailable.'); }
        };
        qrButton.addEventListener ('click', async () => {
            qrButton.disabled = true; qrStatus.hidden = false; qrStatus.textContent = 'Preparing local QR code…';
            try {
                await loadQRLibrary (); qrContainer.replaceChildren ();
                new window.QRCode (qrContainer, { text : input.value, width : 224, height : 224, colorDark : '#102536', colorLight : '#ffffff', correctLevel : window.QRCode.CorrectLevel.H });
                qrContainer.hidden = false; qrSave.hidden = false;
                qrStatus.textContent = 'QR encodes the share link only. Share any separate access code securely.';
            } catch (error) { qrStatus.textContent = error.message; }
            finally { qrButton.disabled = false; }
        });
        qrSave.addEventListener ('click', () => {
            const canvas = qrContainer.querySelector ('canvas');
            const image = qrContainer.querySelector ('img');
            const href = canvas?.toDataURL ('image/png') || image?.src;
            if (!href) { qrStatus.hidden = false; qrStatus.textContent = 'QR image not ready yet.'; return; }
            const anchor = document.createElement ('a'); anchor.href = href; anchor.download = 'auto3d-share-qr.png'; anchor.click ();
        });
        generate.addEventListener ('click', async () => {
            if (requireCode.checked && !/^\d{4}$/.test (codeInput.value)) { shareStatus.textContent = 'Enter exactly four digits for the access code.'; codeInput.focus (); return; }
            generate.disabled = true; shareStatus.textContent = 'Creating secure viewer link…';
            try {
                const result = await this.sharedStorage.CreateShare (item, allowDownload.checked, requireCode.checked ? codeInput.value : '');
                input.value = result.url; input.hidden = false; copy.hidden = false; link.hidden = false; link.href = result.url; qrButton.hidden = false; qrContainer.hidden = true; qrSave.hidden = true;
                shareStatus.textContent = (result.codeRequired ? 'Access code required · ' : 'No access code · ') + (result.allowDownload ? 'Download enabled.' : 'Download hidden.');
                input.select ();
            } catch (error) { shareStatus.textContent = error.message; generate.disabled = false; }
        });
        copy.addEventListener ('click', async () => { try { await navigator.clipboard.writeText (input.value); copy.textContent = 'Copied'; } catch { input.select (); copy.textContent = 'Select and copy link'; } });
        form.append (hint, downloadLabel, codeLabel, codeInput, generate, shareStatus, input, copy, link, qrButton, qrContainer, qrStatus, qrSave);
        shared.appendChild (form);
    }

    async Open ()
    {
        if (this.editor.readOnly) { return; }
        const dialog = WorkspaceDialog ('Model library'); dialog.classList.add ('library_dialog');
        const hint = document.createElement ('p'); hint.className = 'library_connection'; dialog.appendChild (hint);
        const tabs = document.createElement ('div'); tabs.className = 'library_source_tabs'; dialog.appendChild (tabs);
        const shell = document.createElement ('div'); shell.className = 'library_shell';
        const sidebar = document.createElement ('div'); sidebar.className = 'library_sidebar';
        const categories = document.createElement ('nav'); categories.className = 'library_categories'; categories.setAttribute ('aria-label', 'Library categories and projects');
        const folderTools = document.createElement ('div'); folderTools.className = 'library_folder_tools';
        const addFolder = document.createElement ('button'); addFolder.textContent = '＋ New folder';
        const renameFolder = document.createElement ('button'); renameFolder.textContent = 'Rename';
        const deleteFolder = document.createElement ('button'); deleteFolder.textContent = 'Delete';
        folderTools.append (addFolder, renameFolder, deleteFolder); sidebar.append (categories, folderTools);
        const body = document.createElement ('div'); body.className = 'library_body';
        const search = document.createElement ('input'); search.type = 'search'; search.placeholder = 'Search saved models and sessions'; search.setAttribute ('aria-label', 'Search library');
        const bulk = document.createElement ('div'); bulk.className = 'library_bulk_actions';
        const selectAll = document.createElement ('button'); selectAll.textContent = 'Select visible';
        const deleteSelected = document.createElement ('button'); deleteSelected.textContent = 'Delete selected'; deleteSelected.disabled = true;
        const selectionCount = document.createElement ('span'); selectionCount.textContent = '0 selected';
        bulk.append (selectAll, deleteSelected, selectionCount);
        const status = document.createElement ('p'); status.setAttribute ('role', 'status'); status.className = 'section_hint';
        const grid = document.createElement ('div'); grid.className = 'library_grid'; grid.tabIndex = 0; grid.setAttribute ('role', 'region'); grid.setAttribute ('aria-label', 'Saved models and sessions');
        body.append (search, bulk, status, grid); shell.append (sidebar, body); dialog.appendChild (shell);
        const save = document.createElement ('button'); save.className = 'workspace_primary'; save.textContent = 'Save current session'; save.disabled = !this.editor.document.objects.length && !this.editor.document.packaging?.paths?.length;
        save.disabled = save.disabled || this.editor.readOnly;
        save.addEventListener ('click', () => { dialog.close (); this.SaveDialog (); }); dialog.appendChild (save);

        let items = []; let folders = []; let urls = []; let generation = 0;
        const selectedIds = new Set ();
        const clearUrls = () => { urls.forEach (URL.revokeObjectURL); urls = []; };
        const isDevice = () => this.storage === this.deviceStorage;
        const isEditable = () => !this.editor.readOnly && (isDevice () || this.storage === this.accountStorage);
        const itemFolder = (item) => NormalizeLibraryPath (item.category) || 'Uncategorized';
        const isInCurrentFolder = (item) => {
            if (this.category === 'All sessions') { return true; }
            const folder = itemFolder (item);
            return folder === this.category || folder.startsWith (this.category + '/');
        };
        const visibleItems = () => items.filter ((item) => isInCurrentFolder (item) && item.name.toLowerCase ().includes (search.value.toLowerCase ()));

        const updateBulk = () => {
            selectionCount.textContent = selectedIds.size + ' selected';
            deleteSelected.disabled = !isEditable () || selectedIds.size === 0;
            selectAll.disabled = !isEditable () || visibleItems ().length === 0;
            bulk.hidden = !isEditable ();
        };

        const renderCategories = () => {
            categories.replaceChildren ();
            const all = ['All sessions', ...folders];
            if (this.category !== 'All sessions' && !folders.includes (this.category)) { this.category = 'All sessions'; }
            for (const path of all) {
                const button = document.createElement ('button');
                button.textContent = path === 'All sessions' ? 'All sessions' : this.FolderLabel (path);
                button.style.paddingLeft = path === 'All sessions' ? '' : (8 + Math.max (0, path.split ('/').length - 1) * 14) + 'px';
                button.setAttribute ('aria-pressed', String (path === this.category));
                button.addEventListener ('click', () => {
                    this.category = path; selectedIds.clear ();
                    renderCategories (); render ();
                });
                categories.appendChild (button);
            }
            const editable = isEditable () && this.category !== 'All sessions';
            addFolder.hidden = !isEditable (); renameFolder.hidden = !isEditable (); deleteFolder.hidden = !isEditable ();
            renameFolder.disabled = !editable || this.category === 'Uncategorized';
            deleteFolder.disabled = !editable || this.category === 'Uncategorized';
        };

        const renameItem = async (item, name, image) => {
            const previous = item.name;
            const value = window.prompt ('Rename Library item', previous);
            if (value === null) { return; }
            const next = value.trim ().slice (0, 100);
            if (!next || next === previous) { return; }
            item.name = next; item.updatedAt = new Date ().toISOString ();
            await this.storage.Save (item);
            name.textContent = next; image.alt = next + ' preview';
            this.editor.Status ('Library item renamed: ' + next);
        };

        const render = () => {
            const current = ++generation; clearUrls (); grid.replaceChildren ();
            const filtered = visibleItems ();
            status.textContent = filtered.length ? filtered.length + ' saved item(s)' : 'No saved items in this folder.';
            for (const item of filtered) {
                const card = document.createElement ('article'); card.className = 'library_card';
                if (selectedIds.has (item.id)) { card.classList.add ('selected'); }
                if (isEditable ()) {
                    const select = document.createElement ('label'); select.className = 'library_select_item';
                    const checkbox = document.createElement ('input'); checkbox.type = 'checkbox'; checkbox.checked = selectedIds.has (item.id); checkbox.setAttribute ('aria-label', 'Select ' + item.name);
                    checkbox.addEventListener ('change', () => {
                        if (checkbox.checked) { selectedIds.add (item.id); card.classList.add ('selected'); }
                        else { selectedIds.delete (item.id); card.classList.remove ('selected'); }
                        updateBulk ();
                    });
                    select.append (checkbox); card.appendChild (select);
                }
                const image = document.createElement ('img'); image.alt = item.name + ' preview';
                if (item.shared || item.personal) {
                    (item.personal ? this.accountStorage : this.sharedStorage).Thumbnail (item).then ((blob) => { if (current === generation && dialog.isConnected) { const url = URL.createObjectURL (blob); urls.push (url); image.src = url; } }).catch (() => { image.alt = item.name + ' · Preview unavailable'; });
                } else { image.src = item.thumbnail; }
                const name = document.createElement ('h3'); name.textContent = item.name; name.className = isEditable () ? 'editable_name' : '';
                if (isEditable ()) {
                    name.title = 'Click to rename saved item'; name.tabIndex = 0; name.setAttribute ('role', 'button');
                    name.addEventListener ('click', () => renameItem (item, name, image));
                    name.addEventListener ('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault (); renameItem (item, name, image); } });
                }
                const info = document.createElement ('p'); info.textContent = itemFolder (item) + ' · ' + item.objects + ' object(s) · ' + new Date (item.updatedAt).toLocaleDateString ();
                const actions = document.createElement ('div'); actions.className = 'library_actions';
                for (const [title, append] of [['Open', false], ['Add', true]]) {
                    const button = document.createElement ('button'); button.textContent = title; button.setAttribute ('aria-label', title + ' ' + item.name);
                    button.disabled = this.editor.readOnly;
                    button.addEventListener ('click', async () => {
                        button.disabled = true;
                        try {
                            const archive = item.personal ? await this.accountStorage.Archive (item) : item.shared ? await this.sharedStorage.Archive (item) : await RecoveryArchiveBuffer (item.archive);
                            if (!this.editor.website.auth.user) { throw new Error ('Sign in again to open the Library.'); }
                            await this.editor.OpenArchive (archive, append); dialog.close ();
                        } catch (error) { status.textContent = error.message; button.disabled = false; }
                    });
                    actions.appendChild (button);
                }
                if (isEditable ()) {
                    const move = document.createElement ('button'); move.textContent = 'Move';
                    move.addEventListener ('click', async () => {
                        const folder = await this.ChooseFolder ('Move ' + item.name, itemFolder (item));
                        if (!folder) { return; }
                        await this.storage.MoveMany ([item.id], folder); await load ();
                    });
                    const remove = document.createElement ('button'); remove.textContent = 'Delete';
                    remove.addEventListener ('click', async () => {
                        if (!window.confirm ('Delete “' + item.name + '” from this library?')) { return; }
                        await this.storage.Remove (item.id); selectedIds.delete (item.id); await load ();
                    });
                    actions.append (move, remove);
                } else if (item.shared) {
                    const share = document.createElement ('button'); share.textContent = 'Share'; share.addEventListener ('click', () => this.OpenShareDialog (item)); actions.appendChild (share);
                }
                card.append (image, name, info, actions); grid.appendChild (card);
            }
            updateBulk ();
        };

        addFolder.addEventListener ('click', async () => {
            const base = this.category !== 'All sessions' && this.category !== 'Uncategorized' ? this.category + '/' : '';
            const value = window.prompt ('New category/project path. Use / to nest folders.', base);
            if (value === null) { return; }
            try { this.category = await this.storage.AddFolder (value); folders = await this.storage.Folders (); renderCategories (); render (); }
            catch (error) { status.textContent = error.message; }
        });
        renameFolder.addEventListener ('click', async () => {
            if (this.category === 'All sessions' || this.category === 'Uncategorized') { return; }
            const value = window.prompt ('Rename category/project', this.category);
            if (value === null) { return; }
            try { this.category = await this.storage.RenameFolder (this.category, value); folders = await this.storage.Folders (); renderCategories (); render (); }
            catch (error) { status.textContent = error.message; }
        });
        deleteFolder.addEventListener ('click', async () => {
            if (this.category === 'All sessions' || this.category === 'Uncategorized') { return; }
            const destination = LibraryPathParent (this.category) || 'Uncategorized';
            if (!window.confirm ('Delete folder “' + this.category + '”? Saved models inside will be moved to “' + destination + '” and will not be deleted.')) { return; }
            try { this.category = await this.storage.DeleteFolder (this.category); folders = await this.storage.Folders (); renderCategories (); await load (); }
            catch (error) { status.textContent = error.message; }
        });
        selectAll.addEventListener ('click', () => {
            const visible = visibleItems ();
            const allSelected = visible.length > 0 && visible.every ((item) => selectedIds.has (item.id));
            for (const item of visible) { if (allSelected) { selectedIds.delete (item.id); } else { selectedIds.add (item.id); } }
            render ();
        });
        deleteSelected.addEventListener ('click', async () => {
            if (!selectedIds.size || !window.confirm ('Delete ' + selectedIds.size + ' selected saved item(s) from this library?')) { return; }
            try { await this.storage.RemoveMany (selectedIds); selectedIds.clear (); await load (); }
            catch (error) { status.textContent = error.message; }
        });
        search.addEventListener ('input', render);

        let loadGeneration = 0;
        const load = async () => {
            const request = ++loadGeneration; generation++; clearUrls (); grid.replaceChildren (); status.textContent = 'Loading saved models…';
            hint.textContent = this.storage === this.accountStorage ? 'Account library · Private files saved to your account.' : isDevice () ? 'Device library · Custom nested categories/projects are stored in this browser.' : 'Shared library · Read-only during corporate identity migration';
            try {
                items = await this.storage.List ();
                folders = isEditable () ? await this.storage.Folders () : Array.from (new Set (items.map (itemFolder))).sort ();
                if (request !== loadGeneration || !dialog.isConnected) { return; }
                renderCategories (); render ();
            } catch (error) { if (request === loadGeneration) { status.textContent = error.message; } }
        };

        for (const [label, storage] of [['Account library', this.accountStorage], ['Device library', this.deviceStorage], ['Shared library', this.sharedStorage]]) {
            const button = document.createElement ('button'); button.textContent = label; button.setAttribute ('aria-pressed', String (this.storage === storage));
            button.addEventListener ('click', async () => {
                this.storage = storage; this.category = 'All sessions'; selectedIds.clear ();
                Array.from (tabs.children).forEach ((other) => other.setAttribute ('aria-pressed', String (other === button)));
                await load ();
            });
            tabs.appendChild (button);
        }
        dialog.addEventListener ('close', () => { generation++; clearUrls (); });
        await load ();
    }
}
