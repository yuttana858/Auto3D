import { AgentError, AgentName, Identifier, ValidScopes } from './common.js';

const RevokedRetentionMs = 30 * 86400000;

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
        if (!['chatgpt', 'claude', 'desktop', 'cli', 'other-oauth'].includes (harness) || typeof clientId !== 'string' || !clientId || clientId.length > 2048 || !ValidScopes (scopes) || !Number.isSafeInteger (expiresAt) || expiresAt <= this.now () || expiresAt > this.now () + 36526 * 86400000) { throw new Error ('Invalid registration.'); }
        return this.storage.transaction (async storage => {
            if (await storage.get ('disabled') || await storage.get ('registration:' + id)) { throw new Error ('Registration unavailable.'); }
            await this.PruneIn (storage);
            const records = await storage.list ({ prefix : 'registration:', limit : 1000 });
            // Only active registrations count toward the limit; revoked history is pruned.
            if ([...records.values ()].filter (record => this.Active (record)).length >= 100) { throw new Error ('Registration limit reached. Revoke an unused agent first.'); }
            const record = { id, name, harness, clientId, scopes : [...scopes], createdAt : this.now (), expiresAt, revokedAt : null };
            await storage.put ('registration:' + id, record); return record;
        });
    }
    Active (record) { return record.revokedAt === null && record.expiresAt > this.now (); }
    async PruneIn (storage)
    {
        const records = await storage.list ({ prefix : 'registration:', limit : 1000 });
        for (const [key, record] of records) {
            const ended = record.revokedAt ?? (record.expiresAt <= this.now () ? record.expiresAt : null);
            if (ended !== null && this.now () - ended >= RevokedRetentionMs) { await storage.delete (key); }
        }
    }
    async Prune ()
    {
        if (!await this.storage.get ('owner')) { return; }
        await this.storage.transaction (storage => this.PruneIn (storage));
    }
    async List (accountId)
    {
        await this.Account (accountId);
        const records = [...(await this.storage.list ({ prefix : 'registration:', limit : 1000 })).values ()].sort ((left, right) => Number (this.Active (right)) - Number (this.Active (left)) || right.createdAt - left.createdAt);
        return { disabled : Boolean (await this.storage.get ('disabled')), registrations : records.slice (0, 100) };
    }
    async Assert ({ accountId, id })
    {
        await this.Account (accountId); Identifier (id);
        const record = await this.storage.get ('registration:' + id);
        if (await this.storage.get ('disabled') || !record || record.revokedAt !== null || record.expiresAt <= this.now ()) { throw AgentError ('revoked', 'Agent access revoked or expired. Authorize again.'); }
        return record;
    }
    async Revoke ({ accountId, id })
    {
        await this.Account (accountId); Identifier (id);
        await this.storage.transaction (async storage => {
            const record = await storage.get ('registration:' + id);
            if (record) { await storage.put ('registration:' + id, { ...record, revokedAt : this.now () }); }
            await storage.delete ('pair:' + id);
            await storage.delete ('headless:' + id);
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
                const records = await storage.list ({ prefix : 'registration:', limit : 1000 });
                for (const [key, record] of records) { await storage.put (key, { ...record, revokedAt : record.revokedAt ?? this.now () }); await storage.delete ('headless:' + record.id); }
            }
        });
        return { disabled };
    }
}
