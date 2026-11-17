import { Reply } from '../../_lib/accountstorage.js';
import { JobDatabase, JobBucket, ControlKey, SafeEqual, ChangeJob, DispatchJob, DeleteJobObjects } from '../../_lib/conversionjobs.js';
export async function onRequest ({ request, env })
{
    try {
        if (!SafeEqual (request.headers.get ('Authorization'), 'Bearer ' + await ControlKey (env))) { return Reply ({ error : 'Not found.' }, 404); }
        JobBucket (env);
        const path = new URL (request.url).pathname;
        if (path === '/internal/conversion-control/health' && request.method === 'GET') { await JobDatabase (env, 'auto3d_conversion_jobs?select=id&limit=1'); return Reply ({ ready : true, protocol : 1 }); }
        if (path !== '/internal/conversion-control/reconcile' || request.method !== 'POST') { return Reply ({ error : 'Not found.' }, 404); }
        const now = new Date ().toISOString ();
        const jobs = await JobDatabase (env, 'auto3d_conversion_jobs?select=*&or=(and(state.in.(queued,running,cancelling,awaiting_upload),deadline_at.lt.' + now + '),and(state.in.(running,cancelling),lease_until.lt.' + now + '),and(state.neq.deleted,expires_at.lt.' + now + '),and(state.eq.queued,dispatch_state.eq.pending))&order=updated_at.asc&limit=8');
        let changed = 0;
        // Bounded serial dispatch; one native container handles the queue in the existing workspace.
        await Promise.allSettled (jobs.map (async job => {
            try {
                job = (await ChangeJob (env, job, 'expire')).job;
                if (job.state === 'queued') {
                    if (job.dispatch_state === 'pending' && (!job.dispatched_at || Date.parse (job.dispatched_at) < Date.now () - 120000)) {
                        if (job.attempts >= 2) { await ChangeJob (env, job, 'failure', { code : 'dispatch_failed' }); }
                        else { await DispatchJob (env, job, 'https://auto3d-5av.pages.dev'); }
                    }
                } else if (['cancelled', 'expired'].includes (job.state) || Date.parse (job.expires_at) <= Date.now ()) { await DeleteJobObjects (env, job); if (Date.parse (job.expires_at) <= Date.now ()) { await ChangeJob (env, job, 'delete'); } }
                changed++;
            } catch { /* Per-job failures do not block other owners; the next run can resume. */ }
        }));
        // Tombstones also cover an R2 deletion that failed after a user deleted a row.
        const deleted = await JobDatabase (env, 'auto3d_conversion_jobs?select=*&state=eq.deleted&order=updated_at.asc&limit=20');
        for (const job of deleted) { try { await DeleteJobObjects (env, job); if (Date.parse (job.expires_at) < Date.now ()) { await JobDatabase (env, 'auto3d_conversion_jobs?id=eq.' + job.id + '&state=eq.deleted', 'DELETE'); } } catch { /* Retried next reconciliation. */ } }
        return Reply ({ accepted : true, checked : changed });
    } catch { return Reply ({ error : 'Conversion controller unavailable.' }, 503); }
}
