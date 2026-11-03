import { WorkerEntrypoint } from 'cloudflare:workers';
import { Gateway } from './gateway-handler.js';
import { Json } from './common.js';
export default class Auto3DGateway extends WorkerEntrypoint
{
    async fetch (request) { try { return await Gateway (request, this.env); } catch { return Json ({ error : 'Connection unavailable.' }, 503); } }
}
