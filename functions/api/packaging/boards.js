import { Database, LimitedBody, Reply, Failure } from '../../_lib/accountstorage.js';
import { DefaultBoardDatabase, ValidateBoardDatabase } from '../../../modules/packaging/src/boarddatabase.js';
const Revision = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Validation messages are written for users; any other failure stays generic.
const BoardValidation = error => !(error instanceof TypeError || error instanceof ReferenceError) && /board|caliper|flute|paper|CSV|invalid/i.test (error?.message || '');
export async function onRequest ({ request, env, data })
{
    if (!data?.user) { return Reply ({ error : 'Sign in to use the board database.' }, 401); }
    const filter = 'auto3d_preferences?user_id=eq.' + encodeURIComponent (data.user.id);
    try {
        if (request.method === 'GET') {
            const rows = await Database (env, filter + '&select=board_database'); const saved = rows[0]?.board_database;
            return Reply (saved ? { revision : saved.revision, records : ValidateBoardDatabase (saved.records) } : { revision : null, records : DefaultBoardDatabase () });
        }
        if (request.method !== 'PUT') { return Reply ({ error : 'Method not allowed.' }, 405); }
        if (request.headers.get ('Origin') !== new URL (request.url).origin) { return Reply ({ error : 'Requests must come from Auto3D.' }, 403); }
        const body = JSON.parse (await (await LimitedBody (request, 65536)).text ());
        if (!body || Object.keys (body).some (key => !['records', 'revision'].includes (key)) || body.revision !== null && !Revision.test (body.revision || '')) { throw Failure ('Invalid board database revision.'); }
        const records = ValidateBoardDatabase (body.records), revision = crypto.randomUUID ();
        await Database (env, 'auto3d_preferences?on_conflict=user_id', 'POST', { user_id : data.user.id }, 'resolution=ignore-duplicates,return=minimal');
        const match = body.revision === null ? '&board_database=is.null' : '&board_database->>revision=eq.' + encodeURIComponent (body.revision);
        const rows = await Database (env, filter + match, 'PATCH', { board_database : { version : 1, revision, records } });
        if (!rows.length) { return Reply ({ error : 'Board database changed in another session. Reopen the editor before saving.' }, 409); }
        return Reply ({ revision, records });
    } catch (error) { return Reply ({ error : error.status === 413 ? 'Board database requests must be at most 64 KiB.' : error.status ? error.message : error instanceof SyntaxError ? 'Invalid board database JSON.' : BoardValidation (error) ? error.message : 'Board database unavailable.' }, error.status || (error instanceof SyntaxError || BoardValidation (error) ? 400 : 503)); }
}
