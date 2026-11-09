import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CaptureContent } from './service.js';
import { ErrorCode, PublicError, ReadBytes } from './common.js';
import { DiscoveryVersion } from './discovery.js';
import packageMetadata from '../package.json';

export async function HandleMcp (request, service, actor)
{
    try { await service.Assert (actor); }
    catch (error) {
        // Expired or revoked registrations are authorization failures, not outages.
        if (ErrorCode (error) === 'revoked') { return new Response (JSON.stringify ({ error : 'invalid_token', error_description : 'Agent access was revoked or expired. Authorize again.' }), { status : 401, headers : { 'Content-Type' : 'application/json', 'Cache-Control' : 'no-store', 'WWW-Authenticate' : 'Bearer error="invalid_token"' } }); }
        throw error;
    }
    const tools = [
        { name : 'auto3d.sessions.list', description : 'List this account’s connected browser windows and sessions.', inputSchema : { type : 'object', properties : {}, additionalProperties : false }, annotations : { readOnlyHint : true } },
        { name : 'auto3d.sessions.select', description : 'Pair with an active session explicitly chosen by the user. Only windows that allow agent selection in Agent access can be selected; otherwise use auto3d.sessions.pair_code. Does not edit the scene.', inputSchema : { type : 'object', properties : { connectionId : { type : 'string' }, sessionId : { type : 'string' } }, required : ['connectionId', 'sessionId'], additionalProperties : false }, annotations : { readOnlyHint : false, destructiveHint : false, idempotentHint : false } },
        { name : 'auto3d.sessions.pair_code', description : 'Pair this authenticated agent with the active Auto3D window using the one-time code the user explicitly supplied. The code belongs to the signed-in account; it is single-use and expires. Does not edit the scene.', inputSchema : { type : 'object', properties : { code : { type : 'string', pattern : '^(?:[A-HJ-NP-Za-hj-np-z2-9]{4}-){3}[A-HJ-NP-Za-hj-np-z2-9]{4}$' } }, required : ['code'], additionalProperties : false }, annotations : { readOnlyHint : false, destructiveHint : false, idempotentHint : false } },
        ...service.Tools (actor).map (tool => ({ name : tool.id, title : tool.title, description : tool.description, inputSchema : tool.inputSchema, annotations : { readOnlyHint : !tool.mutates, ...(tool.id === 'auto3d.commands.invoke' ? { destructiveHint : true, idempotentHint : false } : {}) } }))
    ];
    const server = new Server ({ name : 'Auto3D', version : await DiscoveryVersion (packageMetadata.version, { tools, catalog : service.tools }) }, { capabilities : { tools : {} } });
    server.setRequestHandler (ListToolsRequestSchema, async () => { await service.Assert (actor); return { tools }; });
    server.setRequestHandler (CallToolRequestSchema, async ({ params }) => {
        try {
            const result = await service.Call (actor, params.name, params.arguments || {});
            if (params.name === 'capture.image' || params.name === 'auto3d.commands.invoke' && params.arguments?.command === 'capture.image') { return { content : CaptureContent (result) }; }
            return { content : [{ type : 'text', text : JSON.stringify (result) }], structuredContent : { result } };
        } catch (error) {
            const failure = PublicError (error);
            return { isError : true, content : [{ type : 'text', text : failure.code + ': ' + failure.message }], structuredContent : { error : failure } };
        }
    });
    const transport = new WebStandardStreamableHTTPServerTransport ({ enableJsonResponse : true, sessionIdGenerator : undefined });
    if (request.method === 'POST') { request = new Request (request.url, { method : 'POST', headers : request.headers, body : await ReadBytes (request, 65536), signal : request.signal }); }
    await server.connect (transport);
    try {
        const response = await transport.handleRequest (request);
        const headers = new Headers (response.headers); headers.set ('Cache-Control', 'no-store');
        return new Response (response.body, { status : response.status, statusText : response.statusText, headers });
    } finally { await server.close (); }
}
