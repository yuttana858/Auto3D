// MIT License. Adapter for an agent's already authorized Playwright page.
// This does not create a browser connection or read login cookies.
export async function CaptureForChat (page, { scope = 'workspace', maxSize = 1600 } = {})
{
    const response = await page.evaluate (async (arguments_) => {
        if (!window.Auto3D?.execute) { throw new Error ('Auto3D command interface is unavailable.'); }
        return window.Auto3D.execute ('capture.image', arguments_);
    }, { scope, maxSize });
    if (!response.ok) { throw new Error (response.error?.message || 'Auto3D capture failed.'); }
    const result = response.result;
    if (result.mimeType !== 'image/png' || result.content?.length !== 1 || result.content[0].type !== 'image') { throw new Error ('Unexpected capture response.'); }
    return { content : result.content, structuredContent : { scope : result.scope, width : result.width, height : result.height, capturedAt : result.capturedAt } };
}
