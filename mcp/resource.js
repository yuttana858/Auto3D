import { WorkerEntrypoint } from 'cloudflare:workers';
import { ResourceFetch } from './resource-handler.js';

export default class Auto3DResource extends WorkerEntrypoint
{
    fetch (request) { return ResourceFetch (request, this.env, this.ctx); }
}
