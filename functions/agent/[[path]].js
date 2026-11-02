import { AgentProxy } from '../_lib/agentproxy.js';
export function onRequest (context) { return AgentProxy (context, 'AUTO3D_MCP_AUTH', path => ['/agent/authorize', '/agent/oauth/token', '/agent/register', '/agent/grants', '/agent/grants/revoke'].includes (path)); }
