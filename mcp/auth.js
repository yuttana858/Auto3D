import { WorkerEntrypoint } from 'cloudflare:workers';
import { AuthFetch, ValidateAccessToken } from './auth-handler.js';

export default class Auto3DAuth extends WorkerEntrypoint
{
    fetch (request) { return AuthFetch (request, this.env, this.ctx); }
    validateToken (resource, token) { return ValidateAccessToken (resource, token, this.env); }
}
