// Dedicated private bucket: never bind the model/Library bucket here.
const encoder = new TextEncoder ();
const unavailable = () => Object.assign (new Error ('Secure Meshy key storage is unavailable.'), { status : 503 });
export function CredentialPath (owner)
{
    if (typeof owner !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test (owner)) { throw unavailable (); }
    return 'meshy/v1/' + owner;
}
export function CredentialReady (env)
{
    return !!env.AUTO3D_AI_CREDENTIALS_R2 && /^[a-fA-F0-9]{64}$/.test (env.AUTO3D_AI_KEY_ENCRYPTION_SECRET || '');
}
async function encryptionKey (env)
{
    if (!CredentialReady (env)) { throw unavailable (); }
    const bytes = Uint8Array.from (env.AUTO3D_AI_KEY_ENCRYPTION_SECRET.match (/.{2}/g), value => parseInt (value, 16));
    return crypto.subtle.importKey ('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export function ValidateMeshyKey (value)
{
    if (typeof value !== 'string' || value.length < 16 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test (value)) {
        throw Object.assign (new Error ('Enter a valid Meshy API key without spaces.'), { status : 400 });
    }
    return value;
}
export async function StoreMeshyKey (env, owner, value)
{
    ValidateMeshyKey (value);
    const path = CredentialPath (owner), key = await encryptionKey (env);
    const iv = crypto.getRandomValues (new Uint8Array (12));
    const ciphertext = await crypto.subtle.encrypt ({ name : 'AES-GCM', iv, additionalData : encoder.encode (path) }, key, encoder.encode (value));
    await env.AUTO3D_AI_CREDENTIALS_R2.put (path, JSON.stringify ({ version : 1, iv : Array.from (iv), ciphertext : Array.from (new Uint8Array (ciphertext)) }), { httpMetadata : { contentType : 'application/json', cacheControl : 'no-store' } });
}
export async function ReadMeshyKey (env, owner)
{
    const path = CredentialPath (owner);
    if (!env.AUTO3D_AI_CREDENTIALS_R2) { return null; }
    try {
        const object = await env.AUTO3D_AI_CREDENTIALS_R2.get (path);
        if (!object) { return null; }
        if (object.size > 8192) { throw unavailable (); }
        const record = await object.json ();
        if (record.version !== 1 || !Array.isArray (record.iv) || record.iv.length !== 12 || !Array.isArray (record.ciphertext) || record.ciphertext.length > 1024 || ![...record.iv, ...record.ciphertext].every (n => Number.isInteger (n) && n >= 0 && n <= 255)) { throw unavailable (); }
        const plaintext = await crypto.subtle.decrypt ({ name : 'AES-GCM', iv : new Uint8Array (record.iv), additionalData : encoder.encode (path) }, await encryptionKey (env), new Uint8Array (record.ciphertext));
        return ValidateMeshyKey (new TextDecoder ().decode (plaintext));
    } catch { throw unavailable (); }
}
export async function MeshyKey (context)
{
    if (!context.data?.user?.id) { throw Object.assign (new Error ('Sign in to use Meshy.'), { status : 401 }); }
    const personal = await ReadMeshyKey (context.env, context.data.user.id);
    if (personal) { return personal; }
    return String (context.env.AUTO3D_AI_ALLOW_SHARED_KEY || '').toLowerCase () === 'true' ? String (context.env.MESHY_API_KEY || '').trim () : '';
}
