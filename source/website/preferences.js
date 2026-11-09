import { OpenErrorLog } from './errorlogpanel.js';
import { AgentAccessFor } from './agentaccess.js';
import { RGBAColor, RGBColor } from '../engine/model/color.js';
import { AccountConsole } from './accountpaths.js';
import { Theme, Settings, CameraSettings } from './settings.js';
import { WorkspaceDialog } from './modellibrary.js';
import { Unit } from '../engine/model/unit.js';
import { OpenCommandPanel } from './commandpanel.js';

export const AppVersion = '0.54.1';

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
    return { settings, camera, units : preferences?.units === 'standard' ? 'standard' : 'metric', viewportQuality : ['auto', 'fast', 'quality'].includes (preferences?.viewportQuality) ? preferences.viewportQuality : 'auto' };
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
        const dialog = WorkspaceDialog ('Preferences');
        dialog.classList.add ('preferences_dialog');
        const form = document.createElement ('div'); form.className = 'workspace_save_form preferences_form';
        const grid = document.createElement ('div'); grid.className = 'preferences_grid'; form.appendChild (grid);
        const section = (title) => {
            const element = document.createElement ('section'); element.className = 'preferences_section';
            const heading = document.createElement ('h3'); heading.textContent = title; element.appendChild (heading);
            return element;
        };
        const adminArea = section ('Administrator'); adminArea.hidden = true;
        const adminLink = document.createElement ('a'); adminLink.href = '?console=' + AccountConsole; adminLink.textContent = 'Account administration — requests and approvals';
        adminLink.addEventListener ('click', async (event) => { event.preventDefault (); try { await this.website.accountAdmin.Open (); dialog.close (); } catch (error) { adminLink.textContent = error.message; } });
        adminArea.appendChild (adminLink);
        this.website.accountAdmin?.Refresh ().then ((data) => { if (data.isAdmin && dialog.isConnected) { adminArea.hidden = false; } }).catch ((error) => { if (dialog.isConnected && this.website.auth?.user) { const message = document.createElement ('p'); message.setAttribute ('role', 'status'); message.textContent = error.message; adminArea.appendChild (message); adminArea.hidden = false; } });
        const display = section ('Display');
        const displayControls = document.createElement ('div'); displayControls.className = 'preferences_display_controls';
        const appearance = document.createElement ('label'); appearance.textContent = 'Appearance';
        const theme = document.createElement ('select'); theme.setAttribute ('aria-label', 'Appearance'); theme.add (new Option ('Light', String (Theme.Light))); theme.add (new Option ('Dark', String (Theme.Dark))); theme.value = String (this.website.settings.themeId);
        theme.addEventListener ('change', () => { this.website.SwitchTheme (Number (theme.value), true); }); appearance.appendChild (theme);
        const unitLabel = document.createElement ('label'); unitLabel.textContent = 'Units';
        const qualityLabel = document.createElement ('label'); qualityLabel.textContent = 'Viewport quality';
        const quality = document.createElement ('select'); quality.setAttribute ('aria-label', 'Viewport quality');
        quality.add (new Option ('Auto — faster while moving', 'auto')); quality.add (new Option ('Fast — reduced display resolution', 'fast')); quality.add (new Option ('Quality — native display resolution', 'quality')); quality.value = this.viewportQuality;
        quality.addEventListener ('change', () => { this.SetViewportQuality (quality.value).catch (error => { syncStatus.textContent = error.message; }); }); qualityLabel.appendChild (quality);
        const qualityNote = document.createElement ('p'); qualityNote.className = 'section_hint'; qualityNote.textContent = 'Display quality never changes model geometry, saved files or final render resolution. Auto restores detail after camera movement stops.';
        const units = document.createElement ('select'); units.setAttribute ('aria-label', 'Units'); units.add (new Option ('Metric (mm)', 'metric')); units.add (new Option ('Standard (in)', 'standard')); units.value = this.units;
        units.addEventListener ('change', () => {
            this.SetUnits (units.value).catch ((error) => { syncStatus.textContent = error.message; });
        }); unitLabel.appendChild (units);
        displayControls.append (appearance, unitLabel, qualityLabel); display.append (displayControls, qualityNote);
        const ai = section ('AI connections');
        const aiContent = document.createElement ('div'); aiContent.className = 'preferences_section_content';
        const aiNote = document.createElement ('p'); aiNote.className = 'section_hint'; aiNote.textContent = 'Connect your own Meshy account to use your credits.';
        const aiActions = document.createElement ('div'); aiActions.className = 'mode_buttons';
        const testAI = document.createElement ('button'); testAI.textContent = 'Test connection';
        const aiStatus = document.createElement ('p'); aiStatus.className = 'section_hint'; aiStatus.setAttribute ('role', 'status');
        testAI.addEventListener ('click', async () => {
            testAI.disabled = true; aiStatus.textContent = 'Testing connection…';
            try { const result = await this.website.aiWorkspace.TestConnection (); aiStatus.textContent = Number.isFinite (result.balance) ? 'Connected · ' + result.balance + ' credits available.' : 'Connection succeeded.'; }
            catch (error) { aiStatus.textContent = error.message; }
            finally { testAI.disabled = false; }
        });
        const manageAI = document.createElement ('button'); manageAI.textContent = 'Manage Meshy key';
        manageAI.className = 'workspace_primary';
        manageAI.addEventListener ('click', () => { dialog.close (); this.website.aiWorkspace.OpenConnection (); });
        aiActions.append (manageAI, testAI);
        aiContent.append (aiNote, aiActions, aiStatus); ai.appendChild (aiContent);
        const syncStatus = document.createElement ('p'); syncStatus.setAttribute ('role', 'status'); syncStatus.textContent = 'Theme and units are saved automatically to your account.'; this.syncStatus = syncStatus;
        display.appendChild (syncStatus);
        const about = document.createElement ('p'); about.className = 'preferences_about';
        about.textContent = 'SW Auto3D v' + AppVersion + ' · Build ' + AppBuildInfo ().build + ' — A browser workspace for inspecting, arranging and reviewing 3D models, materials, lighting and reusable layouts. Dimensions use the units declared by the source model; unspecified units remain model units.';
        const tools = section ('Tools');
        const toolActions = document.createElement ('div'); toolActions.className = 'preferences_actions';
        const commands = document.createElement ('button'); commands.textContent = 'Commands and macros'; commands.className = 'workspace_primary'; commands.addEventListener ('click', () => { dialog.close (); OpenCommandPanel (this.website); });
        const errorLogs = document.createElement ('button'); errorLogs.textContent = 'Error logs'; errorLogs.addEventListener ('click', () => { dialog.close (); OpenErrorLog (this.website); });
        const agentAccess = document.createElement ('button'); agentAccess.textContent = 'Agent access'; agentAccess.addEventListener ('click', () => { AgentAccessFor (this.website).Open ().then (() => dialog.close ()).catch (error => { syncStatus.textContent = error.message; }); });
        const agentAdmin = document.createElement ('button'); agentAdmin.textContent = 'Agent administration'; agentAdmin.addEventListener ('click', () => { AgentAccessFor (this.website).OpenAdmin ().then (() => dialog.close ()).catch (error => { syncStatus.textContent = error.message; }); });
        const recovery = document.createElement ('button'); recovery.textContent = 'Recover unsaved session'; recovery.addEventListener ('click', () => { dialog.close (); this.website.sessionEditor.OfferRecovery (true).catch (error => this.website.sessionEditor.Status (error.message)); });
        const agentControls = globalThis.location?.hostname === 'auto3d-mcp-pilot.pages.dev' || globalThis.location?.hostname === 'auto3d-5av.pages.dev' && this.website.accountAdmin?.isAdmin ? [agentAccess, agentAdmin] : [];
        toolActions.append (commands, errorLogs, recovery, ...agentControls); tools.appendChild (toolActions);
        const aboutSection = section ('About'); aboutSection.appendChild (about);
        grid.append (display, ai, tools, aboutSection, adminArea); dialog.appendChild (form);
    }

    async SetViewportQuality (mode)
    {
        if (!['auto', 'fast', 'quality'].includes (mode)) { throw new Error ('Invalid viewport quality.'); }
        this.viewportQuality = mode; this.website.viewer.SetViewportQuality (mode);
        await this.SaveAccount (); return this.website.viewer.viewportQuality.Inspect ();
    }

    SetUnits (units)
    {
        this.units = units; this.website.sidebar.detailsPanel.unitSystem = units;
        if (this.website.model) {
            this.website.sidebar.AddObject3DProperties (this.website.model, this.website.model);
            this.website.sessionEditor.UnitsChanged ();
        }
        this.website.dimensions?.Draw (this.website.viewer.camera); this.website.primaryProductsPanel?.Refresh (); this.website.measureTool?.UpdatePanel (); this.website.sessionEditor?.packaging?.Refresh ();
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
        const owner = this.accountId; const generation = this.loadGeneration; const preferences = { units : this.units, theme : this.website.settings.themeId, view : this.ViewPreferences (), viewportQuality : this.viewportQuality || 'auto' };
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
