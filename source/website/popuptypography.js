// Add pixels to each text/control's authored size, without compounding inherited sizes.
const PopupSelector = 'dialog, .ov_dialog, .auto3d_context_menu, .pcr-app';
export function InstallPopupTypography (documentRoot = document.body, increment = 3, asPopup = false)
{
    const roots = new Map (); const view = documentRoot.ownerDocument.defaultView;
    function watch (root)
    {
        if (roots.has (root) || [...roots.keys ()].some (parent => parent.contains (root)) || root.parentElement?.closest (PopupSelector)) { return; }
        const originals = new Map (); let frame = null;
        const restore = (node, original) => { if (original.value) { node.style.setProperty ('font-size', original.value, original.priority); } else { node.style.removeProperty ('font-size'); } };
        const apply = () => {
            frame = null;
            for (const [node, original] of originals) {
                restore (node, original);
                if (!root.contains (node) && node !== root) { originals.delete (node); }
            }
            const sizes = [];
            for (const node of [root, ...root.querySelectorAll ('*')]) {
                if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !node.matches ('input, select, option, textarea, button') && ![...node.childNodes].some (child => child.nodeType === 3 && child.textContent.trim ())) { continue; }
                if (!originals.has (node)) { originals.set (node, { value : node.style.getPropertyValue ('font-size'), priority : node.style.getPropertyPriority ('font-size') }); }
                const size = parseFloat (view.getComputedStyle (node).fontSize); if (Number.isFinite (size)) { sizes.push ([node, size + increment]); }
            }
            for (const [node, size] of sizes) { node.style.setProperty ('font-size', size + 'px', 'important'); }
            if (root.classList.contains ('auto3d_context_menu')) { const bounds = root.getBoundingClientRect (); root.style.left = Math.max (0, Math.min (bounds.left, view.innerWidth - bounds.width)) + 'px'; root.style.top = Math.max (0, Math.min (bounds.top, view.innerHeight - bounds.height)) + 'px'; }
        };
        const schedule = () => { if (frame === null) { frame = view.requestAnimationFrame (apply); } };
        const observer = new view.MutationObserver (records => { if (records.some (record => record.target.namespaceURI === 'http://www.w3.org/1999/xhtml' && ([...record.addedNodes].some (node => node.nodeType === 1 && node.namespaceURI === 'http://www.w3.org/1999/xhtml') || !originals.has (record.target) && [...record.addedNodes].some (node => node.nodeType === 3 && node.textContent.trim ())))) { schedule (); } }); observer.observe (root, { childList : true, subtree : true });
        roots.set (root, () => { observer.disconnect (); if (frame !== null) { view.cancelAnimationFrame (frame); } for (const [node, original] of originals) { restore (node, original); } originals.clear (); }); schedule ();
    }
    const scan = () => {
        for (const [root, dispose] of roots) { if (!root.isConnected) { dispose (); roots.delete (root); } }
        documentRoot.querySelectorAll (PopupSelector).forEach (watch);
    };
    const observer = new view.MutationObserver (records => {
        if (records.some (record => [...record.removedNodes].some (node => node.nodeType === 1))) { for (const [root, dispose] of roots) { if (!root.isConnected) { dispose (); roots.delete (root); } } }
        for (const record of records) { for (const node of record.addedNodes) { if (node.nodeType !== 1) { continue; } if (node.matches (PopupSelector)) { watch (node); } node.querySelectorAll (PopupSelector).forEach (watch); } }
    }); observer.observe (documentRoot, { childList : true, subtree : true }); if (asPopup) { watch (documentRoot); } scan ();
    return () => { observer.disconnect (); for (const dispose of roots.values ()) { dispose (); } roots.clear (); };
}
