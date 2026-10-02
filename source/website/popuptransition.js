export function FadeOut (element, duration = 250)
{
    if (window.matchMedia ('(prefers-reduced-motion: reduce)').matches || !element.animate) { return Promise.resolve (); }
    const animation = element.animate ([{ opacity : 1 }, { opacity : 0 }], { duration, easing : 'ease-out', fill : 'forwards' });
    return animation.finished.catch (() => {});
}

// All native app popups share this dismissal, including Escape.
export function EnablePopupFade (dialog)
{
    const close = dialog.close.bind (dialog);
    let closing = false;
    dialog.close = (value) => {
        if (closing || !dialog.open) { return; }
        closing = true;
        dialog.classList.add ('popup_closing');
        dialog.inert = true;
        FadeOut (dialog).then (() => close (value));
    };
    dialog.addEventListener ('cancel', (event) => { event.preventDefault (); dialog.close (); });
}
