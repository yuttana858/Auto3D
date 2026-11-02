import { WorkerEntrypoint } from 'cloudflare:workers';
import commandCatalog from '../website/assets/commands.json';
import { CreateMcpResourceService } from './resource-worker.js';

export default class Auto3DResourceServer extends WorkerEntrypoint
{
    fetch (request) { return CreateMcpResourceService ({ env : this.env, catalog : commandCatalog.commands }) (request); }
}
