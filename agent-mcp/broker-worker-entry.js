export { Auto3DAgentBroker } from './durable-object-entry.js';

// Only the private Durable Object binding is used; no public broker endpoint.
export default { fetch () { return new Response ('Not found.', { status : 404 }); } };
