import { FefcoPanel } from './panel.js';
import { AutoPackPanel } from './autopanel.js';
import { AccessoriesPanel } from './accessoriespanel.js';
const Tabs = [['packaging', 'Packaging'], ['auto', 'Auto'], ['accessories', 'Accessories']];
let nextPanelId = 0;
function Element (tag, parent, text, className)
{
    const node = document.createElement (tag); if (text !== undefined) { node.textContent = text; } if (className) { node.className = className; } parent.appendChild (node); return node;
}
// Neutral panel. No host engine, AI, account or application imports.
export class PackagingPanel
{
    constructor (host, parent)
    {
        this.host = host; this.actions = [];
        this.root = Element ('section', parent, undefined, 'packaging_workspace');
        const version = Element ('span', this.root, 'Packaging v' + host.version, 'module_version'); version.setAttribute ('aria-label', 'Packaging module version');
        const id = 'packaging-workspace-' + (++nextPanelId); this.tabs = new Map ();
        const tabs = Element ('div', this.root, undefined, 'packaging_tabs'); tabs.setAttribute ('role', 'tablist'); tabs.setAttribute ('aria-label', 'Packaging tools');
        this.manual = Element ('div', this.root, undefined, 'packaging_manual'); this.manual.id = id + '-packaging'; this.manual.setAttribute ('role', 'tabpanel');
        this.autoPanel = new AutoPackPanel (host, this.root); this.autoPanel.root.id = id + '-auto'; this.autoPanel.root.setAttribute ('role', 'tabpanel');
        this.accessoriesPanel = new AccessoriesPanel (host, this.root); this.accessoriesPanel.root.id = id + '-accessories'; this.accessoriesPanel.root.setAttribute ('role', 'tabpanel');
        this.panels = { packaging : this.manual, auto : this.autoPanel.root, accessories : this.accessoriesPanel.root };
        for (const [tab, title] of Tabs) {
            const button = Element ('button', tabs, title); button.type = 'button'; button.id = id + '-tab-' + tab; button.setAttribute ('role', 'tab'); button.setAttribute ('aria-controls', id + '-' + tab);
            const panel = this.panels[tab]; panel.setAttribute ('aria-labelledby', button.id);
            button.addEventListener ('click', () => this.SetTab (tab));
            button.addEventListener ('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes (event.key)) { event.preventDefault (); const ids = Tabs.map (item => item[0]), at = ids.indexOf (tab); const target = event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at (-1) : ids[(at + (event.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]; this.SetTab (target); this.tabs.get (target).focus (); } });
            this.tabs.set (tab, button);
        }
        this.fefcoPanel = new FefcoPanel (host, this.manual);
        const catalog = this.fefcoPanel.root; const content = [...catalog.children];
        const layout = Element ('div', catalog, undefined, 'packaging_generator_layout'); const generator = Element ('div', layout, undefined, 'packaging_generator_column'); const selected = Element ('div', layout, undefined, 'packaging_selected_column');
        let selectedControls = false;
        for (const child of content) { if (child.classList.contains ('board_appearance')) { selectedControls = true; } (child === this.fefcoPanel.dimensionsPanel || selectedControls ? selected : generator).appendChild (child); }
        const cad = Element ('section', this.manual, undefined, 'packaging_profile_actions'); const downloads = Element ('div', cad, undefined, 'packaging_download_actions');
        for (const [title, action] of [['Open packaging designer', () => host.openDesigner ()], ['Download SVG', () => host.download ('svg')], ['Download EPS', () => host.download ('eps')], ['Download DXF', () => host.download ('dxf')]]) {
            const button = Element ('button', title.startsWith ('Download') ? downloads : cad, title); button.type = 'button'; button.addEventListener ('click', () => host.run (action)); this.actions.push (button);
        }
        cad.appendChild (downloads); this.SetTab ('packaging'); this.Refresh ();
    }
    SetTab (tab)
    {
        if (!Object.hasOwn (this.panels, tab)) { throw new Error ('Choose Packaging, Auto or Accessories.'); }
        this.tab = tab; for (const [id, panel] of Object.entries (this.panels)) { panel.hidden = id !== tab; }
        for (const [id, button] of this.tabs) { button.setAttribute ('aria-selected', String (id === tab)); button.tabIndex = id === tab ? 0 : -1; }
        if (tab === 'auto') { this.autoPanel.Refresh (); } if (tab === 'accessories') { this.accessoriesPanel.Refresh (); } return this.InspectTab ();
    }
    InspectTab () { return { tab : this.tab }; }
    Refresh ()
    {
        const profile = this.host.profile (); this.root.dataset.profileName = profile.name; for (const button of this.actions) { button.disabled = this.host.blocked (); } this.fefcoPanel.Refresh (); if (this.tab === 'auto') { this.autoPanel.Refresh (); } if (this.tab === 'accessories') { this.accessoriesPanel.Refresh (); }
    }
}
