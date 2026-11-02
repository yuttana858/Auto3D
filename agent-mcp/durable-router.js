// Only construct after verifying the OAuth token and active account on the
// server. The namespace is a private Durable Object binding, not an HTTP API.
export class DurableRouter
{
    constructor ({ namespace, accountId })
    {
        if (!namespace || typeof namespace.getByName !== 'function' || typeof accountId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test (accountId)) { throw new Error ('Invalid broker configuration.'); }
        this.accountId = accountId; this.stub = namespace.getByName (accountId);
    }
    List (accountId) { if (accountId !== this.accountId) { throw new Error ('Account unavailable.'); } return this.stub.List (accountId); }
    Pair (request) { if (request.accountId !== this.accountId) { throw new Error ('Account unavailable.'); } return this.stub.Pair (request); }
    Dispatch (request) { if (request.accountId !== this.accountId) { throw new Error ('Account unavailable.'); } return this.stub.Dispatch (request); }
}
