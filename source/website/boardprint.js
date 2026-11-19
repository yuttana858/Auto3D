import { ArtworkImageInfo, MaxArtworkBytes } from '../../modules/primary-products/src/imageinfo.js';

// Artwork images for printed boards, by SHA-256. Profiles keep only the ID and placement; the bytes live
// here while editing and travel inside the board model's print material (its diffuse map), so saved
// sessions keep them and reopening a board in CAD registers them again.
export const PrintResources = new Map ();

const Hex = buffer => Array.from (new Uint8Array (buffer), n => n.toString (16).padStart (2, '0')).join ('');
const Extension = mime => mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : '.png';

export async function ImportPrintImage (buffer, name = 'Artwork')
{
    if (!(buffer instanceof ArrayBuffer) || !buffer.byteLength || buffer.byteLength > MaxArtworkBytes) { throw new Error ('Use a PNG, JPEG or WebP image up to 4 MiB.'); }
    const info = ArtworkImageInfo (buffer);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes (info.mime)) { throw new Error ('Board artwork must be PNG, JPEG or WebP.'); }
    const bitmap = await createImageBitmap (new Blob ([buffer], { type : info.mime }));
    try { if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 32 * 1024 * 1024) { throw new Error ('The artwork image is too large (8192 px and 32 megapixels at most).'); } info.width = bitmap.width; info.height = bitmap.height; }
    finally { bitmap.close?.(); }
    const resourceId = Hex (await crypto.subtle.digest ('SHA-256', buffer));
    const resource = { resourceId, mime : info.mime, name : String (name || 'Artwork').slice (0, 120), widthPx : info.width, heightPx : info.height, buffer };
    PrintResources.set (resourceId, resource);
    return resource;
}

// The image bytes as a texture definition for the print material, or null when they are not available.
export function PrintTextureFor (resourceId, mime, existing = null)
{
    const resource = PrintResources.get (resourceId);
    if (resource) { return { name : resourceId + Extension (resource.mime), mimeType : resource.mime, buffer : resource.buffer }; }
    if (existing?.buffer && existing.name?.startsWith (resourceId + '.')) { return { name : existing.name, mimeType : existing.mimeType || mime, buffer : existing.buffer }; }
    return null;
}

// Registers artwork carried by print materials of a model (saved sessions, reopened boards).
export function RegisterPrintResources (model)
{
    let count = 0;
    for (let i = 0; i < (model?.MaterialCount?.() ?? 0); i++) {
        const map = model.GetMaterial (i)?.diffuseMap, match = /^([0-9a-f]{64})\.(png|jpg|webp)$/.exec (map?.name || '');
        if (!match || !map.buffer || PrintResources.has (match[1])) { continue; }
        const mime = match[2] === 'jpg' ? 'image/jpeg' : 'image/' + match[2];
        try { const info = ArtworkImageInfo (map.buffer); PrintResources.set (match[1], { resourceId : match[1], mime, name : 'Artwork', widthPx : info.width || 1, heightPx : info.height || 1, buffer : map.buffer }); count++; } catch { /* Not an artwork image. */ }
    }
    return count;
}

const urls = new Map ();
export function PrintImageURL (resourceId)
{
    const resource = PrintResources.get (resourceId); if (!resource) { return null; }
    if (!urls.has (resourceId)) { urls.set (resourceId, URL.createObjectURL (new Blob ([resource.buffer], { type : resource.mime }))); }
    return urls.get (resourceId);
}

// Demo artwork for a board of the given size: a sparkling-water six-pack design drawn locally (no network).
export async function DemoPrintArtwork ({ widthMm, heightMm, title = 'SPARKLING', subtitle = '12 FL OZ · 6 CANS' } = {})
{
    if (!(widthMm > 0 && heightMm > 0)) { throw new Error ('Demo artwork needs a board size.'); }
    const scale = Math.min (8, 2048 / Math.max (widthMm, heightMm)), w = Math.round (widthMm * scale), h = Math.round (heightMm * scale);
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas (w, h) : Object.assign (document.createElement ('canvas'), { width : w, height : h });
    const c = canvas.getContext ('2d');
    const sky = c.createLinearGradient (0, 0, w, h); sky.addColorStop (0, '#0b5fae'); sky.addColorStop (.55, '#18a3c9'); sky.addColorStop (1, '#7fd6c2'); c.fillStyle = sky; c.fillRect (0, 0, w, h);
    // Waves and bubbles.
    for (let band = 0; band < 4; band++) {
        c.beginPath (); c.moveTo (0, h); const base = h * (.62 + band * .1);
        for (let x = 0; x <= w; x += w / 60) { c.lineTo (x, base + Math.sin (x / w * Math.PI * (3 + band) + band) * h * .035); }
        c.lineTo (w, h); c.closePath (); c.fillStyle = 'rgba(255,255,255,' + (.10 + band * .05) + ')'; c.fill ();
    }
    let seed = 7; const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 90; i++) { const r = (2 + random () * 9) * scale / 4; c.beginPath (); c.arc (random () * w, random () * h * .7, r, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max (1, r / 4); c.stroke (); }
    // Lettering across the middle band, readable between the cans.
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.shadowColor = 'rgba(0,40,80,.35)'; c.shadowBlur = h * .02;
    c.font = '800 ' + Math.round (h * .16) + 'px sans-serif'; c.fillText (title, w / 2, h / 2);
    c.font = '600 ' + Math.round (h * .06) + 'px sans-serif'; c.fillText (subtitle, w / 2, h * .5 + h * .14);
    // Brand lines along the top and bottom edge strips, which stay visible around a full pack of cans.
    c.shadowBlur = 0; c.font = '700 ' + Math.round (3.2 * scale) + 'px sans-serif'; c.fillStyle = '#ffffff';
    const band = (title + ' · ' + subtitle + ' · ').repeat (Math.ceil (w / Math.max (1, c.measureText (title + ' · ' + subtitle + ' · ').width)) + 1);
    c.textAlign = 'left'; c.fillText (band, -scale * 2, 2.6 * scale); c.fillText (band, -scale * 9, h - 2.6 * scale);
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = Math.max (2, h * .006); c.strokeRect (5 * scale, 5 * scale, w - 10 * scale, h - 10 * scale);
    const blob = canvas.convertToBlob ? await canvas.convertToBlob ({ type : 'image/png' }) : await new Promise (resolve => canvas.toBlob (resolve, 'image/png'));
    return ImportPrintImage (await blob.arrayBuffer (), 'Demo · ' + title.toLowerCase ());
}
