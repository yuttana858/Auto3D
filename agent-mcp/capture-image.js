// Limit encoded image payloads independently of local screenshot limits.
export const MaxCaptureDataLength = 2 * 1024 * 1024;
export const MaxCaptureMessageLength = MaxCaptureDataLength + 16384;
export function CaptureImageResult (value)
{
    const capture = value?.ok === true && value.command === 'capture.image' ? value.result : null;
    const content = capture?.content;
    if (!capture || !Array.isArray (content) || content.length !== 1 || content[0]?.type !== 'image' || content[0].mimeType !== 'image/png' || typeof content[0].data !== 'string' || content[0].data.length > MaxCaptureDataLength || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test (content[0].data) || content[0].data.length % 4 !== 0 || !['viewport', 'workspace'].includes (capture.scope) || !Number.isInteger (capture.width) || !Number.isInteger (capture.height) || capture.width < 1 || capture.height < 1 || capture.width > 2048 || capture.height > 2048) { throw new Error ('Capture unavailable or too large. Try a smaller image.'); }
    return { image : { type : 'image', mimeType : 'image/png', data : content[0].data }, metadata : { scope : capture.scope, width : capture.width, height : capture.height, mimeType : 'image/png' } };
}
