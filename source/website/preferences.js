import { Theme } from './settings.js';
import { WorkspaceDialog } from './modellibrary.js';
import { Unit } from '../engine/model/unit.js';
import { OpenCommandPanel } from './commandpanel.js';

export const AppVersion = '0.20.2';

export function DisplayLength (value, sourceUnit, system)
{
    const meters = { [Unit.Millimeter] : 0.001, [Unit.Centimeter] : 0.01, [Unit.Meter] : 1, [Unit.Inch] : 0.0254, [Unit.Foot] : 0.3048 }[sourceUnit];
    if (!meters) { return value.toLocaleString (undefined, { maximumFractionDigits : 4 }) + ' model units'; }
    return (value * meters / (system === 'standard' ? 0.0254 : 0.001)).toLocaleString (undefined, { maximumFractionDigits : 2 }) + (system === 'standard' ? ' in' : ' mm');
}

export class Preferences
{
    constructor (website)
    {
        this.website = website;
        this.units = 'metric';
        try { this.units = localStorage.getItem ('sw-auto3d-units') === 'standard' ? 'standard' : 'metric'; } catch { /* Storage can be disabled. */ }
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
        const appearance = document.createElement ('label'); appearance.textContent = 'Appearance';
        const theme = document.createElement ('select'); theme.setAttribute ('aria-label', 'Appearance'); theme.add (new Option ('Light', String (Theme.Light))); theme.add (new Option ('Dark', String (Theme.Dark))); theme.value = String (this.website.settings.themeId);
        theme.addEventListener ('change', () => this.website.SwitchTheme (Number (theme.value), true)); appearance.appendChild (theme);
        const unitLabel = document.createElement ('label'); unitLabel.textContent = 'Units';
        const units = document.createElement ('select'); units.setAttribute ('aria-label', 'Units'); units.add (new Option ('Metric (mm)', 'metric')); units.add (new Option ('Standard (in)', 'standard')); units.value = this.units;
        units.addEventListener ('change', () => {
            this.SetUnits (units.value);
        }); unitLabel.appendChild (units);
        const about = document.createElement ('p'); about.className = 'preferences_about';
        about.textContent = 'SW Auto3D v' + AppVersion + ' — A browser workspace for inspecting, arranging and reviewing 3D models, materials, lighting and reusable layouts. Dimensions use the units declared by the source model; unspecified units remain model units.';
        const commands = document.createElement ('button'); commands.textContent = 'Commands and macros'; commands.className = 'workspace_primary'; commands.addEventListener ('click', () => { dialog.close (); OpenCommandPanel (this.website); });
        const heading = document.createElement ('strong'); heading.textContent = 'About'; form.append (appearance, unitLabel, commands, heading, about); dialog.appendChild (form);
    }

    SetUnits (units)
    {
        this.units = units; this.website.sidebar.detailsPanel.unitSystem = units;
        try { localStorage.setItem ('sw-auto3d-units', units); } catch { /* Keep this session preference. */ }
        if (this.website.model) { this.website.sidebar.AddObject3DProperties (this.website.model, this.website.model); this.website.sessionEditor.UpdateDetails (); }
    }
}
