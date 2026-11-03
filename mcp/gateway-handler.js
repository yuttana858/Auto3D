import { BrowserIdentity } from './identity.js';
import { Json, PilotConfig, ReadJson, Identifier } from './common.js';

export async function Gateway (request, env, identity = BrowserIdentity)
{
    const config = PilotConfig (env), url = new URL (request.url);
    if (url.origin !== config.origin || url.search || request.headers.get ('Origin') !== config.origin) { return Json ({ error : 'Invalid origin.' }, 403); }
    const connect = url.pathname === '/api/agent/connect' && request.method === 'GET', renew = url.pathname === '/api/agent/renew' && request.method === 'POST';
    if (!connect && !renew) { return Json ({ error : 'Not found.' }, 404); }
    const user = await identity (request, env); if (!user) { return Json ({ error : 'Sign in.' }, 401); }
    const broker = env.AUTO3D_AGENT_BROKER.getByName (user.id), expiresAt = Date.now () + 300000;
    if (renew) {
        if (request.headers.get ('X-Auto3D-Account') !== user.id) { return Json ({ error : 'Account changed.' }, 409); }
        const body = await ReadJson (request, 1024);
        if (Object.keys (body).sort ().join (',') !== 'connectionId,instanceId') { return Json ({ error : 'Invalid renewal.' }, 400); }
        await broker.Renew ({ accountId : user.id, sessionFingerprint : user.sessionFingerprint, connectionId : Identifier (body.connectionId), instanceId : Identifier (body.instanceId), expiresAt });
        return Json ({ expiresAt });
    }
    if (request.headers.get ('Upgrade')?.toLowerCase () !== 'websocket') { return Json ({ error : 'WebSocket upgrade required.' }, 426); }
    return broker.fetch (new Request ('https://broker.internal/connect', { headers : { Upgrade : 'websocket', 'X-Auto3D-Verified-Account' : user.id, 'X-Auto3D-Verified-Session' : user.sessionFingerprint, 'X-Auto3D-Connection-Expires' : String (expiresAt) } }));
}
