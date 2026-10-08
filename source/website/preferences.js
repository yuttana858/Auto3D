import { Theme } from './settings.js';
import { WorkspaceDialog } from './modellibrary.js';
import { Unit } from '../engine/model/unit.js';
import { OpenCommandPanel } from './commandpanel.js';

export const AppVersion = '0.27.0';

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
        try {
            const profile = JSON.parse (localStorage.getItem ('auto3d-user-preferences-v1') || '{}');
            this.units = profile.units === 'standard' || localStorage.getItem ('sw-auto3d-units') === 'standard' ? 'standard' : 'metric';
        } catch { /* Storage can be disabled. */ }
        website.sidebar.detailsPanel.unitSystem = this.units;
        const badge = document.createElement ('span'); badge.className = 'version_badge'; badge.textContent = 'v' + AppVersion;
        document.querySelector ('.title_left').appendChild (badge);
        const button = document.createElement ('button'); button.className = 'preferences_button'; button.title = 'Preferences'; button.setAttribute ('aria-label', 'Preferences');
        button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></svg>';
        button.addEventListener ('click', () => this.Open ()); document.getElementById ('header_buttons').appendChild (button);
    }

    Open ()
    {
        const dialog = WorkspaceDialog ('Preferences');
        const form = document.createElement ('div'); form.className = 'workspace_save_form';
        const adminArea = document.createElement ('section'); form.appendChild (adminArea);
        const adminLink = document.createElement ('a'); adminLink.href = '?admin=accounts'; adminLink.textContent = 'Account administration — requests and approvals';
        adminLink.addEventListener ('click', async (event) => { event.preventDefault (); try { await this.website.accountAdmin.Open (); dialog.close (); } catch (error) { adminLink.textContent = error.message; } });
        this.website.accountAdmin?.Refresh ().then ((data) => { if (data.isAdmin && dialog.isConnected) { const title = document.createElement ('strong'); title.textContent = 'Administrator'; adminArea.append (title, document.createElement ('br'), adminLink); } }).catch ((error) => { if (dialog.isConnected && this.website.auth?.user) { const message = document.createElement ('p'); message.setAttribute ('role', 'status'); message.textContent = error.message; adminArea.replaceChildren (message); } });
        const appearance = document.createElement ('label'); appearance.textContent = 'Appearance';
        const theme = document.createElement ('select'); theme.setAttribute ('aria-label', 'Appearance'); theme.add (new Option ('Light', String (Theme.Light))); theme.add (new Option ('Dark', String (Theme.Dark))); theme.value = String (this.website.settings.themeId);
        theme.addEventListener ('change', () => this.website.SwitchTheme (Number (theme.value), true)); appearance.appendChild (theme);
        const unitLabel = document.createElement ('label'); unitLabel.textContent = 'Units';
        const units = document.createElement ('select'); units.setAttribute ('aria-label', 'Units'); units.add (new Option ('Metric (mm)', 'metric')); units.add (new Option ('Standard (in)', 'standard')); units.value = this.units;
        units.addEventListener ('change', () => {
            this.SetUnits (units.value);
        }); unitLabel.appendChild (units);
        const aiHeading = document.createElement ('strong'); aiHeading.textContent = 'AI connections';
        const aiProviderLabel = document.createElement ('label'); aiProviderLabel.textContent = 'Provider';
        const aiProvider = document.createElement ('select'); aiProvider.setAttribute ('aria-label', 'AI provider'); aiProvider.add (new Option ('Meshy', 'meshy')); aiProvider.add (new Option ('Custom REST provider', 'custom')); aiProvider.value = this.website.aiWorkspace?.settings.provider || 'meshy'; aiProviderLabel.appendChild (aiProvider);
        const aiBaseLabel = document.createElement ('label'); aiBaseLabel.textContent = 'Auto3D AI proxy';
        const aiBase = document.createElement ('input'); aiBase.type = 'text'; aiBase.value = this.website.aiWorkspace?.settings.baseUrl || '/api/ai'; aiBase.autocomplete = 'off'; aiBase.spellcheck = false; aiBase.setAttribute ('aria-label', 'Auto3D AI proxy URL'); aiBaseLabel.appendChild (aiBase);
        const aiKeyLabel = document.createElement ('label'); aiKeyLabel.textContent = 'Meshy API key (optional when server key is configured)';
        const aiKey = document.createElement ('input'); aiKey.type = 'password'; aiKey.value = this.website.aiWorkspace?.settings.apiKey || ''; aiKey.placeholder = 'msy_… or leave blank for server key'; aiKey.autocomplete = 'off'; aiKey.setAttribute ('aria-label', 'AI provider API key'); aiKeyLabel.appendChild (aiKey);
        const rememberLabel = document.createElement ('label'); rememberLabel.className = 'share_option'; const remember = document.createElement ('input'); remember.type = 'checkbox'; remember.checked = this.website.aiWorkspace?.settings.remember === true; rememberLabel.append (remember, document.createTextNode (' Remember key on this device'));
        const aiNote = document.createElement ('p'); aiNote.className = 'section_hint'; aiNote.textContent = 'Auto3D routes Meshy requests through its same-origin server proxy because Meshy blocks browser CORS requests. API keys are never saved inside .auto3d sessions. For shared deployments, leave this field blank and configure MESHY_API_KEY as a server secret; the browser-stored key is intended only for personal/local use.';
        const aiActions = document.createElement ('div'); aiActions.className = 'mode_buttons';
        const saveAI = document.createElement ('button'); saveAI.textContent = 'Save connection'; saveAI.className = 'workspace_primary';
        const testAI = document.createElement ('button'); testAI.textContent = 'Test connection';
        const clearAI = document.createElement ('button'); clearAI.textContent = 'Clear key';
        const aiStatus = document.createElement ('p'); aiStatus.className = 'section_hint'; aiStatus.setAttribute ('role', 'status');
        const saveConnection = () => {
            this.website.aiWorkspace?.SaveSettings ({ provider : aiProvider.value, baseUrl : aiBase.value, apiKey : aiKey.value, remember : remember.checked });
            aiStatus.textContent = 'AI connection settings saved for this ' + (remember.checked ? 'browser profile.' : 'browser session.');
        };
        saveAI.addEventListener ('click', saveConnection);
        testAI.addEventListener ('click', async () => {
            saveConnection (); testAI.disabled = true; aiStatus.textContent = 'Testing connection…';
            try { const result = await this.website.aiWorkspace.TestConnection (); aiStatus.textContent = Number.isFinite (result.balance) ? 'Connected · ' + result.balance + ' credits available.' : 'Connection succeeded.'; }
            catch (error) { aiStatus.textContent = error.message; }
            finally { testAI.disabled = false; }
        });
        clearAI.addEventListener ('click', () => { aiKey.value = ''; this.website.aiWorkspace?.ClearKey (); aiStatus.textContent = 'API key cleared.'; });
        aiProvider.addEventListener ('change', () => { if (aiProvider.value === 'meshy' && (!aiBase.value || aiBase.value.includes ('meshy.ai'))) { aiBase.value = '/api/ai'; } });
        aiActions.append (saveAI, testAI, clearAI);
        const about = document.createElement ('p'); about.className = 'preferences_about';
        about.textContent = 'SW Auto3D v' + AppVersion + ' — A browser workspace for inspecting, arranging and reviewing 3D models, materials, lighting and reusable layouts. Dimensions use the units declared by the source model; unspecified units remain model units.';
        const commands = document.createElement ('button'); commands.textContent = 'Commands and macros'; commands.className = 'workspace_primary'; commands.addEventListener ('click', () => { dialog.close (); OpenCommandPanel (this.website); });
        const heading = document.createElement ('strong'); heading.textContent = 'About'; form.append (appearance, unitLabel, commands, aiHeading, aiProviderLabel, aiBaseLabel, aiKeyLabel, rememberLabel, aiNote, aiActions, aiStatus, heading, about); dialog.appendChild (form);
    }

    SetUnits (units)
    {
        this.units = units; this.website.sidebar.detailsPanel.unitSystem = units;
        try {
            const profile = JSON.parse (localStorage.getItem ('auto3d-user-preferences-v1') || '{}');
            profile.units = units;
            localStorage.setItem ('auto3d-user-preferences-v1', JSON.stringify (profile));
            localStorage.setItem ('sw-auto3d-units', units);
        } catch { /* Keep this session preference. */ }
        if (this.website.model) {
            this.website.sidebar.AddObject3DProperties (this.website.model, this.website.model);
            this.website.sessionEditor.UnitsChanged ();
        }
    }
}
