import { WorkerEntrypoint } from 'cloudflare:workers';
import { CreateBrowserGateway } from './browser-gateway.js';
import { CreateBrowserConnectionIdentity } from './identity.js';

export default class Auto3DBrowserGateway extends WorkerEntrypoint
{
    fetch (request) { return CreateBrowserGateway ({ namespace : this.env.AUTO3D_AGENT_BROKER, verifiedUser : CreateBrowserConnectionIdentity (this.env) }) (request); }
}
