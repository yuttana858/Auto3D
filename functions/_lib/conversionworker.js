import { JsonBody } from './accountstorage.js';
import { CadExact, CadFailureCode } from '../../source/website/cadconversioncontract.js';
import { JobDatabase, JobOwnerActive, JobBucket, GetJob, ChangeJob, PublicJob, SourceKey, ArtifactKey, Sha256, SafeEqual, UploadJobObject, CadArtifacts, CadLimits, CadUuid, CadHash, CadError } from './conversionjobs.js';

export async function WorkerJob (env, request, id, attempt)
{
    const token = request.headers.get ('Authorization');
    if (!CadUuid (id) || !CadUuid (attempt) || !/^Bearer [A-Za-z0-9_-]{43}$/.test (token || '')) { throw CadError ('not_found', 404); }
    const rows = await JobDatabase (env, 'auto3d_conversion_jobs?select=*&id=eq.' + id + '&active_attempt=eq.' + attempt + '&limit=1');
    const job = rows[0];
    if (!job?.token_hash || !SafeEqual (await Sha256 (new TextEncoder ().encode (token.slice (7))), job.token_hash)) { throw CadError ('not_found', 404); }
    if (!['queued', 'running', 'cancelling'].includes (job.state) || PublicJob (job).state === 'expired') { throw CadError ('expired', 410); }
    await JobOwnerActive (env, job.owner_id);
    return job;
}
function ActiveLease (job)
{
    if (job.state !== 'running' || !job.lease_until || Date.parse (job.lease_until) <= Date.now ()) { throw CadError ('conflict', 409); }
}
export async function ValidateJobResult (env, job)
{
    ActiveLease (job);
    const bucket = JobBucket (env), objects = {};
    for (const kind of Object.keys (CadArtifacts)) {
        const object = await bucket.head (ArtifactKey (job, kind));
        const max = kind === 'manifest' ? CadLimits.manifestBytes : CadLimits.artifactBytes;
        if (!object || object.size <= 0 || object.size > max || !CadHash (object.customMetadata?.sha256)) { throw CadError ('validation_failed'); }
        objects[kind] = { bytes : object.size, sha256 : object.customMetadata.sha256 };
    }
    if (Object.values (objects).reduce ((sum, object) => sum + object.bytes, 0) > CadLimits.totalBytes) { throw CadError ('validation_failed'); }
    const object = await bucket.get (ArtifactKey (job, 'manifest'));
    const manifest = JSON.parse (await object.text ());
    const dimensions = manifest?.cad?.dimensions_mm;
    if (manifest.schema_version !== 1 || manifest.producer !== 'cloud-3d-studio' || !/^\d+\.\d+\.\d+$/.test (manifest.producer_version || '') || manifest.status !== 'validated' || manifest.source?.sha256 !== job.source_sha256 || manifest.cad_validation?.passed !== true || manifest.mesh_validation?.passed !== true || !Array.isArray (dimensions) || dimensions.length !== 3 || !dimensions.every (value => Number.isFinite (value) && value >= 0 && value <= 1e12) || !dimensions.some (value => value > 0)) { throw CadError ('validation_failed'); }
    CadExact (manifest.artifacts, ['step', 'glb', 'stl']);
    for (const kind of ['step', 'glb', 'stl']) {
        const artifact = manifest.artifacts[kind];
        if (artifact.filename !== CadArtifacts[kind].file || artifact.units !== CadArtifacts[kind].units || artifact.bytes !== objects[kind].bytes || artifact.sha256 !== objects[kind].sha256) { throw CadError ('validation_failed'); }
    }
    const topology = {};
    for (const kind of ['solids', 'shells', 'faces', 'edges', 'vertices']) { const count = manifest.cad?.topology?.[kind]; if (!Number.isSafeInteger (count) || count < 0 || count > 100000000) { throw CadError ('validation_failed'); } topology[kind] = count; }
    return { artifacts : objects, summary : { dimensionsMm : dimensions, topology, producerVersion : manifest.producer_version, stepReimportPassed : true, meshReimportPassed : true } };
}
export async function WorkerOperation (env, request, parts)
{
    if (parts.length < 3 || parts.length > 4) { throw CadError ('not_found', 404); }
    const job = await WorkerJob (env, request, parts[0], parts[1]);
    const operation = parts[2];
    if (operation === 'source' && request.method === 'GET' && parts.length === 3) {
        ActiveLease (job); const object = await JobBucket (env).get (SourceKey (job)); if (!object?.body) { throw CadError ('not_found', 404); }
        return new Response (object.body, { headers : { 'Content-Type' : 'application/octet-stream', 'Content-Length' : String (object.size), 'Cache-Control' : 'private, no-store', 'X-Content-Type-Options' : 'nosniff' } });
    }
    if (operation === 'artifacts' && request.method === 'PUT' && parts.length === 4 && Object.hasOwn (CadArtifacts, parts[3])) {
        ActiveLease (job); const kind = parts[3], size = Number (request.headers.get ('Content-Length'));
        const limit = kind === 'manifest' ? CadLimits.manifestBytes : CadLimits.artifactBytes;
        if (!Number.isSafeInteger (size) || size <= 0 || size > limit) { throw CadError ('too_large', 413); }
        const key = ArtifactKey (job, kind);
        await UploadJobObject (env, request, key, size, request.headers.get ('X-Content-SHA256'), CadArtifacts[kind].type);
        let current;
        try { current = await GetJob (env, job.owner_id, job.id); }
        catch (error) { if (error.code === 'not_found') { await JobBucket (env).delete (key); } throw error; }
        if (current.active_attempt !== job.active_attempt || current.state !== 'running' || PublicJob (current).state === 'expired') { await JobBucket (env).delete (key); throw CadError ('conflict', 409); }
        return { stored : true };
    }
    if (request.method !== 'POST' || parts.length !== 3) { throw CadError ('invalid_request', 405); }
    const body = await JsonBody (request, 1024);
    if (operation === 'claim') {
        CadExact (body, []); const result = await ChangeJob (env, job, 'claim');
        if (!result.claimed) { return { accepted : false }; }
        return { accepted : true, source : { extension : job.source_extension, bytes : job.source_bytes, sha256 : job.source_sha256, unit : job.source_unit }, quality : job.quality };
    }
    if (operation === 'progress') {
        CadExact (body, ['stage']); const result = await ChangeJob (env, job, 'progress', { stage : body.stage }); return { state : result.job.state };
    }
    if (operation === 'complete') {
        CadExact (body, []); const evidence = await ValidateJobResult (env, job);
        const result = await ChangeJob (env, job, 'complete', evidence); return { state : result.job.state };
    }
    if (operation === 'failure') {
        CadExact (body, ['code']); const result = await ChangeJob (env, job, 'failure', { code : CadFailureCode (body.code) }); return { state : result.job.state };
    }
    throw CadError ('not_found', 404);
}
