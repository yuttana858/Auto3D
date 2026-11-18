import { SupabaseConfig, SupabaseHeaders, RequireServerKey } from './supabase.js';
import { ReadModalConnection, ModalProfile, TestModalConnection, ModalRequest } from './modalconnection.js';
import { CadLimits, CadArtifacts, CadError, CadUuid, CadHash, CadFailureCode, CadProgress } from '../../source/website/cadconversioncontract.js';
import { CadDiagnosticReport } from '../../source/website/cadconversiondiagnostics.js';

export { CadLimits, CadArtifacts, CadError, CadUuid, CadHash };
const statusCodes = { 400 : 'invalid_request', 404 : 'not_found', 409 : 'conflict', 410 : 'expired', 429 : 'queue_full' };
export async function JobDatabase (env, path, method = 'GET', body)
{
    try {
        const { url, key } = SupabaseConfig (env); RequireServerKey (key);
        const response = await fetch (url + '/rest/v1/' + path, { method, redirect : 'manual', signal : AbortSignal.timeout (15000), headers : { ...SupabaseHeaders (key), 'Content-Type' : 'application/json', Prefer : 'return=representation' }, body : body === undefined ? undefined : JSON.stringify (body) });
        if (!response.ok) { throw CadError (statusCodes[response.status] || 'unavailable', statusCodes[response.status] ? response.status : 503); }
        const text = await response.text (); if (text.length > 1024 * 1024) { throw CadError ('unavailable', 503); }
        return text ? JSON.parse (text) : null;
    } catch (error) { if (Object.values (statusCodes).includes (error.code)) { throw error; } throw CadError ('unavailable', 503); }
}
export function JobBucket (env) { if (!env.AUTO3D_LIBRARY_R2) { throw CadError ('unavailable', 503); } return env.AUTO3D_LIBRARY_R2; }
export async function JobOwnerActive (env, owner)
{
    const rows = await JobDatabase (env, 'auto3d_account_controls?select=disabled&user_id=eq.' + owner + '&limit=1');
    if (rows[0]?.disabled === true) { throw CadError ('forbidden', 403); }
}
export async function GetJob (env, owner, id)
{
    if (!CadUuid (id) || !CadUuid (owner)) { throw CadError ('not_found', 404); }
    const rows = await JobDatabase (env, 'auto3d_conversion_jobs?select=*&id=eq.' + id + '&owner_id=eq.' + owner + '&state=neq.deleted&limit=1');
    if (!rows?.length) { throw CadError ('not_found', 404); }
    return rows[0];
}
export async function ChangeJob (env, job, event, data = {}, revision = null)
{
    return (await JobDatabase (env, 'rpc/auto3d_conversion_transition', 'POST', { p_owner : job.owner_id, p_job : job.id, p_event : event, p_revision : revision, p_attempt : job.active_attempt, p_data : data }));
}
export function PublicJob (job)
{
    const retained = Date.parse (job.expires_at) > Date.now ();
    const deadline = Date.parse (job.deadline_at) <= Date.now () && ['queued', 'running', 'cancelling', 'awaiting_upload'].includes (job.state);
    const diagnosticTimeout = retained && deadline && job.purpose === 'diagnostic';
    const expired = !retained || deadline && !diagnosticTimeout;
    const state = expired ? 'expired' : diagnosticTimeout ? 'failed' : job.state;
    let progress = null;
    try { const value = job.purpose === 'diagnostic' ? job.diagnostic_progress : job.summary?.progress; if (value) { progress = CadProgress (value); } } catch { /* Invalid persisted progress is never exposed. */ }
    let report = null;
    try { if (!expired && job.diagnostic_report) { report = CadDiagnosticReport (job.diagnostic_report); } } catch { /* Invalid reports never leave the server. */ }
    const diagnosing = job.purpose === 'diagnostic';
    return {
        id : job.id, revision : job.revision, state, stage : expired ? 'expired' : job.stage,
        source : { name : job.source_name, extension : job.source_extension, bytes : job.source_bytes, sha256 : job.source_sha256, unit : job.source_unit },
        quality : job.quality, origin : job.origin, createdAt : job.created_at, updatedAt : job.updated_at, expiresAt : job.expires_at,
        errorCode : job.error_code ? CadFailureCode (job.error_code) : null, progress,
        purpose : diagnosing ? 'diagnostic' : 'conversion',
        diagnostics : { status : diagnosticTimeout ? 'failed' : diagnosing && ['queued', 'running', 'cancelling'].includes (state) ? state : report ? 'completed' : job.diagnostic_error_code ? 'failed' : 'not_run', report,
            errorCode : diagnosticTimeout ? 'timeout' : job.diagnostic_error_code ? CadFailureCode (job.diagnostic_error_code) : null,
            canRun : state === 'failed' && !diagnosing && !expired && (job.diagnostic_attempts || 0) < 2 },
        canRetry : state === 'failed' && !diagnosing && job.attempts < 2 && ['transfer_failed', 'lease_expired', 'dispatch_failed', 'conversion_failed', 'worker_failed'].includes (job.error_code) && Date.parse (job.expires_at) > Date.now (),
        summary : state === 'ready' ? job.summary : null,
        artifacts : state === 'ready' ? Object.fromEntries (Object.keys (CadArtifacts).filter (key => job.artifacts[key]).map (key => [key, { bytes : job.artifacts[key].bytes, units : CadArtifacts[key].units || null }])) : {}
    };
}
export function JobPrefix (job) { return 'conversion-jobs/' + job.owner_id + '/' + job.id + '/'; }
export function SourceKey (job) { return JobPrefix (job) + 'source.' + job.source_extension; }
export function ArtifactKey (job, kind) { if (!Object.hasOwn (CadArtifacts, kind) || !CadUuid (job.active_attempt)) { throw CadError ('invalid_request'); } return JobPrefix (job) + job.active_attempt + '/' + CadArtifacts[kind].file; }
export async function Sha256 (value) { return Array.from (new Uint8Array (await crypto.subtle.digest ('SHA-256', value)), byte => byte.toString (16).padStart (2, '0')).join (''); }
export function SafeEqual (a, b) { if (typeof a !== 'string' || typeof b !== 'string') { return false; } let difference = a.length ^ b.length; for (let i = 0; i < Math.max (a.length, b.length); i++) { difference |= (a.charCodeAt (i) || 0) ^ (b.charCodeAt (i) || 0); } return difference === 0; }
export async function UploadJobObject (env, request, key, expectedBytes, expectedHash, type)
{
    if (!request.body || !CadHash (expectedHash) || !Number.isSafeInteger (expectedBytes) || expectedBytes <= 0 || request.headers.get ('Content-Length') !== String (expectedBytes)) { throw CadError ('source_mismatch'); }
    const bucket = JobBucket (env);
    const old = await bucket.head (key);
    if (old) { await request.body.cancel (); if (old.size !== expectedBytes || !SafeEqual (old.customMetadata?.sha256, expectedHash)) { throw CadError ('source_mismatch', 409); } return old; }
    // FixedLengthStream enforces actual bytes and gives R2 the known stream length.
    const stream = new FixedLengthStream (expectedBytes);
    const abort = new AbortController ();
    const pipe = request.body.pipeTo (stream.writable, { signal : abort.signal });
    const put = bucket.put (key, stream.readable, { onlyIf : { etagDoesNotMatch : '*' }, sha256 : expectedHash, httpMetadata : { contentType : type, cacheControl : 'private, no-store' }, customMetadata : { sha256 : expectedHash } });
    const outcome = await put.then (value => { if (!value) { abort.abort (); } return { value }; }, () => { abort.abort (); return { error : true }; });
    const transfer = await pipe.then (() => true, () => false);
    if (outcome.error || outcome.value && !transfer) { throw CadError ('source_mismatch'); }
    const stored = outcome.value || await bucket.head (key);
    if (!stored || stored.size !== expectedBytes || !SafeEqual (stored.customMetadata?.sha256, expectedHash)) { throw CadError ('source_mismatch'); }
    return stored;
}
export async function DeleteJobObjects (env, job)
{
    const bucket = JobBucket (env); let cursor;
    do { const page = await bucket.list ({ prefix : JobPrefix (job), limit : 100, ...(cursor ? { cursor } : {}) }); if (page.objects.length) { await bucket.delete (page.objects.map (item => item.key)); } cursor = page.truncated ? page.cursor : null; } while (cursor);
}
export async function DispatchJob (env, job, origin)
{
    if (origin !== 'https://auto3d-5av.pages.dev') { throw CadError ('not_ready', 503); }
    await JobOwnerActive (env, job.owner_id);
    const capability = crypto.getRandomValues (new Uint8Array (32));
    const token = btoa (String.fromCharCode (...capability)).replace (/\+/g, '-').replace (/\//g, '_').replace (/=+$/, '');
    const attemptId = crypto.randomUUID ();
    job = (await ChangeJob (env, job, 'dispatch', { attemptId, tokenHash : await Sha256 (new TextEncoder ().encode (token)) }, job.revision)).job;
    try {
        const runtime = await ReadModalConnection (env, 'runtime'); if (!runtime) { throw CadError ('not_ready', 503); }
        const response = await ModalRequest (runtime, '/jobs', { jobId : job.id, attemptId, token, origin });
        if (response.accepted !== true || typeof response.callId !== 'string' || !/^fc-[A-Za-z0-9]{8,128}$/.test (response.callId)) { throw CadError ('unavailable', 503); }
        job = (await ChangeJob (env, job, 'ack', { callId : response.callId })).job;
    } catch { /* Durable pending dispatch is reconciled; a lost ACK must not trigger a duplicate. */ }
    return job;
}
export async function RequestJobCancel (env, job)
{
    const next = (await ChangeJob (env, job, 'cancel')).job;
    if (job.provider_call_id && ['running', 'queued'].includes (job.state)) {
        try { const runtime = await ReadModalConnection (env, 'runtime'); if (runtime) { await ModalRequest (runtime, '/cancel', { callId : job.provider_call_id }); } } catch { /* Heartbeat cancellation and lease expiry remain authoritative. */ }
    }
    return next;
}
export async function JobCapabilities (env)
{
    JobBucket (env); const connected = await TestModalConnection (env);
    return { ready : connected.conversionReady === true && connected.jobApiVersion === 1, version : connected.version, progressProtocol : 1, diagnosticProtocol : connected.diagnosticApiVersion === 1 ? 1 : null, inputs : ['x_t', 'x_b', 'step', 'stp'], outputs : Object.keys (CadArtifacts), limits : CadLimits, parasolidCoverage : 'supported_subset', featureHistory : false };
}
export async function ControlKey (env)
{
    const runtime = await ReadModalConnection (env, 'runtime'); if (!runtime) { throw CadError ('unavailable', 503); }
    const key = await crypto.subtle.importKey ('raw', new TextEncoder ().encode (runtime.tokenSecret), { name : 'HMAC', hash : 'SHA-256' }, false, ['sign']);
    const result = new Uint8Array (await crypto.subtle.sign ('HMAC', key, new TextEncoder ().encode ('auto3d-conversion-control:v1:' + ModalProfile (env) + ':' + runtime.workspace + ':' + runtime.environment)));
    return btoa (String.fromCharCode (...result)).replace (/\+/g, '-').replace (/\//g, '_').replace (/=+$/, '');
}
