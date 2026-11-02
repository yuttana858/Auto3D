import { WorkerEntrypoint } from 'cloudflare:workers';
import { OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider';
import { CreateAuthorizationService } from './auth-worker.js';

const service = CreateAuthorizationService ({ OAuthAuthorizationServer });
export default class Auto3DAuthorizationServer extends WorkerEntrypoint
{
    fetch (request) { return service.fetch (request, this.env, this.ctx); }
    validateToken (resource, token) { return service.validateToken (resource, token, this.env); }
}
