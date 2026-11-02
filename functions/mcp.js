import { AgentProxy } from './_lib/agentproxy.js';
export function onRequest (context) { return AgentProxy (context, 'AUTO3D_MCP_RESOURCE', path => path === '/mcp'); }
