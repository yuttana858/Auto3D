import { Validate } from '../source/website/commandregistry.js';
import { Identifier, ReadTools } from './common.js';

export class PilotService
{
    constructor (broker, catalog)
    {
        this.broker = broker;
        this.tools = catalog.filter (tool => ReadTools.includes (tool.id) && tool.mutates === false);
    }
    Tools (actor) { return this.tools.filter (tool => tool.id !== 'capture.image' || actor.scope.includes ('auto3d.capture')); }
    async Assert (actor)
    {
        if (!actor?.scope?.includes ('auto3d.read') || !Number.isFinite (actor.expiresAt) || actor.expiresAt * 1000 <= Date.now ()) { throw new Error ('Read permission required.'); }
        Identifier (actor.userId); Identifier (actor.props?.registrationId);
        return this.broker.AssertRegistration ({ accountId : actor.userId, id : actor.props.registrationId });
    }
    async Call (actor, name, args, requestId = crypto.randomUUID ())
    {
        await this.Assert (actor);
        let result;
        if (name === 'auto3d.sessions.list') {
            Validate (args, { type : 'object', properties : {} }); result = await this.broker.List (actor.userId);
        } else if (name === 'auto3d.sessions.select') {
            Validate (args, { type : 'object', properties : { connectionId : { type : 'string', pattern : '^[A-Za-z0-9_-]{1,128}$' }, sessionId : { type : 'string', pattern : '^[A-Za-z0-9_-]{1,128}$' } }, required : ['connectionId', 'sessionId'] });
            await this.broker.Pair ({ accountId : actor.userId, grantId : actor.props.registrationId, ...args, expiresAt : actor.expiresAt * 1000 }); result = args;
        } else {
            const tool = this.Tools (actor).find (item => item.id === name); if (!tool) { throw new Error ('Tool unavailable.'); }
            Validate (args, tool.inputSchema);
            result = await this.broker.Dispatch ({ accountId : actor.userId, grantId : actor.props.registrationId, requestId, command : name, arguments : args });
            if (result?.ok !== true || result.command !== name) { throw new Error ('Browser request failed.'); }
            result = result.result;
        }
        await this.Assert (actor); return result;
    }
}
export function CaptureContent (result)
{
    const content = result?.content;
    if (!Array.isArray (content) || content.length !== 1 || content[0].type !== 'image' || content[0].mimeType !== 'image/png' || typeof content[0].data !== 'string' || content[0].data.length > 2000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test (content[0].data)) { throw new Error ('Invalid or oversized screenshot.'); }
    const data = content[0].data;
    if (data.length % 4 || !data.startsWith ('iVBORw0KGgo')) { throw new Error ('Invalid PNG image.'); }
    return [{ type : 'text', text : JSON.stringify ({ scope : result.scope, width : result.width, height : result.height, capturedAt : result.capturedAt }) }, content[0]];
}
