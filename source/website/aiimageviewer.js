// 2D viewer for generated and reference images inside the AI workspace viewer area.
// Wheel or pinch zooms toward the pointer, drag pans, double-click fits, and a strip switches between views.
const MinZoom = .1, MaxZoom = 16;

function Element (tag, className, parent)
{
    const element = document.createElement (tag);
    if (className) { element.className = className; }
    if (parent) { parent.appendChild (element); }
    return element;
}

export class AIImageViewer
{
    constructor (host)
    {
        this.host = host; this.urls = []; this.index = 0; this.zoom = 1; this.x = 0; this.y = 0; this.pointers = new Map ();
        this.root = Element ('div', 'ai_image_viewer', host); this.root.hidden = true; this.root.setAttribute ('aria-label', 'AI image viewer');
        this.stage = Element ('div', 'ai_image_stage', this.root);
        this.image = Element ('img', 'ai_image_view', this.stage); this.image.alt = ''; this.image.draggable = false; this.image.referrerPolicy = 'no-referrer';
        this.image.addEventListener ('load', () => this.Fit ());
        this.image.addEventListener ('error', () => { this.caption.textContent = 'Image unavailable. Refresh creations to renew the link.'; });
        this.caption = Element ('div', 'ai_image_caption', this.root);
        this.strip = Element ('div', 'ai_image_strip', this.root);
        this.stage.addEventListener ('wheel', event => { event.preventDefault (); this.ZoomAt (Math.exp (-event.deltaY * .0015), event.clientX, event.clientY); }, { passive : false });
        this.stage.addEventListener ('dblclick', () => this.Fit ());
        this.stage.addEventListener ('pointerdown', event => { this.stage.setPointerCapture (event.pointerId); this.pointers.set (event.pointerId, { x : event.clientX, y : event.clientY }); });
        this.stage.addEventListener ('pointermove', event => this.PointerMove (event));
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) { this.stage.addEventListener (type, event => { this.pointers.delete (event.pointerId); this.pinch = null; }); }
        this.resize = new ResizeObserver (() => { if (!this.root.hidden) { this.Fit (); } }); this.resize.observe (host);
    }

    Show (urls, caption = '')
    {
        this.urls = urls.slice (0, 8); this.label = caption; this.root.hidden = false; this.strip.replaceChildren ();
        if (this.urls.length > 1) {
            this.urls.forEach ((url, index) => {
                const button = Element ('button', 'ai_image_thumb', this.strip); button.type = 'button'; button.setAttribute ('aria-label', 'View ' + (index + 1));
                const thumb = Element ('img', null, button); thumb.src = url; thumb.alt = ''; thumb.referrerPolicy = 'no-referrer';
                button.addEventListener ('click', () => this.Select (index));
            });
        }
        this.strip.hidden = this.urls.length < 2; this.Select (0);
    }
    Select (index)
    {
        if (!Number.isInteger (index) || index < 0 || index >= this.urls.length) { throw new Error ('Image index out of range.'); }
        this.index = index; this.image.src = this.urls[index];
        [...this.strip.children].forEach ((item, i) => item.classList.toggle ('selected', i === index));
        this.caption.textContent = this.label + (this.urls.length > 1 ? ' · view ' + (index + 1) + ' of ' + this.urls.length : '');
        return this.State ();
    }
    Hide () { this.root.hidden = true; this.urls = []; this.image.removeAttribute ('src'); }

    Fit ()
    {
        const width = this.image.naturalWidth, height = this.image.naturalHeight, box = this.stage.getBoundingClientRect ();
        this.zoom = width && height && box.width && box.height ? Math.min (box.width / width, box.height / height, 1) * .95 : 1;
        this.x = (box.width - width * this.zoom) / 2; this.y = (box.height - height * this.zoom) / 2; this.Apply (); return this.State ();
    }
    ZoomAt (factor, clientX, clientY)
    {
        const box = this.stage.getBoundingClientRect (); const px = clientX - box.left, py = clientY - box.top;
        const zoom = Math.min (MaxZoom, Math.max (MinZoom, this.zoom * factor)); const ratio = zoom / this.zoom;
        this.x = px - (px - this.x) * ratio; this.y = py - (py - this.y) * ratio; this.zoom = zoom; this.Apply ();
    }
    PointerMove (event)
    {
        const previous = this.pointers.get (event.pointerId); if (!previous) { return; }
        const current = { x : event.clientX, y : event.clientY }; this.pointers.set (event.pointerId, current);
        if (this.pointers.size === 2) {
            const [a, b] = [...this.pointers.values ()]; const distance = Math.hypot (a.x - b.x, a.y - b.y);
            if (this.pinch) { this.ZoomAt (distance / this.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); } this.pinch = distance; return;
        }
        this.x += current.x - previous.x; this.y += current.y - previous.y; this.Apply ();
    }
    Apply () { this.image.style.transform = 'translate(' + this.x + 'px,' + this.y + 'px) scale(' + this.zoom + ')'; }

    // Shared by the viewer buttons and agent commands.
    Control (action, value = 1.25)
    {
        if (this.root.hidden) { throw new Error ('Preview an image first.'); }
        if (action === 'fit') { return this.Fit (); }
        if (action === 'select') { return this.Select (value); }
        if (action === 'zoomIn' || action === 'zoomOut') {
            if (!Number.isFinite (value) || value <= 1 || value > 10) { throw new Error ('Zoom factor must be greater than 1 and at most 10.'); }
            const box = this.stage.getBoundingClientRect (); this.ZoomAt (action === 'zoomIn' ? value : 1 / value, box.left + box.width / 2, box.top + box.height / 2); return this.State ();
        }
        throw new Error ('Unknown viewer action.');
    }
    State () { return { mode : 'image', images : this.urls.length, index : this.index, zoom : Number (this.zoom.toFixed (4)) }; }
    Dispose () { this.resize.disconnect (); this.root.remove (); }
}
