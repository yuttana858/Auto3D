// Operator-only, read-only source capability. It cannot claim work or publish a model.
import { CadUuid, CadHash, CadError, ControlKey, JobDatabase, JobBucket, JobOwnerActive, SourceKey } from './conversionjobs.js';
import { JsonBody } from './accountstorage.js';

async function ProofJob (env, id)
{
    if (!CadUuid (id)) { throw CadError ('not_found', 404); }
    const rows = await JobDatabase (env, 'auto3d_conversion_jobs?select=*&id=eq.' + id + '&limit=1');
    const job = rows?.[0];
    if (!job || job.state !== 'failed' || job.source_extension !== 'x_t' || !CadUuid (job.owner_id) || !CadHash (job.source_sha256) || !Number.isSafeInteger (job.source_bytes) || job.source_bytes <= 0 || job.source_bytes > 50 * 1024 * 1024 || !['mm', 'cm', 'm', 'in', 'ft'].includes (job.source_unit)) { throw CadError ('not_found', 404); }
    if (!(Date.parse (job.expires_at) > Date.now ())) { throw CadError ('expired', 410); }
    await JobOwnerActive (env, job.owner_id);
    return job;
}

function Message (job, expires, origin)
{
    return new TextEncoder ().encode (JSON.stringify (['auto3d-cad-proof-source:v1', origin, job.id, job.owner_id, job.source_sha256, job.source_bytes, job.source_unit, job.expires_at, expires]));
}
async function Key (env, usage)
{
    return crypto.subtle.importKey ('raw', new TextEncoder ().encode (await ControlKey (env)), { name : 'HMAC', hash : 'SHA-256' }, false, [usage]);
}
export async function IssueProof (env, request)
{
    const input = await JsonBody (request, 256);
    if (!input || Object.keys (input).length !== 1 || !CadUuid (input.jobId)) { throw CadError ('invalid_request'); }
    const job = await ProofJob (env, input.jobId);
    const expires = Math.min (Math.floor (Date.now () / 1000) + 900, Math.floor (Date.parse (job.expires_at) / 1000));
    const signed = new Uint8Array (await crypto.subtle.sign ('HMAC', await Key (env, 'sign'), Message (job, expires, new URL (request.url).origin)));
    const signature = Array.from (signed, byte => byte.toString (16).padStart (2, '0')).join ('');
    return { schemaVersion : 1, jobId : job.id, token : expires + '.' + signature, expiresAt : new Date (expires * 1000).toISOString (), bytes : job.source_bytes, sha256 : job.source_sha256, sourceUnit : job.source_unit };
}
export async function ProofSource (env, request, id)
{
    if (request.method !== 'GET') { throw CadError ('not_found', 404); }
    const match = /^Bearer ([0-9]{10})\.([a-f0-9]{64})$/.exec (request.headers.get ('Authorization') || '');
    if (!match) { throw CadError ('not_found', 404); }
    const expires = Number (match[1]);
    if (expires * 1000 <= Date.now () || expires > Math.floor (Date.now () / 1000) + 900) { throw CadError ('not_found', 404); }
    const job = await ProofJob (env, id);
    const signature = Uint8Array.from (match[2].match (/../g), byte => parseInt (byte, 16));
    if (!await crypto.subtle.verify ('HMAC', await Key (env, 'verify'), signature, Message (job, expires, new URL (request.url).origin))) { throw CadError ('not_found', 404); }
    const object = await JobBucket (env).get (SourceKey (job));
    if (!object || object.size !== job.source_bytes || object.customMetadata?.sha256 !== job.source_sha256) { if (object?.body) { await object.body.cancel (); } throw CadError ('source_mismatch', 409); }
    return new Response (object.body, { headers : { 'Content-Type' : 'application/octet-stream', 'Content-Length' : String (job.source_bytes), 'Cache-Control' : 'private, no-store', 'Referrer-Policy' : 'no-referrer', 'X-Content-Type-Options' : 'nosniff' } });
}
