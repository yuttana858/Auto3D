import { AgentName, Identifier, ValidScopes } from './common.js';

// Strongly consistent per-account state. OAuth tokens remain in provider storage.
export class Registrations
{
    constructor (storage, now = () => Date.now ()) { this.storage = storage; this.now = now; }
    async Account (accountId)
    {
        Identifier (accountId);
        await this.storage.transaction (async storage => {
            const owner = await storage.get ('owner');
            if (owner && owner !== accountId) { throw new Error ('Account unavailable.'); }
            if (!owner) { await storage.put ('owner', accountId); }
        });
    }
    async Create ({ accountId, id, name, harness, clientId, scopes, expiresAt })
    {
        await this.Account (accountId); Identifier (id); name = AgentName (name);
        if (!['chatgpt', 'claude', 'desktop', 'cli', 'other-oauth'].includes (harness) || typeof clientId !== 'string' || !clientId || clientId.length > 2048 || !ValidScopes (scopes) || !Number.isSafeInteger (expiresAt) || expiresAt <= this.now () || expiresAt > this.now () + 30 * 86400000) { throw new Error ('Invalid registration.'); }
        return this.storage.transaction (async storage => {
            if (await storage.get ('disabled') || await storage.get ('registration:' + id)) { throw new Error ('Registration unavailable.'); }
            const records = await storage.list ({ prefix : 'registration:', limit : 101 });
            if (records.size >= 100) { throw new Error ('Registration limit reached.'); }
            const record = { id, name, harness, clientId, scopes : [...scopes], createdAt : this.now (), expiresAt, revokedAt : null };
            await storage.put ('registration:' + id, record); return record;
        });
    }
    async List (accountId)
    {
        await this.Account (accountId);
        return { disabled : Boolean (await this.storage.get ('disabled')), registrations : [...(await this.storage.list ({ prefix : 'registration:', limit : 100 })).values ()] };
    }
    async Assert ({ accountId, id })
    {
        await this.Account (accountId); Identifier (id);
        const record = await this.storage.get ('registration:' + id);
        if (await this.storage.get ('disabled') || !record || record.revokedAt !== null || record.expiresAt <= this.now ()) { throw new Error ('Agent access revoked or expired.'); }
        return record;
    }
    async Revoke ({ accountId, id })
    {
        await this.Account (accountId); Identifier (id);
        await this.storage.transaction (async storage => {
            const record = await storage.get ('registration:' + id);
            if (record) { await storage.put ('registration:' + id, { ...record, revokedAt : this.now () }); }
            await storage.delete ('pair:' + id);
        });
        return { revoked : true };
    }
    async Disable ({ accountId, disabled })
    {
        await this.Account (accountId);
        if (typeof disabled !== 'boolean') { throw new Error ('Invalid control.'); }
        await this.storage.transaction (async storage => {
            await storage.put ('disabled', disabled);
            // Re-enabling the account must never resurrect old authorizations.
            if (disabled) {
                const records = await storage.list ({ prefix : 'registration:', limit : 100 });
                for (const [key, record] of records) { await storage.put (key, { ...record, revokedAt : record.revokedAt ?? this.now () }); }
            }
        });
        return { disabled };
    }
}
