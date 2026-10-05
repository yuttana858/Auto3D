import { createPublicKey, verify as verifySignature } from 'node:crypto';

function decodeBase64Url (value)
{
    return Buffer.from (value.replace (/-/g, '+').replace (/_/g, '/'), 'base64');
}

function jsonPart (value)
{
    return JSON.parse (decodeBase64Url (value).toString ('utf8'));
}

function expectedIssuer (env)
{
    return env.ENTRA_ISSUER || (env.ENTRA_TENANT_ID ? 'https://login.microsoftonline.com/' + env.ENTRA_TENANT_ID + '/v2.0' : null);
}

function jwksUrl (env)
{
    return env.ENTRA_JWKS_URL || (env.ENTRA_TENANT_ID ? 'https://login.microsoftonline.com/' + env.ENTRA_TENANT_ID + '/discovery/v2.0/keys' : null);
}

let cached = null;
let cachedAt = 0;

async function loadKeys (env, fetchImpl)
{
    const url = jwksUrl (env);
    if (!url) { throw new Error ('Entra configuration is incomplete.'); }
    if (cached && Date.now () - cachedAt < 60 * 60 * 1000) { return cached; }
    const response = await fetchImpl (url);
    if (!response.ok) { throw new Error ('Could not load Entra signing keys.'); }
    const body = await response.json ();
    cached = body.keys || [];
    cachedAt = Date.now ();
    return cached;
}

function audienceMatches (aud, expected)
{
    return Array.isArray (aud) ? aud.includes (expected) : aud === expected;
}

export async function VerifyEntraToken (token, env = process.env, fetchImpl = fetch)
{
    const parts = String (token || '').split ('.');
    if (parts.length !== 3) { throw new Error ('Invalid bearer token.'); }
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const header = jsonPart (encodedHeader);
    const payload = jsonPart (encodedPayload);
    if (header.alg !== 'RS256' || !header.kid) { throw new Error ('Unsupported token algorithm.'); }

    const issuer = expectedIssuer (env);
    const audience = env.ENTRA_CLIENT_ID;
    if (!issuer || !audience) { throw new Error ('Entra configuration is incomplete.'); }
    if (payload.iss !== issuer || !audienceMatches (payload.aud, audience)) { throw new Error ('Token issuer or audience is invalid.'); }

    const now = Math.floor (Date.now () / 1000);
    if (!Number.isFinite (payload.exp) || payload.exp <= now || (payload.nbf && payload.nbf > now + 60)) { throw new Error ('Token is expired or not active.'); }

    const keys = await loadKeys (env, fetchImpl);
    const jwk = keys.find ((key) => key.kid === header.kid && (!key.use || key.use === 'sig'));
    if (!jwk) { cached = null; throw new Error ('Token signing key is unavailable.'); }
    const publicKey = createPublicKey ({ key : jwk, format : 'jwk' });
    const valid = verifySignature ('RSA-SHA256', Buffer.from (encodedHeader + '.' + encodedPayload), publicKey, decodeBase64Url (encodedSignature));
    if (!valid) { throw new Error ('Token signature is invalid.'); }

    return {
        subject : String (payload.sub || ''),
        tenant : String (payload.tid || ''),
        name : payload.name ? String (payload.name) : null,
        preferredUsername : payload.preferred_username ? String (payload.preferred_username) : null,
        roles : Array.isArray (payload.roles) ? payload.roles.map (String) : [],
        groups : Array.isArray (payload.groups) ? payload.groups.map (String) : [],
        claims : payload
    };
}

export function ResetJwksCacheForTests ()
{
    cached = null;
    cachedAt = 0;
}
