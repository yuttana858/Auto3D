import { Validate } from '../source/website/commandregistry.js';
import { PilotCommands } from './browser-bridge.js';

// Trusted server adapters must verify the OAuth token and construct actor;
// caller-supplied account or grant fields must never be used as identity.
export class AgentToolService
{
    constructor ({ router, catalog })
    {
        this.router = router; this.tools = new Map ();
        for (const metadata of catalog) { if (PilotCommands.includes (metadata.id) && metadata.mutates === false && metadata.inputSchema?.type === 'object') { this.tools.set (metadata.id, metadata); } }
    }
    Authorize (actor)
    {
        if (!actor || typeof actor.accountId !== 'string' || typeof actor.grantId !== 'string' || !Array.isArray (actor.scopes) || !actor.scopes.includes ('auto3d.read')) { throw new Error ('Read permission required.'); }
    }
    ListTools (actor) { this.Authorize (actor); return [...this.tools.values ()].filter (tool => tool.id !== 'capture.image' || actor.scopes.includes ('auto3d.capture')).map (tool => structuredClone (tool)); }
    ListSessions (actor) { this.Authorize (actor); return this.router.List (actor.accountId); }
    async SelectSession (actor, { connectionId, sessionId } = {})
    {
        this.Authorize (actor); if (!Number.isFinite (actor.expiresAt)) { throw new Error ('Grant expiry required.'); }
        await this.router.Pair ({ accountId : actor.accountId, grantId : actor.grantId, connectionId, sessionId, expiresAt : actor.expiresAt, client : actor.client });
        return { connectionId, sessionId };
    }
    async Call (actor, { command, requestId, arguments : args } = {})
    {
        this.Authorize (actor); const tool = this.tools.get (command); if (!tool || command === 'capture.image' && !actor.scopes.includes ('auto3d.capture')) { throw new Error ('Tool unavailable.'); }
        Validate (args, tool.inputSchema); return this.router.Dispatch ({ accountId : actor.accountId, grantId : actor.grantId, requestId, command, arguments : args });
    }
}
