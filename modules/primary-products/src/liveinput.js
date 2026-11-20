// Keep a field's unfinished text independent from the last valid product definition.
// Context includes the selected product and display units so a delayed edit cannot
// be applied to a different selection or interpreted in different units.
export function BindLiveNumber (input, commit, { context = () => '', report = () => {}, delay = 220 } = {})
{
    let timer = null, version = 0, pending = null;
    const cancel = () => { clearTimeout (timer); timer = null; pending = null; version++; };
    const flush = async () => {
        clearTimeout (timer); timer = null;
        if (!pending) { return; }
        const edit = pending; pending = null;
        if (edit.context !== context () || input.disabled || input.isConnected === false) { return; }
        const value = input.value.trim ();
        if (!value || !Number.isFinite (Number (value))) { return; }
        try {
            const result = await commit (Number (value));
            if (edit.version !== version || edit.context !== context ()) { return; }
            if (result === false) { input.setAttribute ('aria-invalid', 'true'); return; }
            delete input.dataset.ppDirty; input.removeAttribute ('aria-invalid');
        } catch (error) {
            if (edit.version !== version || edit.context !== context ()) { return; }
            input.setAttribute ('aria-invalid', 'true'); report (error.message);
        }
    };
    const queue = () => {
        clearTimeout (timer); input.dataset.ppDirty = 'true'; input.removeAttribute ('aria-invalid');
        pending = { version : ++version, context : context () };
        timer = setTimeout (flush, delay);
    };
    input.addEventListener ('input', queue);
    // Native numeric edits emit input first. Change, blur and Enter flush that
    // same edit; they must not create another edit after it has already applied.
    input.addEventListener ('change', flush);
    input.addEventListener ('blur', flush);
    input.addEventListener ('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault (); event.stopPropagation (); flush (); }
        if (event.key === 'Escape') { cancel (); delete input.dataset.ppDirty; input.removeAttribute ('aria-invalid'); }
    });
    return { cancel, flush, reset : () => { cancel (); delete input.dataset.ppDirty; input.removeAttribute ('aria-invalid'); } };
}

export function RefreshLiveInput (input, value, force = false)
{
    if (force || (document.activeElement !== input && input.dataset.ppDirty !== 'true')) { input.value = value === undefined ? '' : String (value); }
}
