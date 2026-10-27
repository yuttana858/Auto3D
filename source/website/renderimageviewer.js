import { InstallPopupTypography } from './popuptypography.js';
export function OpenRenderedImage (blob, name, size)
{
    const popup = window.open ('about:blank', '_blank', 'popup=yes,width=1100,height=800,menubar=no,toolbar=no,location=no,status=no');
    if (!popup) { throw new Error ('Allow pop-ups for Auto3D to open the rendered image.'); }
    popup.opener = null; const doc = popup.document; doc.title = name + ' · Render';
    const disposeTypography = InstallPopupTypography (doc.body, 3, true); popup.addEventListener ('pagehide', disposeTypography, { once : true });
    const style = doc.createElement ('style'); style.textContent = 'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#17191c;color:#eee;font:14px system-ui}header{height:48px;display:flex;align-items:center;gap:8px;padding:0 12px}header span{margin-right:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button,a{color:#eee;background:#30343a;border:1px solid #60646a;border-radius:4px;padding:6px 10px;text-decoration:none;cursor:pointer}#image_viewport{position:absolute;inset:48px 0 0;overflow:hidden;touch-action:none;background:repeating-conic-gradient(#292c31 0% 25%,#22252a 0% 50%) 0/24px 24px;cursor:grab}#image_viewport:active{cursor:grabbing}img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;user-select:none}'; doc.head.appendChild (style);
    const bar = doc.createElement ('header'); const title = doc.createElement ('span'); title.textContent = name + ' · ' + size.width + ' × ' + size.height; bar.appendChild (title); doc.body.appendChild (bar);
    const viewport = doc.createElement ('div'); viewport.id = 'image_viewport'; viewport.setAttribute ('aria-label', 'Rendered image pan and zoom'); const img = doc.createElement ('img'); img.alt = name; img.draggable = false; viewport.appendChild (img); doc.body.appendChild (viewport);
    const url = URL.createObjectURL (blob); let released = false; const release = () => { if (!released) { released = true; URL.revokeObjectURL (url); } };
    let scale = 1, x = 0, y = 0, drag = null;
    const draw = () => { img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')'; img.dataset.zoom = String (scale); };
    const fit = () => { scale = Math.min (viewport.clientWidth / size.width, viewport.clientHeight / size.height, 1); x = (viewport.clientWidth - size.width * scale) / 2; y = (viewport.clientHeight - size.height * scale) / 2; draw (); };
    const zoom = (factor, px = viewport.clientWidth / 2, py = viewport.clientHeight / 2) => { const next = Math.max (0.01, Math.min (32, scale * factor)); x = px - (px - x) * next / scale; y = py - (py - y) * next / scale; scale = next; draw (); };
    const button = (text, action) => { const element = doc.createElement ('button'); element.textContent = text; element.type = 'button'; element.addEventListener ('click', action); bar.appendChild (element); };
    const pan = (dx, dy) => { x += dx; y += dy; draw (); };
    const control = ({ action = 'inspect', factor, deltaX, deltaY } = {}) => {
        if (!['inspect', 'fit', 'actual', 'zoom', 'pan'].includes (action) || factor !== undefined && (!Number.isFinite (factor) || factor <= 0 || factor > 100) || [deltaX, deltaY].some (value => value !== undefined && (!Number.isFinite (value) || Math.abs (value) > 1000000))) { throw new Error ('Choose a valid image view action, zoom factor or pixel pan.'); }
        if (action === 'zoom' && factor === undefined || action === 'pan' && (deltaX === undefined || deltaY === undefined) || action !== 'zoom' && factor !== undefined || action !== 'pan' && (deltaX !== undefined || deltaY !== undefined)) { throw new Error ('Zoom requires factor; pan requires deltaX and deltaY.'); }
        if (action === 'fit') { fit (); } else if (action === 'actual') { zoom (1 / scale); } else if (action === 'zoom') { zoom (factor); } else if (action === 'pan') { pan (deltaX, deltaY); }
        return { zoom : scale, pan : { x, y }, size : { ...size } };
    };
    button ('−', () => zoom (.8)); button ('+', () => zoom (1.25)); button ('Fit', fit); button ('100%', () => zoom (1 / scale));
    const download = doc.createElement ('a'); download.textContent = 'Download PNG'; download.href = url; download.download = name.replace (/[^a-z0-9._-]+/gi, '_') + '.png'; bar.appendChild (download);
    viewport.addEventListener ('wheel', event => { event.preventDefault (); const bounds = viewport.getBoundingClientRect (); zoom (Math.exp (-Math.max (-500, Math.min (500, event.deltaY)) * .002), event.clientX - bounds.left, event.clientY - bounds.top); }, { passive : false });
    viewport.addEventListener ('pointerdown', event => { drag = { id : event.pointerId, x : event.clientX, y : event.clientY }; viewport.setPointerCapture (event.pointerId); });
    viewport.addEventListener ('pointermove', event => { if (!drag || event.pointerId !== drag.id) { return; } pan (event.clientX - drag.x, event.clientY - drag.y); drag.x = event.clientX; drag.y = event.clientY; });
    for (const event of ['pointerup', 'pointercancel']) { viewport.addEventListener (event, () => { drag = null; }); }
    popup.addEventListener ('resize', fit); popup.addEventListener ('pagehide', release, { once : true }); img.addEventListener ('load', fit, { once : true }); img.src = url;
    return { popup, control, dispose : () => { release (); if (!popup.closed) { popup.close (); } } };
}
