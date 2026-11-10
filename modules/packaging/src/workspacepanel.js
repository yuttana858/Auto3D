import { FefcoPanel } from './panel.js';
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
        this.fefcoPanel = new FefcoPanel (host, this.root);
        const catalog = this.fefcoPanel.root; const content = [...catalog.children];
        const layout = Element ('div', catalog, undefined, 'packaging_generator_layout'); const generator = Element ('div', layout, undefined, 'packaging_generator_column'); const selected = Element ('div', layout, undefined, 'packaging_selected_column');
        let selectedControls = false;
        for (const child of content) { if (child.classList.contains ('board_appearance')) { selectedControls = true; } (child === this.fefcoPanel.dimensionsPanel || selectedControls ? selected : generator).appendChild (child); }
        const cad = Element ('section', this.root, undefined, 'packaging_profile_actions'); const downloads = Element ('div', cad, undefined, 'packaging_download_actions');
        for (const [title, action] of [['Open packaging designer', () => host.openDesigner ()], ['Download SVG', () => host.download ('svg')], ['Download EPS', () => host.download ('eps')], ['Download DXF', () => host.download ('dxf')]]) {
            const button = Element ('button', title.startsWith ('Download') ? downloads : cad, title); button.type = 'button'; button.addEventListener ('click', () => host.run (action)); this.actions.push (button);
        }
        cad.appendChild (downloads); this.Refresh ();
    }
    Refresh ()
    {
        const profile = this.host.profile (); this.root.dataset.profileName = profile.name; for (const button of this.actions) { button.disabled = this.host.blocked (); } this.fefcoPanel.Refresh ();
    }
}
