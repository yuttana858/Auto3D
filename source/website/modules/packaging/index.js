export async function createModule ({ mount, api })
{
    const root = document.createElement ('section'); root.className = 'auto3d_module auto3d_packaging_module';
    root.innerHTML = '<strong>Packaging</strong><p class="section_hint">Packaging module loaded on demand. This application owns packaging-specific UI and logic while consuming the stable Auto3D host API.</p>';
    return { activate () { if (!root.isConnected) { mount.appendChild (root); } api.setStatus?.('Packaging module loaded.'); }, deactivate () { root.remove (); } };
}
