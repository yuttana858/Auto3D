import { OpenMeshyConnection, MeshyCredentialRequest } from './aiconnection.js';
import { OpenSessionArchive } from './sessionarchive.js';
import { AIProjectArchive } from './aiproject.js';
import { AppVersion } from './preferences.js';
import { UnitFactor } from './preferences.js';
import * as THREE from 'three';

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

export function PlaceAIModel (editor, added)
{
    const existing = new THREE.Box3 ().makeEmpty ();
    for (const object of editor.document.objects) { if (!added.includes (object) && object.visible && object.threeObject) { existing.union (new THREE.Box3 ().setFromObject (object.threeObject)); } }
    const box = new THREE.Box3 ().makeEmpty (); for (const object of added) { if (object.threeObject) { box.union (new THREE.Box3 ().setFromObject (object.threeObject)); } }
    if (existing.isEmpty () || box.isEmpty () || !existing.intersectsBox (box)) { return; }
    const gap = Math.max (existing.getSize (new THREE.Vector3 ()).length (), box.getSize (new THREE.Vector3 ()).length ()) * 0.05;
    const offset = existing.max.x - box.min.x + gap;
    for (const object of added) { object.position[0] += offset; editor.document.ApplyTransform (object); editor.ApplyTransform (object); }
    editor.website.FitModelToWindow (true);
}

export function MatchAISceneUnits (saved, target)
{
    const targetUnit = target.model.GetUnit (), sourceUnit = saved.document.model.GetUnit ();
    const sourceFactor = UnitFactor (sourceUnit, 'metric'), targetFactor = UnitFactor (targetUnit, 'metric');
    if (!target.objects.length || !sourceFactor || !targetFactor) { return; }
    const ratio = sourceFactor / targetFactor;
    saved.document.objects.forEach (object => { object.scale = object.scale.map (value => value * ratio); object.unit = targetUnit; saved.document.ApplyTransform (object); });
    saved.document.model.SetUnit (targetUnit);
}

export class AIWorkspace
{
    constructor (website)
    {
        this.website = website;
        this.imageFile = null;
        this.recent = []; this.assets = new Map (); this.selectedTask = null; this.previewSequence = 0;
        this.settings = this.LoadSettings ();
        this.CreateHeaderButton ();
        this.CreatePanel ();
    }

    InitializeAccount (id)
    {
        this.previewSequence++; this.cacheGeneration = (this.cacheGeneration || 0) + 1; if (this.cacheTimer) { clearTimeout (this.cacheTimer); this.cacheTimer = null; } this.preview?.Clear (); this.assets.clear (); this.recent = []; this.selectedTask = null; this.RenderRecent (); this.storageKey = AIStorageKey + ':' + id; this.settings = this.LoadSettings (); this.RefreshConnection (); this.RefreshActions (); this.RestoreCachedWorkspace (id, this.cacheGeneration).catch (error => { if (this.website.auth?.user?.id === id) { this.status.textContent = 'AI workspace recovery unavailable: ' + error.message; } });
    }

    ScheduleWorkspaceSave ()
    {
        const owner = this.website.auth?.user?.id, storage = this.website.sessionEditor.library.deviceStorage, generation = this.cacheGeneration;
        if (!owner || storage.accountId !== owner || this.restoringCache) { return; }
        if (this.cacheTimer) { clearTimeout (this.cacheTimer); }
        this.cacheTimer = setTimeout (() => {
            this.cacheTimer = null; const record = { id : '__auto3d_ai_workspace__', tasks : this.recent.map (item => ({ ...item })), assets : [...this.assets.values ()], selected : this.selectedTask, projectName : this.projectName?.value || '', updatedAt : new Date ().toISOString () };
            this.cacheWrites = (this.cacheWrites || Promise.resolve ()).catch (() => {}).then (() => { if (this.website.auth?.user?.id !== owner || this.cacheGeneration !== generation || this.website.sessionEditor.library.deviceStorage !== storage) { return; } return storage.Save (record); }).catch (error => { if (this.website.auth?.user?.id === owner) { this.status.textContent = 'Could not save AI workspace on this device: ' + error.message; } });
        }, 500);
    }
    async RestoreCachedWorkspace (owner, generation)
    {
        const storage = this.website.sessionEditor.library.deviceStorage; const saved = await storage.Get ('__auto3d_ai_workspace__');
        if (!saved || owner !== this.website.auth?.user?.id || generation !== this.cacheGeneration || storage !== this.website.sessionEditor.library.deviceStorage || this.recent.length || this.assets.size) { return; }
        if (!Array.isArray (saved.tasks) || !Array.isArray (saved.assets)) { return; }
        this.restoringCache = true;
        try { this.recent = saved.tasks.filter (item => item && typeof item.id === 'string').slice (0, 48); this.assets = new Map (saved.assets.filter (item => item && typeof item.id === 'string' && item.buffer instanceof ArrayBuffer).map (item => [item.id, item])); if (typeof saved.projectName === 'string') { this.projectName.value = saved.projectName; } this.RenderRecent (); if (this.recent.some (item => item.id === saved.selected)) { await this.SelectTask (saved.selected); } this.status.textContent = 'AI workspace restored from this device.'; }
        finally { this.restoringCache = false; }
    }

    LoadSettings ()
    {
        // Remove legacy AI connection records for all accounts on this device.
        try { for (const storage of [sessionStorage, localStorage]) { const keys = []; for (let i = 0; i < storage.length; i++) { const key = storage.key (i); if (key === AIStorageKey || key?.startsWith (AIStorageKey + ':')) { keys.push (key); } } if (this.storageKey && !keys.includes (this.storageKey)) { keys.push (this.storageKey); } keys.forEach (key => storage.removeItem (key)); } } catch { /* Storage may be unavailable. */ }
        return { provider : 'meshy', baseUrl : '/api/ai' };
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
        const toolbar = Element ('div', 'ai_project_toolbar', undefined, panel);
        this.addButton = Element ('button', null, 'Add to session', toolbar); this.addButton.disabled = true; this.addButton.addEventListener ('click', () => this.Run (() => this.AddSelected ()));
        const save = Element ('button', null, 'Save project to Library', toolbar); save.addEventListener ('click', () => this.Run (() => this.OpenSaveDialog ()));
        const open = Element ('button', null, 'Open AI project', toolbar); this.projectInput = Element ('input', null, undefined, toolbar); this.projectInput.type = 'file'; this.projectInput.accept = '.auto3d'; this.projectInput.hidden = true; open.addEventListener ('click', () => this.projectInput.click ()); this.projectInput.addEventListener ('change', () => this.Run (async () => { const file = this.projectInput.files[0]; if (file) { await this.OpenProject (await file.arrayBuffer ()); } this.projectInput.value = ''; }));
        Element ('span', 'section_hint', 'Library save includes all completed 3D creations below.', toolbar);
        this.projectName = Element ('input', null, undefined, toolbar); this.projectName.placeholder = 'AI project'; this.projectName.maxLength = 120; this.projectName.setAttribute ('aria-label', 'AI project name'); this.projectName.addEventListener ('input', () => this.ScheduleWorkspaceSave ());
        this.aiPane = Element ('div', 'ai_workspace_pane', undefined, panel);
        this.previewHost = Element ('div', 'ai_preview_host', undefined, this.aiPane); this.previewHost.setAttribute ('aria-label', 'AI model viewer'); this.previewHost.tabIndex = 0;
        this.previewMessage = Element ('p', 'ai_preview_message', 'Select a completed creation to preview', this.previewHost);
        const inputSection = Element ('div', 'ai_workspace_section ai_input_section', undefined, this.aiPane);
        Element ('strong', null, 'Create', inputSection);
        this.prompt = Element ('textarea', 'ai_prompt', undefined, inputSection); this.prompt.rows = 4; this.prompt.maxLength = 800; this.prompt.placeholder = 'Describe the object, image, or texture you want to create…'; this.prompt.setAttribute ('aria-label', 'AI generation prompt'); this.prompt.addEventListener ('input', () => this.RefreshActions ());
        this.generateButton = Element ('button', 'ai_generate_button', 'Generate', inputSection); this.generateButton.type = 'button'; this.generateButton.setAttribute ('aria-keyshortcuts', 'Enter');
        this.generateButton.addEventListener ('click', () => this.Run (() => this.Generate (this.UIOptions (this.PrimaryGenerationAction ()))));
        this.prompt.addEventListener ('keydown', event => {
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.repeat || this.generateButton.disabled) { return; }
            event.preventDefault (); this.generateButton.click ();
        });

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
        pbrLabel.appendChild (document.createTextNode (' PBR textures'));

        const imageRow = Element ('div', 'ai_image_row', undefined, inputSection);
        this.imageInput = Element ('input', null, undefined, imageRow); this.imageInput.type = 'file'; this.imageInput.accept = 'image/png,image/jpeg,image/webp'; this.imageInput.hidden = true;
        this.imageButton = Element ('button', null, 'Upload reference image', imageRow); this.imageButton.addEventListener ('click', () => this.imageInput.click ());
        this.imageName = Element ('span', 'ai_image_name', 'No image selected', imageRow);
        this.imageInput.addEventListener ('change', () => { this.imageFile = this.imageInput.files[0] || null; this.imageName.textContent = this.imageFile?.name || 'No image selected'; this.RefreshActions (); });

        const actions = Element ('div', 'ai_generation_actions', undefined, inputSection);
        this.actionButtons = new Map ();
        for (const [id, label] of [['text3d', 'Text to 3D'], ['image3d', 'Image to 3D'], ['textimage', 'Text to image'], ['texture', 'Texture generation']]) {
            const button = Element ('button', 'ai_generation_action', label, actions);
            button.addEventListener ('click', () => this.Run (() => this.Generate (this.UIOptions (id))));
            this.actionButtons.set (id, button);
        }
        const scaleLabel = Element ('label', null, 'Model scale', inputSection); this.scaleInput = Element ('input', null, undefined, scaleLabel); this.scaleInput.type = 'number'; this.scaleInput.min = '.001'; this.scaleInput.max = '1000'; this.scaleInput.step = '.01'; this.scaleInput.value = '1'; this.scaleInput.setAttribute ('aria-label', 'AI model scale'); this.scaleInput.addEventListener ('change', () => this.Run (() => this.SetScale (Number (this.scaleInput.value))));
        const imageLabel = Element ('label', null, 'Image model', inputSection); this.imageModel = Element ('select', null, undefined, imageLabel); for (const name of ['nano-banana', 'nano-banana-2', 'nano-banana-2-lite', 'nano-banana-pro', 'gpt-image-2']) { this.imageModel.add (new Option (name, name)); }
        const aspectLabel = Element ('label', null, 'Image aspect ratio', inputSection); this.aspect = Element ('select', null, undefined, aspectLabel); for (const ratio of ['1:1', '16:9', '9:16', '4:3', '3:4']) { this.aspect.add (new Option (ratio, ratio)); }
        const textureLabel = Element ('label', null, 'Texture resolution', inputSection); this.textureResolution = Element ('select', null, undefined, textureLabel); for (const res of ['2k', '4k']) { this.textureResolution.add (new Option (res.toUpperCase (), res)); }
        this.status = Element ('p', 'section_hint ai_status', 'Connect a provider in Preferences to enable the generation workspace.', inputSection);

        const recentSection = Element ('div', 'ai_workspace_section ai_recent_section', undefined, this.aiPane);
        const recentHeader = Element ('div', 'ai_recent_header', undefined, recentSection); Element ('strong', null, 'Latest creations', recentHeader); const refresh = Element ('button', null, 'Refresh', recentHeader); refresh.addEventListener ('click', () => this.Run (() => this.RefreshRecent ()));
        this.recentGrid = Element ('div', 'ai_recent_grid', undefined, recentSection);
        this.RenderRecent (); this.RefreshConnection ();
        this.panel = panel; panel.id = 'ai_module_panel'; panel.setAttribute ('aria-label', 'AI Generative');
        this.website.modulePanels.Register ('ai', { title : 'AI Generative', body : panel, onOpen : () => this.RefreshConnection (), onMode : state => { this.headerButton?.setAttribute ('aria-pressed', String (state.visible)); this.preview?.Resize (); } });
    }

    Open () { return this.website.modulePanels.Open ('ai'); }
    Close () { return this.website.modulePanels.Set ('ai', 'closed'); }

    OpenConnection () { return OpenMeshyConnection (this.website); }
    InspectConnection () { return MeshyCredentialRequest (this.website); }
    async RemoveConnection ()
    {
        const result = await MeshyCredentialRequest (this.website, 'DELETE');
        this.lastBalance = null; this.RefreshConnection (); return result;
    }

    Headers (json = false)
    {
        const headers = {};
        if (this.website.auth?.user?.id) { headers['X-Auto3D-Account'] = this.website.auth.user.id; }
        if (json) { headers['Content-Type'] = 'application/json'; }
        return headers;
    }

    async RequestJSON (url, options = {})
    {
        const owner = this.website.auth?.user?.id; let response;
        try { response = await fetch (url, { credentials : 'same-origin', signal : AbortSignal.timeout (35000), ...options }); }
        catch (error) {
            if (owner !== this.website.auth?.user?.id) { throw new Error ('Account changed. Reopen AI Generative.'); }
            const failure = new Error (options.method === 'POST' ? 'Submission response was lost. Check recent creations before retrying; Meshy may have accepted the task.' : 'Could not reach Auto3D. Try again.');
            failure.transient = true; throw failure;
        }
        const text = await response.text ();
        let result = null;
        if (text) {
            try { result = JSON.parse (text); } catch { result = { message : text }; }
        }
        if (owner !== this.website.auth?.user?.id) { throw new Error ('Account changed. Reopen AI Generative.'); }
        if (!response.ok) {
            const message = result?.error || result?.message || result?.task_error?.message || ('Provider request failed (' + response.status + ').');
            const error = new Error (message); error.code = result?.code; error.status = response.status; error.retryAfter = response.headers.get ('Retry-After'); throw error;
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
        this.connectionBadge.textContent = configured ? 'Meshy via Auto3D' : 'Not connected';
        this.connectionBadge.classList.toggle ('connected', configured);
        if (this.lastBalance !== undefined && this.lastBalance !== null) { this.connectionBadge.textContent = 'Meshy · ' + this.lastBalance + ' credits'; }
        this.RefreshActions ();
    }

    RefreshActions ()
    {
        if (!this.actionButtons) { return; }
        const connected = this.settings.provider === 'meshy';
        const selected = this.recent.find (item => item.id === this.selectedTask);
        const hasPrompt = !!this.prompt?.value.trim ();
        const hasImage = !!this.imageFile || !!selected?.imageUrl;
        const busy = !!this.submitting;
        if (this.generateButton) { this.generateButton.disabled = !connected || busy || (this.PrimaryGenerationAction () === 'text3d' ? !hasPrompt : !hasImage); }
        this.actionButtons.get ('text3d').disabled = !connected || busy || !hasPrompt;
        this.actionButtons.get ('image3d').disabled = !connected || busy || !hasImage;
        this.actionButtons.get ('textimage').disabled = !connected || busy || !hasPrompt;
        this.actionButtons.get ('texture').disabled = !connected || busy || (!selected?.modelUrl && !this.assets.has (selected?.id)) || (!hasPrompt && !this.imageFile);
        if (this.addButton) { this.addButton.disabled = !this.assets.has (this.selectedTask); }
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

    async StartTextTo3D () { return this.Generate (this.UIOptions ('text3d')); }
    async PollTextTo3DTask (id) { return this.PollTask ('text-to-3d', id); }

    async RefineTask (item)
    {
        this.AssertEditable ();
        if (!item?.id || item.status !== 'SUCCEEDED' || item.type !== 'text-to-3d-preview') { throw new Error ('Select a completed Text to 3D preview.'); }
        const owner = this.website.auth.user.id;
        const { result } = await this.RequestJSON (this.settings.baseUrl + '/text-to-3d', { method : 'POST', headers : this.Headers (true), body : JSON.stringify ({ mode : 'refine', preview_task_id : item.id, enable_pbr : this.pbrCheckbox.checked, texture_resolution : this.textureResolution.value, target_formats : ['glb'] }) });
        if (typeof result.result !== 'string' || !result.result) { throw new Error ('Provider did not return a task ID.'); }
        const task = { id : result.result, name : item.name, status : 'PENDING', progress : 0, route : 'text-to-3d', type : 'text-to-3d-refine', provider : 'Meshy', createdAt : Date.now () }; this.UpsertTask (task);
        this.PollTask ('text-to-3d', task.id, owner).catch (error => { if (owner === this.website.auth?.user?.id) { this.status.textContent = error.message; } }); return { queued : task.id, route : task.route };
    }

    async ImportTask (item) { await this.SelectTask (item.id); return this.AddSelected (); }

    NormalizeMeshyTask (item)
    {
        return {
            id : item.id,
            name : item.prompt || (item.type === 'image-to-3d' ? 'Image to 3D' : 'Text to 3D'),
            status : item.status || 'UNKNOWN',
            progress : Number.isFinite (item.progress) ? item.progress : null,
            thumbnail : item.thumbnail_url || item.image_urls?.[0] || null,
            imageUrl : item.image_urls?.[0] || null,
            route : item.route || (item.type?.startsWith ('text-to-3d') ? 'text-to-3d' : item.type === 'animate' ? 'animations' : item.type),
            modelUrl : item.model_urls?.glb || item.result?.rigged_character_glb_url || item.result?.animation_glb_url || null,
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
        this.recent = this.recent.filter ((item, index) => index < 48 || this.assets.has (item.id));
        this.RenderRecent (); this.ScheduleWorkspaceSave ();
    }

    async Run (action) { try { return await action (); } catch (error) { this.status.textContent = error.message; return null; } }
    AssertEditable () { if (this.website.sessionEditor.readOnly || !this.website.auth?.user?.id) { throw new Error ('Sign in to an editable workspace.'); } }
    Inspect () { return { selected : this.selectedTask, tasks : this.recent.map (item => ({ ...item, loaded : this.assets.has (item.id), scale : this.assets.get (item.id)?.scale || 1 })), models : this.assets.size }; }
    UIOptions (action)
    {
        return { action, prompt : this.prompt.value.trim (), detail : this.detailSelect.value, pbr : this.pbrCheckbox.checked, textureResolution : this.textureResolution.value, imageModel : this.imageModel.value, aspect : this.aspect.value, taskId : this.selectedTask };
    }
    PrimaryGenerationAction ()
    {
        const selected = this.recent.find (item => item.id === this.selectedTask);
        return this.imageFile || (!this.prompt.value.trim () && selected?.imageUrl) ? 'image3d' : 'text3d';
    }
    async ReferenceImage ()
    {
        if (!this.imageFile) { return null; }
        if (!['image/png', 'image/jpeg', 'image/webp'].includes (this.imageFile.type) || this.imageFile.size > 20 * 1024 * 1024) { throw new Error ('Choose a PNG, JPG or WebP image up to 20 MB.'); }
        return new Promise ((resolve, reject) => { const reader = new FileReader (); reader.onload = () => resolve (reader.result); reader.onerror = () => reject (new Error ('Cannot read reference image.')); reader.readAsDataURL (this.imageFile); });
    }
    async Generate (options)
    {
        this.AssertEditable (); if (this.submitting) { throw new Error ('A generation is already being submitted.'); }
        const { action, prompt = '', detail = 'standard:30000', pbr = true, textureResolution = '2k', imageModel = 'nano-banana', aspect = '1:1', taskId = this.selectedTask, actionId = 92, height = 1.7 } = options;
        if (this.settings.provider !== 'meshy') { throw new Error ('Choose Meshy in AI connections.'); }
        if (!['text3d', 'image3d', 'textimage', 'texture', 'rigging', 'animations'].includes (action) || typeof prompt !== 'string' || prompt.length > 800 || !['2k', '4k'].includes (textureResolution)) { throw new Error ('Invalid AI generation options.'); }
        const selected = this.recent.find (item => item.id === taskId); let route, payload;
        const [mode, faces] = detail.split (':'); if (!['smart', 'standard'].includes (mode) || ![4000, 10000, 30000, 75000, 150000].includes (Number (faces))) { throw new Error ('Choose a supported detail preset.'); }
        const topology = { model_type : mode === 'smart' ? 'smart-topology' : 'standard', ai_model : mode === 'smart' ? 'meshy-t2' : 'latest', ...(mode === 'smart' ? { topology : 'triangle' } : { should_remesh : true }), target_polycount : Number (faces) };
        if (action === 'text3d') { if (!prompt.trim ()) { throw new Error ('Enter a prompt.'); } route = 'text-to-3d'; payload = { mode : 'preview', prompt, target_formats : ['glb'], ...topology }; }
        if (action === 'textimage') { if (!prompt.trim () || !['nano-banana', 'nano-banana-2', 'nano-banana-2-lite', 'nano-banana-pro', 'gpt-image-2'].includes (imageModel) || !['1:1', '16:9', '9:16', '4:3', '3:4'].includes (aspect)) { throw new Error ('Choose an image model, aspect and prompt.'); } route = 'text-to-image'; payload = { prompt, ai_model : imageModel, aspect_ratio : aspect }; }
        if (action === 'image3d') { const image = await this.ReferenceImage (); if (!image && !selected?.imageUrl) { throw new Error ('Upload an image or select a generated image.'); } route = 'image-to-3d'; payload = { ...(image ? { image_url : image } : { input_task_id : selected.id }), ...topology, should_texture : true, enable_pbr : pbr, texture_resolution : textureResolution, target_formats : ['glb'] }; }
        if (['texture', 'rigging', 'animations'].includes (action) && (!selected || selected.status !== 'SUCCEEDED' || (!selected.modelUrl && !this.assets.has (selected.id)))) { throw new Error ('Select a completed 3D model.'); }
        if (action === 'texture') { const image = await this.ReferenceImage (); if (!image && !prompt.trim ()) { throw new Error ('Enter a texture prompt or reference image.'); } route = 'retexture'; payload = { input_task_id : selected.id, ...(image ? { image_style_url : image } : { text_style_prompt : prompt }), enable_original_uv : true, enable_pbr : pbr, texture_resolution : textureResolution }; }
        if (action === 'rigging') { if (!Number.isFinite (height) || height <= 0 || height > 100) { throw new Error ('Enter a positive character height up to 100 meters.'); } route = 'rigging'; payload = { input_task_id : selected.id, height_meters : height }; }
        if (action === 'animations') { if (selected.route !== 'rigging' || !Number.isInteger (actionId) || actionId < 0) { throw new Error ('Select a completed rig and a valid animation action ID.'); } route = 'animations'; payload = { rig_task_id : selected.id, action_id : actionId }; }
        const owner = this.website.auth.user.id; this.submitting = true; this.status.textContent = 'Submitting ' + route + '…';
        try { const { result } = await this.RequestJSON (this.settings.baseUrl + '/' + route, { method : 'POST', headers : this.Headers (true), body : JSON.stringify (payload) });
            if (typeof result.result !== 'string' || !result.result) { throw new Error ('Provider did not return a task ID.'); }
            const task = { id : result.result, route, type : action === 'text3d' ? 'text-to-3d-preview' : route, name : prompt || selected?.name || route, status : 'PENDING', progress : 0, createdAt : Date.now (), provider : 'Meshy' }; this.UpsertTask (task);
            // Poll independently; callers receive the real queued task without waiting for a long generation.
            this.PollTask (route, task.id, owner).catch (error => { if (owner === this.website.auth?.user?.id) { this.status.textContent = error.message; } }); return { queued : task.id, route };
        } finally { this.submitting = false; this.RefreshActions (); }
    }
    async PollTask (route, id, owner = this.website.auth?.user?.id)
    {
        let failures = 0;
        for (let attempt = 0; attempt < 720; attempt++) {
            if (owner !== this.website.auth?.user?.id) { throw new Error ('Account changed.'); }
            let result, response;
            try { ({ result, response } = await this.RequestJSON (this.settings.baseUrl + '/' + route + '/' + encodeURIComponent (id), { headers : this.Headers () })); failures = 0; }
            catch (error) {
                if (owner !== this.website.auth?.user?.id) { throw new Error ('Account changed.'); }
                if (!(error.transient || error.status === 429 || error.status >= 500) || ++failures > 6) { throw error; }
                const retry = Number (error.retryAfter); if (Number.isFinite (retry) && retry > 3600) { throw new Error ('Meshy requested a longer wait. Refresh creations later.'); }
                const seconds = Number.isFinite (retry) && retry > 0 ? retry : Math.min (2 ** failures, 30);
                this.status.textContent = 'Connection interrupted; checking generation again…'; await Delay (seconds * 1000); continue;
            }
            const existing = this.recent.find (item => item.id === id); const task = this.NormalizeMeshyTask ({ ...result, route, type : existing?.type || result.type, prompt : result.prompt || existing?.name }); this.UpsertTask (task); this.status.textContent = route + ' · ' + (task.progress || 0) + '%';
            if (task.status === 'SUCCEEDED') { this.status.textContent = 'Complete · select Preview to review'; return task; }
            if (['FAILED', 'CANCELED'].includes (task.status)) { throw new Error (result.task_error?.message || 'Generation ' + task.status.toLowerCase ()); }
            const retry = Number (response.headers.get ('Retry-After')); if (Number.isFinite (retry) && retry > 3600) { throw new Error ('Meshy requested a longer wait. Refresh creations later.'); }
            await Delay (Number.isFinite (retry) && retry > 0 ? retry * 1000 : 4000);
        }
        throw new Error ('Generation polling timed out. Refresh creations to check its status.');
    }
    async EnsurePreview () { if (!this.preview) { const { AIPreview } = await import ('./aipreview.js'); this.preview = new AIPreview (this.previewHost); } return this.preview; }
    async SelectTask (id)
    {
        const task = this.recent.find (item => item.id === id); if (!task) { throw new Error ('Creation not found.'); }
        this.selectedTask = id; const sequence = ++this.previewSequence; const owner = this.website.auth?.user?.id;
        this.RenderRecent (); this.previewMessage.hidden = false; this.previewMessage.textContent = 'Loading ' + task.name + '…';
        if (!task.modelUrl && !this.assets.has (id)) { this.preview?.Clear (); this.previewImage?.remove (); if (task.imageUrl) { this.previewImage = Element ('img', 'ai_image_preview', undefined, this.previewHost); this.previewImage.src = task.imageUrl; } this.previewMessage.textContent = task.imageUrl ? 'Generated reference image' : task.status; this.ScheduleWorkspaceSave (); return { selected : id, image : !!task.imageUrl }; }
        this.previewImage?.remove ();
        let asset = this.assets.get (id);
        if (!asset) { const response = await fetch (this.settings.baseUrl + '/model?url=' + encodeURIComponent (task.modelUrl), { headers : this.Headers () }); if (!response.ok) { throw new Error ('Model download failed (' + response.status + '). Refresh expired creations.'); } const buffer = await response.arrayBuffer (); if (owner !== this.website.auth?.user?.id) { throw new Error ('Account changed.'); } asset = { ...task, buffer, scale : 1 }; this.assets.set (id, asset); }
        if (sequence !== this.previewSequence) { return { superseded : true }; }
        const preview = await this.EnsurePreview (); if (sequence !== this.previewSequence) { return { superseded : true }; }
        const loaded = await preview.Load (asset.buffer, asset.scale, (done, total) => { this.previewMessage.textContent = 'Loading model ' + done + ' / ' + total; });
        if (sequence !== this.previewSequence || !loaded) { return { superseded : true }; }
        if (!task.thumbnail) { task.thumbnail = preview.Thumbnail (); this.RenderRecent (); } this.previewMessage.hidden = true; this.scaleInput.value = String (asset.scale); this.RefreshActions (); this.ScheduleWorkspaceSave (); return { selected : id, loaded : true, scale : asset.scale, animations : preview.clipCount };
    }
    async SetScale (scale) { this.AssertEditable (); if (!Number.isFinite (scale) || scale < .001 || scale > 1000) { throw new Error ('Scale must be between 0.001 and 1000.'); } const asset = this.assets.get (this.selectedTask); if (!asset) { throw new Error ('Preview a 3D model first.'); } asset.scale = scale; await this.SelectTask (asset.id); return { id : asset.id, scale }; }
    async AddSelected ()
    {
        this.AssertEditable (); const asset = this.assets.get (this.selectedTask); if (!asset) { throw new Error ('Preview a completed 3D model first.'); } const editor = this.website.sessionEditor;
        if (editor.busy || this.adding) { throw new Error ('Wait for the current session operation.'); }
        const owner = this.website.auth.user.id; const document = editor.document; this.adding = true;
        try {
            const { archive } = await AIProjectArchive ([{ ...asset }], asset.name || 'AI model');
            this.AssertEditable (); if (owner !== this.website.auth.user?.id || document !== editor.document || editor.busy) { throw new Error ('Account or workspace changed. Retry adding the model.'); }
            const saved = OpenSessionArchive (archive); MatchAISceneUnits (saved, document);
            const result = await editor.AppendArchive (saved, PlaceAIModel); this.status.textContent = 'Model added to session with textures and scale.'; return result;
        } finally { this.adding = false; }
    }
    async OpenProject (buffer)
    {
        this.AssertEditable (); const session = OpenSessionArchive (buffer); const assets = new Map (); const tasks = [];
        for (const object of session.document.objects) {
            if (!object.userData.ai || !object.animationAsset) { continue; }
            let metadata; try { metadata = JSON.parse (object.userData.ai); } catch { continue; }
            const file = object.animationAsset.files.find (file => file.name === object.animationAsset.main); if (!file || typeof metadata.id !== 'string' || !metadata.id || metadata.id.length > 200) { continue; }
            if (!object.scale.every (value => value === object.scale[0]) || object.scale[0] < .001 || object.scale[0] > 1000) { throw new Error ('AI project requires a uniform model scale between 0.001 and 1000.'); }
            const task = { id : metadata.id, name : object.name, type : metadata.type, route : metadata.route, status : 'SUCCEEDED', provider : 'Meshy', createdAt : Date.now () };
            assets.set (task.id, { ...task, buffer : file.buffer, scale : object.scale[0] }); tasks.push (task);
        }
        if (!assets.size) { throw new Error ('This archive does not contain an AI project.'); }
        this.previewSequence++; this.preview?.Clear (); this.assets = assets; this.recent = tasks; this.projectName.value = session.document.name; this.RenderRecent (); await this.SelectTask (tasks[0].id); this.ScheduleWorkspaceSave (); this.status.textContent = 'AI project opened · ' + assets.size + ' models'; return { opened : true, models : assets.size };
    }
    async OpenLibraryProject (id) { const owner = this.website.auth?.user?.id; this.AssertEditable (); const library = this.website.sessionEditor.library; const item = await library.FindItem ('account', id); const buffer = await library.ArchiveForItem (item); if (owner !== this.website.auth?.user?.id) { throw new Error ('Account changed.'); } return this.OpenProject (buffer); }

    async OpenSaveDialog ()
    {
        this.AssertEditable (); return this.website.sessionEditor.library.SaveDialog (false, { name : this.projectName.value.trim () || 'AI project', prepare : name => this.PrepareProject (name) });
    }
    async PrepareProject (name)
    {
        this.AssertEditable (); const owner = this.website.auth.user.id; if (this.saving) { throw new Error ('Project save already in progress.'); } this.saving = true;
        try { this.status.textContent = 'Saving AI project…'; for (const task of this.recent.filter (item => item.status === 'SUCCEEDED' && item.modelUrl && !this.assets.has (item.id))) {
                this.status.textContent = 'Saving project · downloading ' + task.name + '…'; const response = await fetch (this.settings.baseUrl + '/model?url=' + encodeURIComponent (task.modelUrl), { headers : this.Headers () }); if (!response.ok) { throw new Error ('Cannot save ' + task.name + ': model unavailable. Refresh creations and retry.'); } const buffer = await response.arrayBuffer (); if (owner !== this.website.auth.user?.id) { throw new Error ('Account changed.'); } this.assets.set (task.id, { ...task, buffer, scale : 1 });
            }
            const { archive, objects } = await AIProjectArchive ([...this.assets.values ()].map (asset => ({ ...asset })), name, this.recent);
            if (owner !== this.website.auth.user?.id) { throw new Error ('Account changed.'); } if (!this.preview?.root) { const first = [...this.assets.keys ()][0]; if (first) { await this.SelectTask (first); } } if (!this.preview?.root) { throw new Error ('Preview a model first.'); }
            if (owner !== this.website.auth.user?.id) { throw new Error ('Account changed.'); }
            return { archive, objects, thumbnail : this.preview.Thumbnail () };
        } finally { this.saving = false; }
    }
    async SaveProject ({ name = 'AI project', category = 'Uncategorized' } = {})
    {
        const owner = this.website.auth.user?.id; const prepared = await this.PrepareProject (name); if (!owner || owner !== this.website.auth.user?.id) { throw new Error ('Account changed.'); }
        const result = await this.website.sessionEditor.library.accountStorage.Save ({ name, category, kind : 'session', objects : prepared.objects, archive : new Blob ([prepared.archive]), thumbnail : prepared.thumbnail }); this.status.textContent = 'AI project saved to Library.'; return result;
    }

    async RefreshRecent ()
    {
        if (this.settings.provider !== 'meshy') { this.status.textContent = 'Connect a supported AI provider before loading recent creations.'; return; }
        this.status.textContent = 'Loading recent Meshy creations…';
        try {
            const urls = [
                this.settings.baseUrl + '/text-to-3d?page_size=8&sort_by=-created_at',
                ...['image-to-3d', 'text-to-image', 'retexture'].map (route => this.settings.baseUrl + '/' + route + '?page_size=4&sort_by=-created_at')
            ];
            const owner = this.website.auth?.user?.id;
            const responses = await Promise.allSettled (urls.map (url => this.RequestJSON (url, { headers : this.Headers () })));
            if (owner !== this.website.auth?.user?.id) { throw new Error ('Account changed.'); }
            const successful = responses.filter (item => item.status === 'fulfilled');
            if (!successful.length) { throw responses[0].reason; }
            const groups = successful.map (item => Array.isArray (item.value.result) ? item.value.result : []);
            const loaded = groups.flat ().filter ((item) => item && item.id).map ((item) => this.NormalizeMeshyTask (item)).sort ((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice (0, 12);
            for (const task of loaded) { this.UpsertTask (task); }
            this.RenderRecent ();
            this.status.textContent = successful.length < responses.length ? 'Some creation history could not be loaded. Try refreshing again.' : this.recent.length ? 'Loaded ' + this.recent.length + ' recent creations.' : 'No recent Meshy 3D creations found.';
        } catch (error) {
            this.status.textContent = error.message; throw error;
        }
    }

    RenderRecent ()
    {
        if (!this.recentGrid) { return; }
        this.recentGrid.replaceChildren ();
        if (!this.recent.length) {
            const empty = Element ('div', 'ai_recent_empty', undefined, this.recentGrid); Element ('strong', null, 'No AI creations yet', empty); Element ('span', null, 'Completed generations will appear here with thumbnail, status, provider, and import action.', empty); return;
        }
        for (const item of this.recent.slice (0, 48)) {
            const card = Element ('div', 'ai_recent_card', undefined, this.recentGrid);
            card.dataset.taskId = item.id; card.classList.toggle ('selected', item.id === this.selectedTask);
            const previewButton = Element ('button', 'ai_preview_button', 'Preview', card); previewButton.addEventListener ('click', () => this.Run (() => this.SelectTask (item.id)));
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
                const refine = Element ('button', null, 'Generate texture', actions); refine.addEventListener ('click', () => this.Run (() => this.RefineTask (item)));
                const retry = Element ('button', null, 'Refine', actions); retry.disabled = true; retry.title = 'Free geometry retry is available in Meshy, but is not documented in its public API.';
            }
            if (item.status === 'SUCCEEDED' && item.modelUrl) {
                const importButton = Element ('button', null, 'Import GLB', actions); importButton.addEventListener ('click', () => this.Run (() => this.ImportTask (item)));
            }
        }
        this.RefreshActions ();
    }
}
