import { OpenErrorLog } from './errorlogpanel.js';
import { RGBAColor, RGBColor } from '../engine/model/color.js';
import { AccountConsole } from './accountpaths.js';
import { Theme, Settings, CameraSettings } from './settings.js';
import { WorkspaceDialog } from './modellibrary.js';
import { Unit } from '../engine/model/unit.js';
import { OpenCommandPanel } from './commandpanel.js';

export const AppVersion = '0.46.0';

export function AppBuildInfo ()
{
    const meta = typeof document === 'undefined' ? null : document.querySelector?.('meta[name="auto3d-build"]');
    return { version : AppVersion, build : meta?.content || 'development' };
}

export function AccountPreferenceState (preferences = {})
{
    const settings = new Settings (preferences?.theme === Theme.Dark ? Theme.Dark : Theme.Light); const camera = new CameraSettings (); const view = preferences?.view || {};
    if (/^[a-zA-Z0-9_-]{1,100}$/.test (view.environmentMapName || '')) { settings.environmentMapName = view.environmentMapName; }
    if (['standard', 'dark', 'light', 'sunset', 'outdoor', 'custom'].includes (view.backgroundPreset)) { settings.backgroundPreset = view.backgroundPreset; }
    for (const key of ['backgroundIsEnvMap', 'horizonGradient', 'showGroundGrid']) { if (typeof view[key] === 'boolean') { settings[key] = view[key]; } }
    const color = (value, count) => Array.isArray (value) && value.length === count && value.every (n => Number.isInteger (n) && n >= 0 && n <= 255);
    if (color (view.backgroundColor, 4)) { settings.backgroundColor = new RGBAColor (...view.backgroundColor); }
    for (const key of ['defaultLineColor', 'defaultColor']) { if (color (view[key], 3)) { settings[key] = new RGBColor (...view[key]); } }
    if (color (view.edgeColor, 3)) { settings.edgeSettings.edgeColor = new RGBColor (...view.edgeColor); }
    if (typeof view.showEdges === 'boolean') { settings.edgeSettings.showEdges = view.showEdges; }
    if (Number.isFinite (view.edgeThreshold) && view.edgeThreshold >= 0 && view.edgeThreshold <= 180) { settings.edgeSettings.edgeThreshold = view.edgeThreshold; }
    for (const key of ['navigationMode', 'projectionMode']) { if ([1, 2].includes (view[key])) { camera[key] = view[key]; } }
    settings.AlignBackgroundWithTheme ();
    return { settings, camera, units : preferences?.units === 'standard' ? 'standard' : 'metric', viewportQuality : ['auto', 'fast', 'quality'].includes (preferences?.viewportQuality) ? preferences.viewportQuality : 'auto', invertRightOrbit : preferences?.invertRightOrbit === true };
}

export function UnitFactor (sourceUnit, system)
{
    const meters = { [Unit.Millimeter] : 0.001, [Unit.Centimeter] : 0.01, [Unit.Meter] : 1, [Unit.Inch] : 0.0254, [Unit.Foot] : 0.3048 }[sourceUnit];
    if (!meters) { return null; }
    return meters / (system === 'standard' ? 0.0254 : 0.001);
}

export function DisplayUnitLabel (system)
{
    return system === 'standard' ? 'inches' : 'mm';
}

export function DisplayLength (value, sourceUnit, system)
{
    const factor = UnitFactor (sourceUnit, system);
    if (factor === null) { return value.toLocaleString (undefined, { maximumFractionDigits : 4 }) + ' model units'; }
    return (value * factor).toLocaleString (undefined, { maximumFractionDigits : 2 }) + ' ' + DisplayUnitLabel (system);
}

export function DisplayQuantity (value, sourceUnit, system, power = 1)
{
    const factor = UnitFactor (sourceUnit, system); const suffix = power === 2 ? '²' : power === 3 ? '³' : '';
    return (value * Math.pow (factor ?? 1, power)).toLocaleString (undefined, { maximumFractionDigits : 3 }) + ' ' + (factor === null ? 'model units' : DisplayUnitLabel (system)) + suffix;
}

export function DisplaySizeFromScale (baseSize, scale, sourceUnit, system)
{
    const factor = UnitFactor (sourceUnit, system);
    return baseSize * Math.abs (scale) * (factor ?? 1);
}

export function ScaleFromDisplaySize (baseSize, displayedSize, sourceUnit, system)
{
    const factor = UnitFactor (sourceUnit, system);
    if (!Number.isFinite (baseSize) || !Number.isFinite (displayedSize) || baseSize <= 1e-12 || displayedSize <= 0) { return null; }
    return displayedSize / (baseSize * (factor ?? 1));
}

export class Preferences
{
    constructor (website)
    {
        this.website = website;
        this.units = 'metric';
        this.viewportQuality = 'auto';
        this.invertRightOrbit = false;
        this.accountId = null; this.applying = false; this.pendingSave = Promise.resolve (); this.loadGeneration = 0; this.loading = null;
        website.sidebar.detailsPanel.unitSystem = this.units;
        const badge = document.createElement ('span'); badge.className = 'version_badge'; badge.textContent = 'v' + AppVersion; badge.title = 'Build ' + AppBuildInfo ().build;
        document.querySelector ('.title_left').appendChild (badge);
        const button = document.createElement ('button'); button.className = 'preferences_button'; button.title = 'Preferences'; button.setAttribute ('aria-label', 'Preferences');
        button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg>';
        button.addEventListener ('click', () => this.Open ()); document.getElementById ('header_buttons').appendChild (button);
    }

    Open ()
    {
        const dialog = WorkspaceDialog ('Preferences'); dialog.classList.add ('preferences_dialog');
        const form = document.createElement ('div'); form.className = 'workspace_save_form preferences_grid';
        const adminArea = document.createElement ('section'); form.appendChild (adminArea);
        const adminLink = document.createElement ('a'); adminLink.href = '?console=' + AccountConsole; adminLink.textContent = 'Account administration — requests and approvals';
        adminLink.addEventListener ('click', async (event) => { event.preventDefault (); try { await this.website.accountAdmin.Open (); dialog.close (); } catch (error) { adminLink.textContent = error.message; } });
        this.website.accountAdmin?.Refresh ().then ((data) => { if (data.isAdmin && dialog.isConnected) { const title = document.createElement ('strong'); title.textContent = 'Administrator'; adminArea.append (title, document.createElement ('br'), adminLink); } }).catch ((error) => { if (dialog.isConnected && this.website.auth?.user) { const message = document.createElement ('p'); message.setAttribute ('role', 'status'); message.textContent = error.message; adminArea.replaceChildren (message); } });
        const appearance = document.createElement ('label'); appearance.textContent = 'Appearance';
        const theme = document.createElement ('select'); theme.setAttribute ('aria-label', 'Appearance'); theme.add (new Option ('Light', String (Theme.Light))); theme.add (new Option ('Dark', String (Theme.Dark))); theme.value = String (this.website.settings.themeId);
        theme.addEventListener ('change', () => { this.website.SwitchTheme (Number (theme.value), true); }); appearance.appendChild (theme);
        const unitLabel = document.createElement ('label'); unitLabel.textContent = 'Units';
        const qualityLabel = document.createElement ('label'); qualityLabel.textContent = 'Viewport quality';
        const quality = document.createElement ('select'); quality.setAttribute ('aria-label', 'Viewport quality');
        quality.add (new Option ('Auto — faster while moving', 'auto')); quality.add (new Option ('Fast — reduced display resolution', 'fast')); quality.add (new Option ('Quality — native display resolution', 'quality')); quality.value = this.viewportQuality;
        quality.addEventListener ('change', () => { this.SetViewportQuality (quality.value).catch (error => { syncStatus.textContent = error.message; }); }); qualityLabel.appendChild (quality);
        const qualityNote = document.createElement ('p'); qualityNote.className = 'section_hint'; qualityNote.textContent = 'Display quality never changes model geometry, saved files or final render resolution. Auto restores detail after camera movement stops.';
        const orbitLabel = document.createElement ('label'); orbitLabel.className = 'preferences_orbit_toggle'; const orbit = document.createElement ('input'); orbit.type = 'checkbox'; orbit.checked = this.invertRightOrbit; orbitLabel.append (orbit, document.createTextNode ('Invert right-drag camera orbit'));
        orbit.addEventListener ('change', () => { this.SetInvertRightOrbit (orbit.checked).catch (error => { syncStatus.textContent = error.message; }); });
        const units = document.createElement ('select'); units.setAttribute ('aria-label', 'Units'); units.add (new Option ('Metric (mm)', 'metric')); units.add (new Option ('Standard (in)', 'standard')); units.value = this.units;
        units.addEventListener ('change', () => {
            this.SetUnits (units.value).catch ((error) => { syncStatus.textContent = error.message; });
        }); unitLabel.appendChild (units);
        const aiHeading = document.createElement ('strong'); aiHeading.textContent = 'AI connections';
        const aiNote = document.createElement ('p'); aiNote.className = 'section_hint'; aiNote.textContent = 'Your Meshy API key is encrypted and used by Auto3D on your behalf. It cannot be displayed after saving.';
        const keyLabel = document.createElement ('label'); keyLabel.textContent = 'Meshy API key'; const keyInput = document.createElement ('input'); keyInput.type = 'password'; keyInput.autocomplete = 'off'; keyInput.maxLength = 512; keyLabel.appendChild (keyInput);
        const keyStatus = document.createElement ('p'); keyStatus.className = 'section_hint'; keyStatus.setAttribute ('role', 'status');
        const keyActions = document.createElement ('div'); keyActions.className = 'mode_buttons';
        const saveKey = document.createElement ('button'); saveKey.type = 'button'; saveKey.textContent = 'Save or replace key';
        const removeKey = document.createElement ('button'); removeKey.type = 'button'; removeKey.textContent = 'Remove key';
        const refreshKey = async () => { try { const result = await this.AgentCredential ('GET'); if (dialog.isConnected) { keyStatus.textContent = result.configured ? 'Personal key saved.' : 'No personal key saved.'; } } catch (error) { if (dialog.isConnected) { keyStatus.textContent = error.message; } } };
        saveKey.addEventListener ('click', async () => { const value = keyInput.value; keyInput.value = ''; saveKey.disabled = true; try { await this.AgentCredential ('PUT', value); keyStatus.textContent = 'Personal key saved.'; } catch (error) { keyStatus.textContent = error.message; } finally { saveKey.disabled = false; } });
        removeKey.addEventListener ('click', async () => { removeKey.disabled = true; try { await this.AgentCredential ('DELETE'); keyStatus.textContent = 'Personal key removed.'; } catch (error) { keyStatus.textContent = error.message; } finally { removeKey.disabled = false; } });
        keyActions.append (saveKey, removeKey); dialog.addEventListener ('close', () => { keyInput.value = ''; }, { once : true }); refreshKey ();
        const aiActions = document.createElement ('div'); aiActions.className = 'mode_buttons';
        const testAI = document.createElement ('button'); testAI.textContent = 'Test connection';
        const aiStatus = document.createElement ('p'); aiStatus.className = 'section_hint'; aiStatus.setAttribute ('role', 'status');
        testAI.addEventListener ('click', async () => {
            testAI.disabled = true; aiStatus.textContent = 'Testing connection…';
            try { const result = await this.website.aiWorkspace.TestConnection (); aiStatus.textContent = Number.isFinite (result.balance) ? 'Connected · ' + result.balance + ' credits available.' : 'Connection succeeded.'; }
            catch (error) { aiStatus.textContent = error.message; }
            finally { testAI.disabled = false; }
        });
        aiActions.append (testAI);
        const syncStatus = document.createElement ('p'); syncStatus.setAttribute ('role', 'status'); syncStatus.textContent = 'Theme and units are saved automatically to your account.'; this.syncStatus = syncStatus;
        const about = document.createElement ('p'); about.className = 'preferences_about';
        about.textContent = 'SW Auto3D v' + AppVersion + ' · Build ' + AppBuildInfo ().build + ' — A browser workspace for inspecting, arranging and reviewing 3D models, materials, lighting and reusable layouts. Dimensions use the units declared by the source model; unspecified units remain model units.';
        const commands = document.createElement ('button'); commands.textContent = 'Commands and macros'; commands.className = 'workspace_primary'; commands.addEventListener ('click', () => { dialog.close (); OpenCommandPanel (this.website); });
        const errorLogs = document.createElement ('button'); errorLogs.textContent = 'Error logs'; errorLogs.addEventListener ('click', () => { dialog.close (); OpenErrorLog (this.website); });
        const recovery = document.createElement ('button'); recovery.textContent = 'Recover unsaved session'; recovery.addEventListener ('click', () => { dialog.close (); this.website.sessionEditor.OfferRecovery (true).catch (error => this.website.sessionEditor.Status (error.message)); });
        const section = (title, ...children) => {
            const details = document.createElement ('details'); details.className = 'preferences_section';
            const summary = document.createElement ('summary'); summary.textContent = title;
            const content = document.createElement ('div'); content.className = 'preferences_section_content'; content.append (...children);
            details.append (summary, content); return details;
        };
        const agentNote = document.createElement ('p'); agentNote.className = 'section_hint';
        agentNote.textContent = 'Connect this window and review or revoke your agent authorizations in your account. Agents use individual OAuth authorization; no password or provider key is stored here.';
        const agentManage = document.createElement ('button'); agentManage.type = 'button'; agentManage.textContent = 'Manage agent access';
        agentManage.addEventListener ('click', () => { dialog.close (); this.website.authPanel.Open (); });
        form.append (section ('Display and units', appearance, unitLabel, qualityLabel, qualityNote, orbitLabel, syncStatus),
            section ('Agent access', agentNote, agentManage), section ('AI connections', aiHeading, aiNote, keyLabel, keyActions, keyStatus, aiActions, aiStatus),
            section ('Workspace tools', commands, errorLogs, recovery), section ('About', about), adminArea);
        dialog.appendChild (form);
    }

    async AgentCredential (method, key)
    {
        const owner = this.website.auth?.user?.id; if (!owner) { throw new Error ('Sign in to manage your AI key.'); }
        const headers = { 'X-Auto3D-Account' : owner }; if (method === 'PUT') { headers['Content-Type'] = 'application/json'; }
        const response = await fetch ('/api/ai/credential', { method, credentials : 'same-origin', headers, ...(method === 'PUT' ? { body : JSON.stringify ({ key }) } : {}) });
        const result = await response.json (); if (this.website.auth?.user?.id !== owner) { throw new Error ('Account changed. Reopen Preferences.'); }
        if (!response.ok) { throw new Error (result.error || 'AI key could not be updated.'); } return result;
    }

    async SetViewportQuality (mode)
    {
        if (!['auto', 'fast', 'quality'].includes (mode)) { throw new Error ('Invalid viewport quality.'); }
        this.viewportQuality = mode; this.website.viewer.SetViewportQuality (mode);
        await this.SaveAccount (); return this.website.viewer.viewportQuality.Inspect ();
    }

    async SetInvertRightOrbit (enabled)
    {
        if (typeof enabled !== 'boolean') { throw new Error ('Invalid camera control preference.'); }
        this.invertRightOrbit = enabled; this.website.viewer.navigation.invertRightOrbit = enabled;
        await this.SaveAccount (); return { invertRightOrbit : enabled };
    }

    SetUnits (units)
    {
        this.units = units; this.website.sidebar.detailsPanel.unitSystem = units;
        if (this.website.model) {
            this.website.sidebar.AddObject3DProperties (this.website.model, this.website.model);
            this.website.sessionEditor.UnitsChanged ();
        }
        this.website.measureTool?.UpdatePanel (); this.website.sessionEditor?.packaging?.Refresh ();
        return this.SaveAccount ();
    }
    LockAccount ()
    {
        this.loadGeneration++; this.loading?.controller.abort (); this.loading = null; this.accountId = null;
        this.website.settings.onChange = this.website.cameraSettings.onChange = null;
    }
    LoadAccount (id)
    {
        if (this.accountId === id) { return Promise.resolve (); }
        if (this.loading?.id === id) { return this.loading.promise; }
        const operation = { id, generation : ++this.loadGeneration, controller : new AbortController () };
        this.loading?.controller.abort (); this.loading = operation;
        operation.promise = (async () => {
            try {
                const response = await fetch ('/api/preferences', { credentials : 'same-origin', headers : { 'X-Auto3D-Account' : id }, signal : operation.controller.signal });
                if (!response.ok) { throw new Error ('Could not load account preferences. Retry saved sign-in.'); }
                const data = await response.json ();
                if (this.website.auth.user?.id !== id || operation.generation !== this.loadGeneration) { throw new Error ('Account changed. Sign in again.'); }
                const state = AccountPreferenceState (data?.preferences); this.applying = true; this.website.viewer.BeginRenderBatch?.();
                try {
                    this.units = state.units; this.website.sidebar.detailsPanel.unitSystem = this.units;
                    this.viewportQuality = state.viewportQuality; this.website.viewer.SetViewportQuality?.(state.viewportQuality);
                    this.invertRightOrbit = state.invertRightOrbit; if (this.website.viewer.navigation) { this.website.viewer.navigation.invertRightOrbit = state.invertRightOrbit; }
                    const settings = this.website.settings; const camera = this.website.cameraSettings;
                    Object.assign (settings, state.settings); Object.assign (camera, state.camera);
                    this.website.SwitchTheme (settings.themeId, false);
                    this.website.viewer.SetNavigationMode (camera.navigationMode); this.website.viewer.SetProjectionMode (camera.projectionMode); this.website.viewer.SetEdgeSettings (settings.edgeSettings);
                    this.website.UpdateEnvironmentMap (); this.website.UpdateViewport (); this.website.sidebar.UpdateControlsStatus ();
                    camera.SaveToCookies ();
                    settings.onChange = camera.onChange = () => this.ScheduleSave ();
                    this.website.sessionEditor.UnitsChanged (); this.website.sessionEditor.library.InitializeAccount (id); this.website.aiWorkspace?.InitializeAccount (id); this.accountId = id;
                }
                finally { this.applying = false; this.website.viewer.EndRenderBatch?.(); }
            } finally { if (this.loading === operation) { this.loading = null; } }
        }) ();
        return operation.promise;
    }
    ViewPreferences ()
    {
        const s = this.website.settings; const camera = this.website.cameraSettings;
        const component = value => Math.round (Math.max (0, Math.min (255, value))); const rgb = (color) => [color.r, color.g, color.b].map (component);
        return { environmentMapName : s.environmentMapName, backgroundIsEnvMap : s.backgroundIsEnvMap, horizonGradient : s.horizonGradient, backgroundPreset : s.backgroundPreset, showGroundGrid : s.showGroundGrid, backgroundColor : [...rgb (s.backgroundColor), component (s.backgroundColor.a)], defaultLineColor : rgb (s.defaultLineColor), defaultColor : rgb (s.defaultColor), showEdges : s.edgeSettings.showEdges, edgeColor : rgb (s.edgeSettings.edgeColor), edgeThreshold : s.edgeSettings.edgeThreshold, navigationMode : camera.navigationMode, projectionMode : camera.projectionMode };
    }
    ScheduleSave () { this.SaveAccount ().catch ((error) => { this.website.sessionEditor.Status (error.message); if (this.syncStatus?.isConnected) { this.syncStatus.textContent = error.message; } }); }
    SaveAccount ()
    {
        if (this.applying || !this.accountId || this.website.auth.user?.id !== this.accountId) { return Promise.resolve (); }
        const owner = this.accountId; const generation = this.loadGeneration; const preferences = { units : this.units, theme : this.website.settings.themeId, view : this.ViewPreferences (), viewportQuality : this.viewportQuality || 'auto', invertRightOrbit : this.invertRightOrbit === true };
        this.pendingSave = this.pendingSave.catch (() => {}).then (async () => {
            if (this.website.auth.user?.id !== owner || generation !== this.loadGeneration) { return; }
            if (this.syncStatus?.isConnected) { this.syncStatus.textContent = 'Saving account preferences…'; }
            const response = await fetch ('/api/preferences', { method : 'PUT', credentials : 'same-origin', headers : { 'Content-Type' : 'application/json', 'X-Auto3D-Account' : owner }, body : JSON.stringify ({ preferences }) });
            if (!response.ok) { throw new Error ('Account preferences could not be saved. Retry the change.'); }
            if (this.website.auth.user?.id === owner && this.syncStatus?.isConnected) { this.syncStatus.textContent = 'Account preferences saved.'; }
        });
        return this.pendingSave;
    }
}
