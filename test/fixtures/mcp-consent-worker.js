import { Consent } from '../../mcp/authorization.js';

// Rendering fixture only. No identity provider or OAuth grant is contacted.
const oauth = {
    parseAuthRequest : async () => ({ clientId : 'browser-fixture', scope : ['auto3d.read'] }),
    describeConsent : async () => ({ clientName : 'Browser regression', clientDomain : null, redirectHost : 'client.example', redirectIsLoopback : false, scope : ['auto3d.read'] }),
    beginConsent : async () => ({ handle : 'browser-bound-fixture', headers : new Headers () })
};
export default {
    fetch (request, env) { return Consent (request, env, { getOAuthApi : () => oauth }, async () => ({ id : '11111111-1111-4111-8111-111111111111', email : 'fixture@example.test' })); }
};
