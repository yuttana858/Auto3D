import { Database, Failure, JsonBody, Reply } from '../../_lib/accountstorage.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validObject = (body, fields) => body && typeof body === 'object' && !Array.isArray (body) && Object.keys (body).every (key => fields.includes (key));

// Authentication, active-account checks, CSRF and account-change checks are performed
// by /api/_middleware. The browser never supplies the actor or sender identity.
export async function onRequest ({ request, env, data, params })
{
    if (!UUID.test (data?.user?.id || '')) { return Reply ({ error : 'Sign in to use Messenger.' }, 401); }
    const actor = data.user.id, path = params.path || [], url = new URL (request.url);
    try {
        if (path.length === 1 && path[0] === 'lookup' && request.method === 'POST') {
            const body = await JsonBody (request, 1024);
            if (!validObject (body, ['email']) || typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test (body.email.trim ())) { throw Failure ('Enter a valid email address.'); }
            const id = await Database (env, 'rpc/auto3d_messenger_find_user', 'POST', { p_actor : actor, p_email : body.email.trim () }); return Reply ({ id });
        }
        if (path.length === 1 && path[0] === 'conversations' && request.method === 'POST') {
            const body = await JsonBody (request, 8192);
            if (!validObject (body, ['kind', 'title', 'members']) || !['direct', 'group', 'ai'].includes (body.kind) || typeof body.title !== 'string' || body.title.length > 120 || !Array.isArray (body.members) || body.members.length > 30 || body.members.some (id => !UUID.test (id))) { throw Failure ('Invalid conversation.'); }
            const id = await Database (env, 'rpc/auto3d_conversation_create', 'POST', { p_actor : actor, p_kind : body.kind, p_title : body.title, p_members : body.members }); return Reply ({ id }, 201);
        }
        if (path.length === 1 && path[0] === 'conversations' && request.method === 'GET') {
            const conversations = await Database (env, 'rpc/auto3d_conversation_list', 'POST', { p_actor : actor });
            return Reply ({ conversations });
        }
        if (path.length === 2 && path[0] === 'conversations' && UUID.test (path[1]) && request.method === 'DELETE') {
            await Database (env, 'rpc/auto3d_conversation_leave', 'POST', { p_actor : actor, p_conversation : path[1] }); return Reply ({ left : true });
        }
        if (path.length === 3 && path[0] === 'conversations' && UUID.test (path[1]) && path[2] === 'messages') {
            if (request.method === 'POST') {
                const body = await JsonBody (request, 16384); if (!validObject (body, ['body', 'origin', 'id']) || typeof body.body !== 'string' || !body.body.trim () || body.body.length > 4000 || !['user', 'agent'].includes (body.origin) || !UUID.test (body.id || '')) { throw Failure ('Enter a valid message of at most 4,000 characters.'); }
                const result = await Database (env, 'rpc/auto3d_conversation_send', 'POST', { p_actor : actor, p_conversation : path[1], p_body : body.body, p_origin : body.origin, p_id : body.id }); return Reply ({ message : result }, 201);
            }
            if (request.method === 'GET') {
                const beforeTime = url.searchParams.get ('beforeTime'), beforeId = url.searchParams.get ('beforeId'), limitText = url.searchParams.get ('limit') || '50', limit = Number (limitText);
                if ((beforeTime === null) !== (beforeId === null) || (beforeTime !== null && (!Number.isFinite (Date.parse (beforeTime)) || !UUID.test (beforeId))) || !/^\d+$/.test (limitText) || !Number.isInteger (limit) || limit < 1 || limit > 100) { throw Failure ('Invalid message cursor.'); }
                const messages = await Database (env, 'rpc/auto3d_conversation_read', 'POST', { p_actor : actor, p_conversation : path[1], p_before_time : beforeTime, p_before_id : beforeId, p_limit : limit }); return Reply ({ messages });
            }
        }
        return Reply ({ error : 'Not found.' }, 404);
    } catch (error) { return Reply ({ error : error.status ? error.message : 'Messenger unavailable. Retry shortly.' }, error.status || 503); }
}
