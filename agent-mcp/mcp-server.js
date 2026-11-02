import { CaptureImageResult } from './capture-image.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// The caller must supply an actor from a verified OAuth resource-server
// context. This factory exposes no listener and performs no authentication.
export function CreateMcpServer ({ service, actor, newRequestId = () => crypto.randomUUID () })
{
    service.Authorize (actor);
    const server = new Server ({ name : 'Auto3D', version : '0.1.0' }, { capabilities : { tools : {} } });
    server.setRequestHandler (ListToolsRequestSchema, async () => ({ tools : [
        { name : 'auto3d.sessions.list', description : 'List this account’s connected Auto3D browser windows and sessions.', inputSchema : { type : 'object', properties : {}, additionalProperties : false }, annotations : { readOnlyHint : true } },
        { name : 'auto3d.sessions.select', description : 'Select a session explicitly chosen by the user from the session list. Does not change the scene.', inputSchema : { type : 'object', properties : { connectionId : { type : 'string', pattern : '^[A-Za-z0-9_-]{1,128}$' }, sessionId : { type : 'string', pattern : '^[A-Za-z0-9_-]{1,128}$' } }, required : ['connectionId', 'sessionId'], additionalProperties : false }, annotations : { readOnlyHint : false, destructiveHint : false, idempotentHint : false } },
        ...service.ListTools (actor).map (tool => ({ name : tool.id, title : tool.title, description : tool.description, inputSchema : tool.inputSchema, annotations : { readOnlyHint : true } }))
    ] }));
    server.setRequestHandler (CallToolRequestSchema, async request => {
        try {
            const { name, arguments : args = {} } = request.params; let result;
            if (name === 'auto3d.sessions.list') { if (Object.keys (args).length) { throw new Error ('This tool takes no arguments.'); } result = await service.ListSessions (actor); }
            else if (name === 'auto3d.sessions.select') { if (Object.keys (args).length !== 2 || typeof args.connectionId !== 'string' || typeof args.sessionId !== 'string') { throw new Error ('Invalid session selection.'); } result = await service.SelectSession (actor, args); }
            else { result = await service.Call (actor, { command : name, requestId : newRequestId (), arguments : args }); }
            if (name === 'capture.image') { const capture = CaptureImageResult (result); return { content : [{ type : 'text', text : JSON.stringify (capture.metadata) }, capture.image], structuredContent : { result : capture.metadata } }; }
            return { content : [{ type : 'text', text : JSON.stringify (result) }], structuredContent : { result } };
        } catch { return { isError : true, content : [{ type : 'text', text : request.params.name === 'capture.image' ? 'Screen capture failed or exceeded the image size limit. Check the connection and screenshot permission, or try a smaller maxSize.' : 'The Auto3D request could not be completed. Check the connection, session and permissions.' }] }; }
    });
    return server;
}
