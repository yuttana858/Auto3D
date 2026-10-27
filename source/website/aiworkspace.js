import { AppVersion } from './preferences.js';

const AIStorageKey = 'auto3d-ai-connections-v1';

function Element (tag, className, text, parent)
{
    const element = document.createElement (tag);
    if (className) { element.className = className; }
    if (text !== undefined) { element.textContent = text; }
    if (parent) { parent.appendChild (element); }
    return element;
}

function Delay (milliseconds)
{
    return new Promise ((resolve) => setTimeout (resolve, milliseconds));
}

export class AIWorkspace
{
    constructor (website)
    {
        this.website = website;
        this.imageFile = null;
        this.recent = [];
        this.settings = this.LoadSettings ();
        this.CreateHeaderButton ();
        this.CreatePanel ();
    }

    InitializeAccount (id)
    {
        this.storageKey = AIStorageKey + ':' + id; this.settings = this.LoadSettings (); this.RefreshConnection (); this.RefreshActions ();
    }

    LoadSettings ()
    {
        const fallback = { provider : 'meshy', baseUrl : '/api/ai', apiKey : '', remember : false };
        try {
            if (!this.storageKey) { return fallback; }
            const session = JSON.parse (sessionStorage.getItem (this.storageKey) || 'null');
            const local = JSON.parse (localStorage.getItem (this.storageKey) || 'null');
            const settings = { ...fallback, ...(session || local || {}) };
            if (settings.provider === 'meshy' && String (settings.baseUrl || '').includes ('meshy.ai')) { settings.baseUrl = '/api/ai'; }
            return settings;
        } catch {
            return fallback;
        }
    }

    SaveSettings (settings)
    {
        const provider = settings.provider === 'custom' ? 'custom' : 'meshy';
        let baseUrl = String (settings.baseUrl || '/api/ai').trim ().replace (/\/$/, '');
        if (provider === 'meshy' && baseUrl.includes ('meshy.ai')) { baseUrl = '/api/ai'; }
        this.settings = {
            provider,
            baseUrl,
            apiKey : String (settings.apiKey || '').trim (),
            remember : settings.remember === true
        };
        try {
            sessionStorage.removeItem (this.storageKey);
            localStorage.removeItem (this.storageKey);
            const target = this.settings.remember ? localStorage : sessionStorage;
            if (!this.storageKey) { throw new Error ('Sign in first.'); }
            target.setItem (this.storageKey, JSON.stringify (this.settings));
        } catch { /* Connection remains available for this page lifetime. */ }
        this.RefreshConnection ();
    }

    ClearKey ()
    {
        this.SaveSettings ({ ...this.settings, apiKey : '' });
    }

    CreateHeaderButton ()
    {
        const button = Element ('button', 'ai_header_button', undefined, document.querySelector ('.title_left'));
        button.title = 'AI Generative'; button.setAttribute ('aria-label', 'Open AI Generative');
        button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Z"/><path d="M19 14l.9 2.6L22.5 18l-2.6.9L19 21.5l-.9-2.6-2.6-.9 2.6-1.4L19 14Z"/></svg><span>AI</span>';
        button.addEventListener ('click', () => this.Open ());
        this.headerButton = button;
    }

    CreatePanel ()
    {
        const right = this.website.parameters.rightContainerDiv;
        const panel = Element ('div', 'ai_workspace_panel', undefined, right); panel.hidden = true;
        const header = Element ('div', 'ai_workspace_header', undefined, panel); Element ('span', 'module_version', 'AI v' + AppVersion, header); this.connectionBadge = Element ('span', 'ai_connection_badge', 'Not connected', header);
        this.aiPane = Element ('div', 'ai_workspace_pane', undefined, panel);
        const inputSection = Element ('div', 'ai_workspace_section', undefined, this.aiPane);
        Element ('strong', null, 'Create', inputSection);
        this.prompt = Element ('textarea', 'ai_prompt', undefined, inputSection); this.prompt.rows = 4; this.prompt.maxLength = 800; this.prompt.placeholder = 'Describe the object, image, or texture you want to create…'; this.prompt.setAttribute ('aria-label', 'AI generation prompt'); this.prompt.addEventListener ('input', () => this.RefreshActions ());

        const generationOptions = Element ('div', 'ai_generation_options', undefined, inputSection);
        const detailLabel = Element ('label', null, '3D detail', generationOptions);
        this.detailSelect = Element ('select', null, undefined, detailLabel);
        for (const [label, value] of [
            ['Smart · 4k faces', 'smart:4000'],
            ['Smart · 10k faces', 'smart:10000'],
            ['Balanced · 30k faces', 'standard:30000'],
            ['Detailed · 75k faces', 'standard:75000'],
            ['High · 150k faces', 'standard:150000']
        ]) { this.detailSelect.add (new Option (label, value)); }
        this.detailSelect.value = 'standard:30000';
        const pbrLabel = Element ('label', 'ai_checkbox_label', undefined, generationOptions);
        this.pbrCheckbox = Element ('input', null, undefined, pbrLabel); this.pbrCheckbox.type = 'checkbox'; this.pbrCheckbox.checked = true;
        pbrLabel.appendChild (document.createTextNode (' PBR on refine'));

        const imageRow = Element ('div', 'ai_image_row', undefined, inputSection);
        this.imageInput = Element ('input', null, undefined, imageRow); this.imageInput.type = 'file'; this.imageInput.accept = 'image/png,image/jpeg,image/webp'; this.imageInput.hidden = true;
        this.imageButton = Element ('button', null, 'Upload reference image', imageRow); this.imageButton.addEventListener ('click', () => this.imageInput.click ());
        this.imageName = Element ('span', 'ai_image_name', 'No image selected', imageRow);
        this.imageInput.addEventListener ('change', () => { this.imageFile = this.imageInput.files[0] || null; this.imageName.textContent = this.imageFile?.name || 'No image selected'; this.RefreshActions (); });

        const actions = Element ('div', 'ai_generation_actions', undefined, inputSection);
        this.actionButtons = new Map ();
        for (const [id, label] of [['text3d', 'Text to 3D'], ['image3d', 'Image to 3D'], ['textimage', 'Text to image'], ['texture', 'Texture generation']]) {
            const button = Element ('button', 'ai_generation_action', label, actions);
            button.addEventListener ('click', () => id === 'text3d' ? this.StartTextTo3D () : this.PendingAction (id));
            this.actionButtons.set (id, button);
        }
        this.status = Element ('p', 'section_hint ai_status', 'Connect a provider in Preferences to enable the generation workspace.', inputSection);

        const recentSection = Element ('div', 'ai_workspace_section ai_recent_section', undefined, this.aiPane);
        const recentHeader = Element ('div', 'ai_recent_header', undefined, recentSection); Element ('strong', null, 'Latest creations', recentHeader); const refresh = Element ('button', null, 'Refresh', recentHeader); refresh.addEventListener ('click', () => this.RefreshRecent ());
        this.recentGrid = Element ('div', 'ai_recent_grid', undefined, recentSection);
        this.RenderRecent (); this.RefreshConnection ();
        this.panel = panel; panel.id = 'ai_module_panel'; panel.setAttribute ('aria-label', 'AI Generative');
        this.website.modulePanels.Register ('ai', { title : 'AI Generative', body : panel, onOpen : () => this.RefreshConnection (), onMode : state => this.headerButton?.setAttribute ('aria-pressed', String (state.visible)) });
    }

    Open () { return this.website.modulePanels.Open ('ai'); }
    Close () { return this.website.modulePanels.Set ('ai', 'closed'); }

    Headers (json = false)
    {
        const headers = {};
        if (this.settings.apiKey) { headers['X-Auto3D-AI-Key'] = this.settings.apiKey; }
        if (json) { headers['Content-Type'] = 'application/json'; }
        return headers;
    }

    async RequestJSON (url, options = {})
    {
        const response = await fetch (url, options);
        const text = await response.text ();
        let result = null;
        if (text) {
            try { result = JSON.parse (text); } catch { result = { message : text }; }
        }
        if (!response.ok) {
            const message = result?.error || result?.message || result?.task_error?.message || ('Provider request failed (' + response.status + ').');
            throw new Error (message);
        }
        return { result, response };
    }

    async TestConnection ()
    {
        if (this.settings.provider !== 'meshy') { throw new Error ('Custom provider testing will be wired when its API contract is selected.'); }
        const { result } = await this.RequestJSON (this.settings.baseUrl + '/balance', { headers : this.Headers () });
        this.lastBalance = Number.isFinite (result.balance) ? result.balance : null;
        this.RefreshConnection ();
        return result;
    }

    RefreshConnection ()
    {
        if (!this.connectionBadge) { return; }
        const configured = this.settings.provider === 'meshy';
        this.connectionBadge.textContent = configured ? (this.settings.apiKey ? 'Meshy · personal key' : 'Meshy via Auto3D') : 'Not connected';
        this.connectionBadge.classList.toggle ('connected', configured);
        if (this.lastBalance !== undefined && this.lastBalance !== null) { this.connectionBadge.textContent = 'Meshy · ' + this.lastBalance + ' credits'; }
        this.RefreshActions ();
    }

    RefreshActions ()
    {
        if (!this.actionButtons) { return; }
        const connected = this.settings.provider === 'meshy';
        this.actionButtons.get ('text3d').disabled = !connected || !this.prompt?.value.trim ();
        this.actionButtons.get ('image3d').disabled = !connected || !this.imageFile;
        this.actionButtons.get ('textimage').disabled = !connected || !this.prompt?.value.trim ();
        this.actionButtons.get ('texture').disabled = !connected || (!this.prompt?.value.trim () && !this.imageFile);
    }

    TextTo3DOptions ()
    {
        const [mode, countText] = this.detailSelect.value.split (':');
        const targetPolycount = Number (countText);
        if (mode === 'smart') {
            return {
                model_type : 'smart-topology',
                ai_model : 'meshy-t2',
                topology : 'triangle',
                target_polycount : targetPolycount
            };
        }
        return {
            model_type : 'standard',
            ai_model : 'latest',
            should_remesh : true,
            target_polycount : targetPolycount
        };
    }

    async StartTextTo3D ()
    {
        const prompt = this.prompt.value.trim ();
        if (!prompt) { return; }
        if (this.settings.provider !== 'meshy') { this.status.textContent = 'Text to 3D submission is currently wired for Meshy only.'; return; }

        const button = this.actionButtons.get ('text3d');
        button.disabled = true;
        this.status.textContent = 'Submitting Text to 3D preview…';
        try {
            const payload = {
                mode : 'preview',
                prompt,
                target_formats : ['glb'],
                ...this.TextTo3DOptions ()
            };
            const { result } = await this.RequestJSON (this.settings.baseUrl + '/text-to-3d', {
                method : 'POST',
                headers : this.Headers (true),
                body : JSON.stringify (payload)
            });
            const task = {
                id : result.result,
                name : prompt,
                status : 'PENDING',
                progress : 0,
                type : 'text-to-3d-preview',
                provider : 'Meshy',
                createdAt : Date.now ()
            };
            this.UpsertTask (task);
            this.status.textContent = 'Preview queued · 0%';
            await this.PollTextTo3DTask (task.id);
        } catch (error) {
            this.status.textContent = 'Text to 3D failed: ' + error.message;
        } finally {
            this.RefreshActions ();
        }
    }

    async PollTextTo3DTask (taskId)
    {
        for (let attempt = 0; attempt < 720; attempt++) {
            const { result, response } = await this.RequestJSON (this.settings.baseUrl + '/text-to-3d/' + encodeURIComponent (taskId), { headers : this.Headers () });
            const task = this.NormalizeMeshyTask (result);
            this.UpsertTask (task);
            const progress = Number.isFinite (task.progress) ? task.progress : 0;
            this.status.textContent = (task.type === 'text-to-3d-refine' ? 'Refining' : 'Generating preview') + ' · ' + progress + '%';
            if (task.status === 'SUCCEEDED') {
                this.status.textContent = task.type === 'text-to-3d-refine' ? 'Refine complete. Ready to import GLB.' : 'Preview complete. Review it, refine for PBR textures, or import the mesh.';
                return task;
            }
            if (task.status === 'FAILED' || task.status === 'CANCELED') {
                throw new Error (result.task_error?.message || ('Task ' + task.status.toLowerCase () + '.'));
            }
            const retryAfter = Number (response.headers.get ('Retry-After'));
            await Delay (Number.isFinite (retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 4000);
        }
        throw new Error ('Generation timed out before reaching a terminal state.');
    }

    async RefineTask (item)
    {
        if (!item?.id || item.status !== 'SUCCEEDED') { return; }
        this.status.textContent = 'Submitting textured refine…';
        try {
            const { result } = await this.RequestJSON (this.settings.baseUrl + '/text-to-3d', {
                method : 'POST',
                headers : this.Headers (true),
                body : JSON.stringify ({
                    mode : 'refine',
                    preview_task_id : item.id,
                    enable_pbr : this.pbrCheckbox.checked,
                    texture_resolution : '2k',
                    target_formats : ['glb']
                })
            });
            const task = {
                id : result.result,
                name : item.name,
                status : 'PENDING',
                progress : 0,
                type : 'text-to-3d-refine',
                provider : 'Meshy',
                createdAt : Date.now ()
            };
            this.UpsertTask (task);
            await this.PollTextTo3DTask (task.id);
        } catch (error) {
            this.status.textContent = 'Refine failed: ' + error.message;
        }
    }

    async ImportTask (item)
    {
        if (!item?.modelUrl) { this.status.textContent = 'This task does not have a GLB result yet.'; return; }
        this.status.textContent = 'Importing generated GLB into the current session…';
        try {
            const response = await fetch (this.settings.baseUrl + '/model?url=' + encodeURIComponent (item.modelUrl), { headers : this.Headers () });
            if (!response.ok) {
                let message = 'Generated model download failed (' + response.status + ').';
                try { const body = await response.json (); message = body.error || body.message || message; } catch { /* Keep fallback. */ }
                throw new Error (message);
            }
            const blob = await response.blob ();
            const file = new File ([blob], 'meshy-' + item.id + '.glb', { type : blob.type || 'model/gltf-binary' });
            const previousObjects = [...this.website.sessionEditor.document.objects];
            await this.website.LoadModelFromFileList ([file]);
            if (!this.website.sessionEditor.selected || previousObjects.includes (this.website.sessionEditor.selected)) { throw new Error ('Generated model was not added to the session.'); }
            try { await this.website.materialPanel.GenerateTextures ({ objectId : this.website.sessionEditor.selected.id }); this.status.textContent = 'Generated GLB imported with editable surface maps.'; } catch (error) { this.status.textContent = 'Generated GLB imported. Surface maps: ' + error.message; }
        } catch (error) {
            this.status.textContent = 'Import failed: ' + error.message;
        }
    }

    NormalizeMeshyTask (item)
    {
        return {
            id : item.id,
            name : item.prompt || (item.type === 'image-to-3d' ? 'Image to 3D' : 'Text to 3D'),
            status : item.status || 'UNKNOWN',
            progress : Number.isFinite (item.progress) ? item.progress : null,
            thumbnail : item.thumbnail_url || null,
            modelUrl : item.model_urls?.glb || null,
            createdAt : item.created_at || null,
            type : item.type || null,
            credits : Number.isFinite (item.consumed_credits) ? item.consumed_credits : null,
            provider : 'Meshy'
        };
    }

    UpsertTask (task)
    {
        const index = this.recent.findIndex ((item) => item.id === task.id);
        if (index === -1) { this.recent.unshift (task); }
        else { this.recent[index] = { ...this.recent[index], ...task }; }
        this.recent.sort ((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        this.recent = this.recent.slice (0, 12);
        this.RenderRecent ();
    }

    PendingAction (id)
    {
        const labels = { image3d : 'Image to 3D', textimage : 'Text to image', texture : 'Texture generation' };
        this.status.textContent = labels[id] + ' is next in the provider wiring sequence. Text to 3D is now fully connected first so its task lifecycle can be validated before sharing the same queue/import path.';
    }

    async RefreshRecent ()
    {
        if (this.settings.provider !== 'meshy') { this.status.textContent = 'Connect a supported AI provider before loading recent creations.'; return; }
        if (this.settings.provider !== 'meshy') { this.status.textContent = 'Recent-model discovery for custom providers will be added with the provider adapter.'; return; }
        this.status.textContent = 'Loading recent Meshy creations…';
        try {
            const urls = [
                this.settings.baseUrl + '/text-to-3d?page_size=8&sort_by=-created_at',
                this.settings.baseUrl + '/image-to-3d?page_size=4&sort_by=-created_at'
            ];
            const groups = [];
            for (const url of urls) {
                const { result } = await this.RequestJSON (url, { headers : this.Headers () });
                groups.push (Array.isArray (result) ? result : []);
            }
            this.recent = groups.flat ().filter ((item) => item && item.id).map ((item) => this.NormalizeMeshyTask (item)).sort ((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice (0, 12);
            this.RenderRecent ();
            this.status.textContent = this.recent.length ? 'Loaded ' + this.recent.length + ' recent creations.' : 'No recent Meshy 3D creations found.';
        } catch (error) {
            this.status.textContent = error.message;
        }
    }

    RenderRecent ()
    {
        if (!this.recentGrid) { return; }
        this.recentGrid.replaceChildren ();
        if (!this.recent.length) {
            const empty = Element ('div', 'ai_recent_empty', undefined, this.recentGrid); Element ('strong', null, 'No AI creations yet', empty); Element ('span', null, 'Completed generations will appear here with thumbnail, status, provider, and import action.', empty); return;
        }
        for (const item of this.recent.slice (0, 12)) {
            const card = Element ('div', 'ai_recent_card', undefined, this.recentGrid);
            if (item.thumbnail) { const image = Element ('img', null, undefined, card); image.src = item.thumbnail; image.alt = ''; }
            else {
                const placeholder = Element ('div', 'ai_recent_placeholder', undefined, card);
                Element ('span', null, item.progress === null || item.progress === undefined ? 'AI' : item.progress + '%', placeholder);
            }
            Element ('strong', null, item.name || 'Generated asset', card);
            const meta = [item.provider, item.status, Number.isFinite (item.progress) && item.status !== 'SUCCEEDED' ? item.progress + '%' : null, Number.isFinite (item.credits) ? item.credits + ' cr' : null].filter (Boolean).join (' · ');
            Element ('span', 'ai_recent_meta', meta, card);
            const actions = Element ('div', 'ai_recent_actions', undefined, card);
            if (item.status === 'SUCCEEDED' && item.type === 'text-to-3d-preview') {
                const refine = Element ('button', null, 'Refine', actions); refine.addEventListener ('click', () => this.RefineTask (item));
            }
            if (item.status === 'SUCCEEDED' && item.modelUrl) {
                const importButton = Element ('button', null, 'Import GLB', actions); importButton.addEventListener ('click', () => this.ImportTask (item));
            }
        }
    }
}
