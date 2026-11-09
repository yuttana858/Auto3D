// Keyed hashes keep stored client IPs from being reversed by enumerating the IPv4 space.
const encoder = new TextEncoder ();
export async function KeyedIpHash (env, ip)
{
    const secret = String (env.AUTO3D_IP_HASH_SECRET || env.SUPABASE_SECRET_KEY || '');
    const value = encoder.encode ('auto3d-ip:' + (ip || 'local'));
    const digest = secret
        ? await crypto.subtle.sign ('HMAC', await crypto.subtle.importKey ('raw', encoder.encode (secret), { name : 'HMAC', hash : 'SHA-256' }, false, ['sign']), value)
        : await crypto.subtle.digest ('SHA-256', value);
    return Array.from (new Uint8Array (digest), byte => byte.toString (16).padStart (2, '0')).join ('');
}
// Contact text for users who cannot recover access; configured per deployment, never hard-coded to a person.
export function SupportContact (env)
{
    const contact = String (env.AUTO3D_SUPPORT_CONTACT || '').trim ();
    return /^[^\s@<>]{1,64}@[^\s@<>]{1,190}$/.test (contact) ? 'contact ' + contact : 'contact your Auto3D administrator';
}
