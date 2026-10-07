export async function createModule ({ mount, api })
{
    const root = document.createElement ('section'); root.className = 'auto3d_module auto3d_primary_module';
    root.innerHTML = '<strong>Primary</strong><p class="section_hint">Primary module loaded on demand. Build primary-packaging workflows here without adding them to the core startup bundle.</p>';
    return { activate () { if (!root.isConnected) { mount.appendChild (root); } api.setStatus?.('Primary module loaded.'); }, deactivate () { root.remove (); } };
}
