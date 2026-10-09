import { Database, LimitedBody, Preferences, Folder, Failure, Reply } from '../_lib/accountstorage.js';
export async function onRequest ({ request, env, data })
{
    if (!data?.user) { return Reply ({ error : 'Sign in to use account preferences.' }, 401); }
    const owner = data.user.id; const filter = 'auto3d_preferences?user_id=eq.' + encodeURIComponent (owner);
    try {
        if (request.method === 'GET') {
            await Database (env, 'auto3d_preferences?on_conflict=user_id', 'POST', { user_id : owner }, 'resolution=ignore-duplicates,return=minimal');
            const rows = await Database (env, filter + '&select=preferences,folders'); return Reply (rows[0]);
        }
        if (request.method !== 'PUT') { return Reply ({ error : 'Method not allowed.' }, 405); }
        const body = JSON.parse (await (await LimitedBody (request, 16384)).text ());
        if (!body || Object.keys (body).some ((key) => !['preferences', 'folders'].includes (key))) { throw Failure ('Invalid preference fields.'); }
        const row = { user_id : owner, updated_at : new Date ().toISOString () };
        if (body.preferences !== undefined) { row.preferences = Preferences (body.preferences); }
        if (body.folders !== undefined) { if (!Array.isArray (body.folders) || body.folders.length > 200) { throw Failure ('Too many folders.'); } row.folders = [...new Set (['Uncategorized', ...body.folders.map (Folder)])]; }
        if (!row.preferences && !row.folders) { throw Failure ('No preference changes.'); }
        await Database (env, 'auto3d_preferences?on_conflict=user_id', 'POST', { user_id : owner }, 'resolution=ignore-duplicates,return=minimal');
        delete row.user_id;
        const rows = await Database (env, filter, 'PATCH', row);
        return Reply ({ preferences : rows[0].preferences, folders : rows[0].folders });
    } catch (error) { return Reply ({ error : error.status ? error.message : 'Account preferences unavailable.' }, error.status || 503); }
}
