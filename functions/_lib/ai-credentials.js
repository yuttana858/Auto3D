// User credentials are encrypted before they reach private object storage.
// The server encryption key is a base64-encoded 32-byte Cloudflare secret.
const Owner = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder ();
function path (owner) { if (!Owner.test (owner || '')) { throw new Error ('Invalid account.'); } return 'private/ai-credentials/' + owner.toLowerCase () + '/meshy-v1'; }
async function encryptionKey (env)
{
    let raw; try { raw = Uint8Array.from (atob (env.AUTO3D_AI_ENCRYPTION_KEY || ''), c => c.charCodeAt (0)); } catch { throw new Error ('Credential storage is not configured.'); }
    if (raw.length !== 32) { throw new Error ('Credential storage is not configured.'); }
    return crypto.subtle.importKey ('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function storage (env) { if (!env.AUTO3D_LIBRARY_R2) { throw new Error ('Credential storage is not configured.'); } return env.AUTO3D_LIBRARY_R2; }
export async function CredentialExists (env, owner) { await encryptionKey (env); return Boolean (await storage (env).head (path (owner))); }
export async function SaveCredential (env, owner, value)
{
    if (typeof value !== 'string' || value.length < 8 || value.length > 512 || value !== value.trim () || /[\s\x00-\x1f\x7f]/.test (value)) { throw Object.assign (new Error ('Enter a valid API key.'), { status : 400 }); }
    const key = await encryptionKey (env); const iv = crypto.getRandomValues (new Uint8Array (12));
    const ciphertext = await crypto.subtle.encrypt ({ name : 'AES-GCM', iv, additionalData : encoder.encode (path (owner)) }, key, encoder.encode (value));
    const bytes = new Uint8Array (12 + ciphertext.byteLength); bytes.set (iv); bytes.set (new Uint8Array (ciphertext), 12);
    await storage (env).put (path (owner), bytes, { httpMetadata : { contentType : 'application/octet-stream' } });
}
export async function ReadCredential (env, owner)
{
    const key = await encryptionKey (env); const object = await storage (env).get (path (owner)); if (!object) { return null; }
    const bytes = new Uint8Array (await object.arrayBuffer ()); if (bytes.length < 29 || bytes.length > 540) { throw new Error ('Credential unavailable.'); }
    const plain = await crypto.subtle.decrypt ({ name : 'AES-GCM', iv : bytes.slice (0, 12), additionalData : encoder.encode (path (owner)) }, key, bytes.slice (12));
    return new TextDecoder ('utf-8', { fatal : true }).decode (plain);
}
export async function DeleteCredential (env, owner) { await encryptionKey (env); await storage (env).delete (path (owner)); }
