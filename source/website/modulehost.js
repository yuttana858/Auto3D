// Auto3D feature-module host.
// Modules are loaded only after the core viewer is running and only on first activation.
const Registry = new Map ([
    ['primary', () => import ('./modules/primary/index.js')],
    ['packaging', () => import ('./modules/packaging/index.js')]
]);

export class ModuleHost
{
    constructor (website, mount)
    {
        this.website = website; this.mount = mount; this.instances = new Map (); this.active = null;
    }

    async Activate (id)
    {
        if (this.active === id) { return; }
        if (this.active && this.instances.has (this.active)) { await this.instances.get (this.active).deactivate?.(); }
        this.mount.replaceChildren ();
        let instance = this.instances.get (id);
        if (!instance) {
            const loader = Registry.get (id);
            if (!loader) { throw new Error ('Unknown Auto3D module: ' + id); }
            const module = await loader ();
            instance = await module.createModule ({
                website : this.website,
                mount : this.mount,
                api : this.CreateHostAPI ()
            });
            this.instances.set (id, instance);
        }
        this.active = id;
        await instance.activate?.();
    }

    CreateHostAPI ()
    {
        return Object.freeze ({
            version : 1,
            getSession : () => this.website.sessionEditor?.document,
            getSelection : () => this.website.sessionEditor?.selected || null,
            requestRender : () => this.website.viewer.Render (),
            importFiles : (files) => this.website.LoadModelFromFileList (files),
            setStatus : (message) => this.website.sessionEditor?.Status (message)
        });
    }
}
