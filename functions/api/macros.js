import { Database, JsonBody, Reply, Failure } from '../_lib/accountstorage.js';
import { SupabaseConfig, SupabaseHeaders, RequireServerKey } from '../_lib/supabase.js';
import { ValidateMacroName, ValidateMacroShape } from '../../source/website/macroshape.js';

// Shared macro library. Every signed-in account lists and runs every macro; only the account
// that saved a macro, or an administrator, can replace or delete it. The database functions
// enforce that rule with the verified user ID, never an ID from the request.
const Revision = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Codes = { '42501' : 403, '40001' : 409, 'P0002' : 404, '22023' : 400, '23514' : 400, '54000' : 409 };

async function Rpc (env, name, args)
{
    const { url, key } = SupabaseConfig (env); RequireServerKey (key);
    const response = await fetch (url + '/rest/v1/rpc/' + name, { method : 'POST', headers : { ...SupabaseHeaders (key), 'Content-Type' : 'application/json' }, body : JSON.stringify (args), signal : AbortSignal.timeout (10000) });
    if (response.ok) { return response.json (); }
    let detail = null; try { detail = await response.json (); } catch { /* Non-JSON failure. */ }
    const status = Codes[detail?.code];
    // Only the messages these functions raise are passed on; anything else stays generic.
    throw status ? Failure (detail.code === '23514' ? 'Invalid macro definition.' : String (detail.message || 'Macro request refused.').slice (0, 200), status) : Failure ('Macro library unavailable. Retry shortly.', 503);
}

// Shown next to each macro as "saved by". Uses the account name, else the part of the email before @.
export function OwnerLabel (user)
{
    const name = typeof user?.name === 'string' ? user.name.trim () : '';
    const email = typeof user?.email === 'string' ? user.email.split ('@')[0] : '';
    return (name || email || 'Auto3D user').slice (0, 100);
}

export async function onRequest ({ request, env, data })
{
    const user = data?.user;
    if (!user?.id) { return Reply ({ error : 'Sign in to use shared macros.' }, 401); }
    try {
        if (request.method === 'GET') {
            const [rows, admin] = await Promise.all ([
                Database (env, 'auto3d_macros?select=name,definition,owner_id,owner_label,revision,updated_at&order=name.asc&limit=1000'),
                Rpc (env, 'auto3d_macro_is_admin', { p_actor : user.id })
            ]);
            return Reply ({ isAdmin : admin === true, macros : rows.map (row => ({ name : row.name, macro : row.definition, savedBy : row.owner_label, mine : row.owner_id === user.id, canEdit : row.owner_id === user.id || admin === true, revision : row.revision, updatedAt : row.updated_at })) });
        }
        if (request.method !== 'PUT' && request.method !== 'DELETE') { return Reply ({ error : 'Method not allowed.' }, 405); }
        const body = await JsonBody (request, 70000);
        if (!body || typeof body !== 'object' || Array.isArray (body)) { throw Failure ('Invalid macro request.'); }
        const name = ValidateMacroName (body.name);
        if (request.method === 'DELETE') {
            if (Object.keys (body).some (key => key !== 'name')) { throw Failure ('Invalid macro request.'); }
            return Reply ({ deleted : await Rpc (env, 'auto3d_macro_delete', { p_actor : user.id, p_name : name }) });
        }
        if (Object.keys (body).some (key => !['name', 'macro', 'revision'].includes (key)) || body.revision !== undefined && body.revision !== null && !Revision.test (body.revision)) { throw Failure ('Invalid macro request.'); }
        const macro = ValidateMacroShape (body.macro);
        const [saved] = await Rpc (env, 'auto3d_macro_save', { p_actor : user.id, p_name : name, p_definition : macro, p_label : OwnerLabel (user), p_revision : body.revision || null });
        return Reply ({ name : saved.name, revision : saved.revision, savedBy : saved.owner_label, updatedAt : saved.updated_at, created : saved.created });
    } catch (error) {
        if (error.status === 413) { return Reply ({ error : 'Macros must be at most 64 KiB.' }, 413); }
        if (error.status) { return Reply ({ error : error.message }, error.status); }
        // Validation errors from the shared shape check are written for users.
        if (/^(Macro|Use a version|Each|Step )/.test (error.message || '')) { return Reply ({ error : error.message }, 400); }
        return Reply ({ error : 'Macro library unavailable. Retry shortly.' }, 503);
    }
}
