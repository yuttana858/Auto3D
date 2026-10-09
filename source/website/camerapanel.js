export class CameraPanel
{
    constructor (website) { this.website = website; this.root = document.getElementById ('camera_section'); this.Render (); }
    Open ()
    {
        if (document.getElementById ('upload_panel_toggle').getAttribute ('aria-expanded') === 'false') { document.getElementById ('upload_panel_toggle').click (); }
        this.root.open = true; this.Render (); this.root.scrollIntoView ({ block : 'nearest' }); this.root.querySelector ('input').focus (); return { opened : true };
    }
    Render ()
    {
        const editor = this.website.sessionEditor; const cameras = editor.cameras;
        this.root.replaceChildren (); const summary = document.createElement ('summary'); summary.textContent = 'Camera'; this.root.appendChild (summary);
        const content = document.createElement ('div'); content.className = 'section_content camera_content'; this.root.appendChild (content);
        const status = document.createElement ('p'); status.className = 'section_hint'; status.setAttribute ('role', 'status');
        const run = (action) => { try { action (); } catch (error) { status.textContent = error.message; } };
        const label = document.createElement ('label'); label.textContent = 'Field of view (degrees)'; content.appendChild (label);
        const fov = document.createElement ('input'); fov.id = 'camera_fov'; fov.type = 'number'; fov.min = '10'; fov.max = '120'; fov.step = '1'; fov.value = String (this.website.viewer.GetCamera ().fov); fov.setAttribute ('aria-label', 'Camera field of view'); label.appendChild (fov);
        fov.addEventListener ('change', () => run (() => cameras.SetFov (Number (fov.value))));
        const hint = document.createElement ('p'); hint.className = 'section_hint'; hint.textContent = 'FOV controls perspective framing. Save named views to keep position, target, orientation, projection and FOV in this session.'; content.appendChild (hint);
        const name = document.createElement ('input'); name.placeholder = 'Camera name'; name.maxLength = 100; name.setAttribute ('aria-label', 'New camera name'); content.appendChild (name);
        const button = (parent, text, action, mutates = false) => { const item = document.createElement ('button'); item.textContent = text; item.disabled = mutates && editor.readOnly; item.addEventListener ('click', () => run (action)); parent.appendChild (item); return item; };
        button (content, 'Save camera view', () => cameras.Create (name.value.trim () || 'Camera ' + (cameras.data.views.length + 1)), true);
        for (const view of cameras.Inspect ().views) {
            const row = document.createElement ('div'); row.className = 'camera_view'; content.appendChild (row);
            const title = document.createElement ('input'); title.value = view.name; title.maxLength = 100; title.disabled = editor.readOnly; title.setAttribute ('aria-label', 'Camera view name'); row.appendChild (title);
            title.addEventListener ('change', () => run (() => cameras.Rename (view.id, title.value)));
            const actions = document.createElement ('div'); actions.className = 'mode_buttons'; row.appendChild (actions);
            button (actions, 'Go to view', () => cameras.Activate (view.id));
            button (actions, 'Update', () => cameras.Update (view.id), true);
            button (actions, 'Delete', () => cameras.Delete (view.id), true);
        }
        content.appendChild (status);
    }
}
