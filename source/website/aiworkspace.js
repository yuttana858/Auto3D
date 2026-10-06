const AIStorageKey = 'auto3d-ai-connections-v1';

function Element (tag, className, text, parent)
{
    const element = document.createElement (tag);
    if (className) { element.className = className; }
    if (text !== undefined) { element.textContent = text; }
    if (parent) { parent.appendChild (element); }
    return element;
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

    LoadSettings ()
    {
        const fallback = { provider : 'meshy', baseUrl : 'https://api.meshy.ai', apiKey : '', remember : false };
        try {
            const session = JSON.parse (sessionStorage.getItem (AIStorageKey) || 'null');
            const local = JSON.parse (localStorage.getItem (AIStorageKey) || 'null');
            return { ...fallback, ...(session || local || {}) };
        } catch {
            return fallback;
        }
    }

    SaveSettings (settings)
    {
        this.settings = {
            provider : settings.provider === 'custom' ? 'custom' : 'meshy',
            baseUrl : String (settings.baseUrl || 'https://api.meshy.ai').trim ().replace (/\/$/, ''),
            apiKey : String (settings.apiKey || '').trim (),
            remember : settings.remember === true
        };
        try {
            sessionStorage.removeItem (AIStorageKey);
            localStorage.removeItem (AIStorageKey);
            const target = this.settings.remember ? localStorage : sessionStorage;
            target.setItem (AIStorageKey, JSON.stringify (this.settings));
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
        const header = Element ('div', 'ai_workspace_header', undefined, panel);
        const title = Element ('div', null, undefined, header); Element ('strong', null, 'AI Generative', title); this.connectionBadge = Element ('span', 'ai_connection_badge', 'Not connected', title);
        const close = Element ('button', null, '×', header); close.title = 'Return to model data'; close.setAttribute ('aria-label', 'Close AI Generative'); close.addEventListener ('click', () => this.Close ());

        const inputSection = Element ('div', 'ai_workspace_section', undefined, panel);
        Element ('strong', null, 'Create', inputSection);
        this.prompt = Element ('textarea', 'ai_prompt', undefined, inputSection); this.prompt.rows = 4; this.prompt.placeholder = 'Describe the object, image, or texture you want to create…'; this.prompt.setAttribute ('aria-label', 'AI generation prompt'); this.prompt.addEventListener ('input', () => this.RefreshActions ());

        const imageRow = Element ('div', 'ai_image_row', undefined, inputSection);
        this.imageInput = Element ('input', null, undefined, imageRow); this.imageInput.type = 'file'; this.imageInput.accept = 'image/png,image/jpeg,image/webp'; this.imageInput.hidden = true;
        this.imageButton = Element ('button', null, 'Upload reference image', imageRow); this.imageButton.addEventListener ('click', () => this.imageInput.click ());
        this.imageName = Element ('span', 'ai_image_name', 'No image selected', imageRow);
        this.imageInput.addEventListener ('change', () => { this.imageFile = this.imageInput.files[0] || null; this.imageName.textContent = this.imageFile?.name || 'No image selected'; this.RefreshActions (); });

        const actions = Element ('div', 'ai_generation_actions', undefined, inputSection);
        this.actionButtons = new Map ();
        for (const [id, label] of [['text3d', 'Text to 3D'], ['image3d', 'Image to 3D'], ['textimage', 'Text to image'], ['texture', 'Texture generation']]) {
            const button = Element ('button', 'ai_generation_action', label, actions); button.addEventListener ('click', () => this.PendingAction (id)); this.actionButtons.set (id, button);
        }
        this.status = Element ('p', 'section_hint ai_status', 'Connect a provider in Preferences to enable the generation workspace.', inputSection);

        const recentSection = Element ('div', 'ai_workspace_section ai_recent_section', undefined, panel);
        const recentHeader = Element ('div', 'ai_recent_header', undefined, recentSection); Element ('strong', null, 'Latest creations', recentHeader); const refresh = Element ('button', null, 'Refresh', recentHeader); refresh.addEventListener ('click', () => this.RefreshRecent ());
        this.recentGrid = Element ('div', 'ai_recent_grid', undefined, recentSection);
        this.RenderRecent (); this.RefreshConnection ();
        this.panel = panel;
    }

    Open ()
    {
        const right = this.website.parameters.rightContainerDiv;
        right.classList.remove ('collapsed');
        document.getElementById ('data_panel_content').hidden = true;
        this.panel.hidden = false;
        const toggle = document.getElementById ('data_panel_toggle'); toggle.querySelector ('span:first-child').textContent = 'AI Generative'; toggle.setAttribute ('aria-expanded', 'true');
        this.headerButton?.setAttribute ('aria-pressed', 'true');
        this.website.layouter.Resize ();
        this.RefreshConnection ();
    }

    Close ()
    {
        this.panel.hidden = true;
        document.getElementById ('data_panel_content').hidden = false;
        const toggle = document.getElementById ('data_panel_toggle'); toggle.querySelector ('span:first-child').textContent = 'Model data';
        this.headerButton?.setAttribute ('aria-pressed', 'false');
        this.website.layouter.Resize ();
    }

    async TestConnection ()
    {
        if (!this.settings.apiKey) { throw new Error ('Enter an API key first.'); }
        if (this.settings.provider !== 'meshy') { throw new Error ('Custom provider testing will be wired when its API contract is selected.'); }
        const response = await fetch (this.settings.baseUrl + '/openapi/v1/balance', { headers : { Authorization : 'Bearer ' + this.settings.apiKey } });
        if (!response.ok) { throw new Error ('Connection failed (' + response.status + ').'); }
        const result = await response.json ();
        this.lastBalance = Number.isFinite (result.balance) ? result.balance : null;
        this.RefreshConnection ();
        return result;
    }

    RefreshConnection ()
    {
        if (!this.connectionBadge) { return; }
        const configured = Boolean (this.settings.apiKey);
        this.connectionBadge.textContent = configured ? (this.settings.provider === 'meshy' ? 'Meshy configured' : 'Provider configured') : 'Not connected';
        this.connectionBadge.classList.toggle ('connected', configured);
        if (this.lastBalance !== undefined && this.lastBalance !== null) { this.connectionBadge.textContent = 'Meshy · ' + this.lastBalance + ' credits'; }
        this.RefreshActions ();
    }

    RefreshActions ()
    {
        if (!this.actionButtons) { return; }
        const connected = Boolean (this.settings.apiKey);
        this.actionButtons.get ('text3d').disabled = !connected || !this.prompt?.value.trim ();
        this.actionButtons.get ('image3d').disabled = !connected || !this.imageFile;
        this.actionButtons.get ('textimage').disabled = !connected || !this.prompt?.value.trim ();
        this.actionButtons.get ('texture').disabled = !connected || (!this.prompt?.value.trim () && !this.imageFile);
    }

    PendingAction (id)
    {
        const labels = { text3d : 'Text to 3D', image3d : 'Image to 3D', textimage : 'Text to image', texture : 'Texture generation' };
        this.status.textContent = labels[id] + ' is ready for provider endpoint wiring. Connection and input capture are in place; generation is intentionally not submitted yet.';
    }

    async RefreshRecent ()
    {
        if (!this.settings.apiKey) { this.status.textContent = 'Connect an AI provider before loading recent creations.'; return; }
        if (this.settings.provider !== 'meshy') { this.status.textContent = 'Recent-model discovery for custom providers will be added with the provider adapter.'; return; }
        this.status.textContent = 'Loading recent Meshy creations…';
        const headers = { Authorization : 'Bearer ' + this.settings.apiKey };
        try {
            const urls = [
                this.settings.baseUrl + '/openapi/v2/text-to-3d?page_size=6&sort_by=-created_at',
                this.settings.baseUrl + '/openapi/v1/image-to-3d?page_size=6&sort_by=-created_at'
            ];
            const responses = await Promise.all (urls.map ((url) => fetch (url, { headers })));
            for (const response of responses) { if (!response.ok) { throw new Error ('Could not load recent creations (' + response.status + ').'); } }
            const groups = await Promise.all (responses.map ((response) => response.json ()));
            this.recent = groups.flat ().filter ((item) => item && item.id).sort ((a, b) => (b.created_at || 0) - (a.created_at || 0)).slice (0, 12).map ((item) => ({
                id : item.id,
                name : item.prompt || (item.type === 'image-to-3d' ? 'Image to 3D' : 'Text to 3D'),
                status : item.status || 'UNKNOWN',
                thumbnail : item.thumbnail_url || null,
                modelUrl : item.model_urls?.glb || null,
                createdAt : item.created_at || null,
                provider : 'Meshy'
            }));
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
            Element ('strong', null, item.name || 'Generated asset', card); Element ('span', null, (item.provider ? item.provider + ' · ' : '') + (item.status || 'Ready'), card);
        }
    }
}
