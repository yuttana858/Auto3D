import { Reply, JsonBody } from '../../_lib/accountstorage.js';
import { CadExact, CadRequest } from '../../../source/website/cadconversioncontract.js';
import { JobDatabase, JobBucket, JobOwnerActive, GetJob, ChangeJob, PublicJob, SourceKey, ArtifactKey, UploadJobObject, DeleteJobObjects, DispatchJob, RequestJobCancel, JobCapabilities, CadArtifacts, CadError, CadUuid } from '../../_lib/conversionjobs.js';

export async function onRequest (context)
{
    const { request, env, data } = context; const owner = data?.user?.id;
    try {
        if (!CadUuid (owner)) { throw CadError ('unauthenticated', 401); }
        if (request.headers.get ('X-Auto3D-Account') !== owner) { throw CadError ('conflict', 409); }
        const origin = new URL (request.url).origin;
        if (!['GET', 'HEAD'].includes (request.method) && request.headers.get ('Origin') !== origin) { throw CadError ('forbidden', 403); }
        const parts = new URL (request.url).pathname.slice ('/api/conversions'.length).split ('/').filter (Boolean);
        await JobOwnerActive (env, owner); JobBucket (env);
        if (parts[0] === 'capabilities' && parts.length === 1 && request.method === 'GET') { return Reply (await JobCapabilities (env)); }
        if (!parts.length) {
            if (request.method === 'GET') {
                const jobs = await JobDatabase (env, 'auto3d_conversion_jobs?select=*&owner_id=eq.' + owner + '&state=neq.deleted&order=created_at.desc,id.desc&limit=50');
                return Reply ({ jobs : jobs.map (PublicJob) });
            }
            if (request.method !== 'POST') { throw CadError ('invalid_request', 405); }
            const input = CadRequest (await JsonBody (request, 4096));
            if (origin !== 'https://auto3d-5av.pages.dev' || !(await JobCapabilities (env)).ready) { throw CadError ('not_ready', 503); }
            const job = await JobDatabase (env, 'rpc/auto3d_conversion_create', 'POST', { p_owner : owner, p_request : input });
            return Reply ({ job : PublicJob (job) }, 201);
        }
        let job = await GetJob (env, owner, parts[0]);
        if (parts.length === 1 && request.method === 'GET') { return Reply ({ job : PublicJob (job) }); }
        if (parts.length === 1 && request.method === 'DELETE') {
            await RequestJobCancel (env, job); job = (await ChangeJob (env, job, 'delete')).job;
            await DeleteJobObjects (env, job); return Reply ({ deleted : true });
        }
        if (['expired', 'deleted'].includes (PublicJob (job).state)) { throw CadError ('expired', 410); }
        if (parts.length === 2 && parts[1] === 'source' && request.method === 'PUT') {
            if (job.state !== 'awaiting_upload') { throw CadError ('conflict', 409); }
            await UploadJobObject (env, request, SourceKey (job), job.source_bytes, job.source_sha256, 'application/octet-stream');
            let current;
            try { current = await GetJob (env, owner, job.id); } catch (error) { if (error.code === 'not_found') { await JobBucket (env).delete (SourceKey (job)); } throw error; }
            if (['cancelled', 'failed', 'expired', 'deleted', 'cancelling'].includes (PublicJob (current).state)) { await JobBucket (env).delete (SourceKey (job)); throw CadError ('conflict', 409); }
            return Reply ({ uploaded : true });
        }
        if (parts.length === 3 && parts[1] === 'artifacts' && request.method === 'GET' && Object.hasOwn (CadArtifacts, parts[2])) {
            if (job.state !== 'ready' || !job.artifacts[parts[2]]) { throw CadError ('conflict', 409); }
            const object = await JobBucket (env).get (ArtifactKey (job, parts[2])); if (!object?.body) { throw CadError ('not_found', 404); }
            return new Response (object.body, { headers : { 'Content-Type' : CadArtifacts[parts[2]].type, 'Content-Length' : String (object.size), 'Content-Disposition' : 'attachment; filename="' + CadArtifacts[parts[2]].file + '"', 'Cache-Control' : 'private, no-store', 'X-Content-Type-Options' : 'nosniff' } });
        }
        if (parts.length !== 2 || request.method !== 'POST' || !['submit', 'cancel', 'retry'].includes (parts[1])) { throw CadError ('invalid_request', 405); }
        const body = CadExact (await JsonBody (request, 1024), ['revision']);
        // The revision is required on user mutations; worker heartbeats may have advanced it.
        const revision = body.revision;
        if (!Number.isSafeInteger (revision) || revision !== job.revision) { throw CadError ('conflict', 409); }
        if (parts[1] === 'cancel') { job = await RequestJobCancel (env, job); }
        else {
            if (parts[1] === 'submit') {
                if (job.state === 'awaiting_upload') { const source = await JobBucket (env).head (SourceKey (job)); if (!source || source.size !== job.source_bytes || source.customMetadata?.sha256 !== job.source_sha256) { throw CadError ('source_mismatch'); } job = (await ChangeJob (env, job, 'uploaded', {}, revision)).job; }
                else if (job.state !== 'queued') { return Reply ({ job : PublicJob (job) }); }
            } else { job = (await ChangeJob (env, job, 'retry', {}, revision)).job; }
            if (!job.dispatched_at) { job = await DispatchJob (env, job, origin); }
        }
        return Reply ({ job : PublicJob (job) });
    } catch (error) {
        const code = ['invalid_request', 'unauthenticated', 'forbidden', 'conflict', 'not_found', 'expired', 'queue_full', 'unavailable', 'not_ready', 'too_large', 'source_mismatch'].includes (error.code) ? error.code : 'unavailable';
        return Reply ({ error : CadError (code).message, code }, [400, 401, 403, 404, 405, 409, 410, 413, 429, 503].includes (error.status) ? error.status : 503);
    }
}
