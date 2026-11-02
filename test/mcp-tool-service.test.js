import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SessionRouter } from '../agent-mcp/session-router.js';
import { AgentToolService } from '../agent-mcp/tool-service.js';

describe ('Read-only agent tool service', () => {
    it ('limits the pilot to validated read-only tools and the verified actor pairing', async () => {
        const catalog = JSON.parse (await readFile ('website/assets/commands.json', 'utf8')).commands; let deliveries = 0; const router = new SessionRouter ();
        router.Register ({ accountId : 'alice', instanceId : 'window', connectionId : 'connection', sessions : [{ id : 'session', name : 'Box', active : true }], deliver : async value => { deliveries++; return value; } }); router.Pair ({ accountId : 'alice', grantId : 'grant', connectionId : 'connection', sessionId : 'session', expiresAt : Date.now () + 10000 });
        const service = new AgentToolService ({ router, catalog }), actor = { accountId : 'alice', grantId : 'grant', scopes : ['auto3d.read'] }; assert.ok (service.ListTools (actor).some (tool => tool.id === 'scene.inspect')); assert.ok (service.ListTools (actor).every (tool => !tool.mutates)); assert.equal (service.ListSessions (actor).length, 1);
        await assert.rejects (() => service.Call (actor, { command : 'object.delete', requestId : 'x', arguments : {} }), /unavailable/); await assert.rejects (() => service.Call (actor, { command : 'scene.inspect', requestId : 'x', arguments : { extra : true } }), /Unknown argument/); await assert.rejects (() => service.Call ({ ...actor, accountId : 'bob' }, { command : 'scene.inspect', requestId : 'x', arguments : {} }), /pairing/); assert.throws (() => service.ListTools ({ ...actor, scopes : [] }), /permission/);
        const result = await service.Call (actor, { command : 'scene.inspect', requestId : 'x', arguments : {} }); assert.equal (result.sessionId, 'session'); assert.equal (deliveries, 1);
    });
});
