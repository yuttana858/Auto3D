import { toPng } from 'html-to-image';

export function CaptureAllowed (website)
{
    if (!website.auth?.user || website.auth.loggedOut || website.accountReady === false) { throw new Error ('Sign in before capturing Auto3D.'); }
    if (website.authPanel?.recovery) { throw new Error ('Finish password recovery before capturing.'); }
}

export function CaptureFilter (node)
{
    if (node.nodeType !== 1) { return true; }
    return !node.matches ('input, textarea, script, iframe, .password_input, .auth_panel, .auth_gate, [data-capture-private], [data-capture-preview], dialog[aria-label="Auto3D account"], dialog[aria-label="Account administration"], dialog[aria-label="Request an Auto3D account"]');
}

export function CaptureResult (dataUrl, scope, width, height)
{
    if (!dataUrl.startsWith ('data:image/png;base64,') || dataUrl.length > 16 * 1024 * 1024) { throw new Error ('Capture failed or exceeded the 16 MiB image limit.'); }
    return { scope, width, height, mimeType : 'image/png', filename : 'auto3d-' + scope + '.png', capturedAt : new Date ().toISOString (), content : [{ type : 'image', mimeType : 'image/png', data : dataUrl.slice ('data:image/png;base64,'.length) }] };
}

export async function CaptureApp (website, { scope = 'viewport', maxSize = 1600 } = {})
{
    CaptureAllowed (website);
    if (!['viewport', 'workspace'].includes (scope) || !Number.isInteger (maxSize) || maxSize < 256 || maxSize > 2048) { throw new Error ('Use viewport/workspace and an integer maxSize from 256 to 2048.'); }
    const identity = website.auth.user.id;
    const size = scope === 'viewport' ? website.viewer.GetImageSize () : { width : window.innerWidth, height : window.innerHeight };
    const ratio = Math.min (1, maxSize / Math.max (size.width, size.height));
    const width = Math.max (1, Math.round (size.width * ratio)); const height = Math.max (1, Math.round (size.height * ratio));
    let dataUrl;
    if (scope === 'viewport') {
        dataUrl = website.viewer.GetImageAsDataUrl (width, height, false);
    } else {
        // WebGL buffers need synchronous rendering; replace the live canvas only
        // while cloning, then restore its exact DOM position even on failure.
        const canvas = website.viewer.renderer.domElement; const image = document.createElement ('img');
        image.src = website.viewer.GetImageAsDataUrl (canvas.width, canvas.height, false);
        for (const attribute of canvas.attributes) { image.setAttribute (attribute.name, attribute.value); }
        image.style.width = canvas.getBoundingClientRect ().width + 'px'; image.style.height = canvas.getBoundingClientRect ().height + 'px';
        canvas.replaceWith (image);
        try {
            dataUrl = await toPng (document.body, { width : size.width, height : size.height, canvasWidth : width, canvasHeight : height, pixelRatio : 1, skipAutoScale : true, filter : CaptureFilter, cacheBust : false, backgroundColor : getComputedStyle (document.body).backgroundColor });
        } finally { image.replaceWith (canvas); website.viewer.Render (); }
    }
    CaptureAllowed (website);
    if (website.auth.user.id !== identity) { throw new Error ('Account changed during capture. Retry in the current session.'); }
    return CaptureResult (dataUrl, scope, width, height);
}

export function CaptureSummary (result)
{
    return JSON.stringify (result, (key, value) => key === 'data' && typeof value === 'string' && value.length > 1024 ? '[image omitted from text; use image content]' : value, 2);
}
