import assert from 'node:assert/strict';
import { CompleteAgentConsent } from '../../mcp/consent-completion.js';

async function attempt (failure)
{
    let pairArgs, revoked = false;
    const broker = { async PairWithCode (args) { pairArgs = args; if (failure === 'pair') { throw new Error ('private broker detail'); } }, async RevokeRegistration () { revoked = true; } };
    const oauth = { async completeAuthorization () { if (failure === 'completion') { throw new Error ('private provider detail'); } return { redirectTo : 'https://client.example/callback' }; } };
    const expiresAt = Date.now () + 86400000;
    const result = await CompleteAgentConsent ({ broker, oauth, accountId : 'account', registrationId : 'grant', record : { createdAt : Date.now (), expiresAt }, approved : { request : { scope : ['auto3d.read'] } }, name : 'Agent', harness : 'chatgpt', decision : 'approve', appWindowCode : 'ABCD-EFGH-JKLM-NPQR' });
    return { result, pairArgs, revoked, expiresAt };
}

describe ('MCP consent diagnostics', () => {
    it ('keeps the selected session paired for the grant lifetime', async () => {
        const { result, pairArgs, expiresAt } = await attempt (); assert.equal (result.redirectTo, 'https://client.example/callback'); assert.equal (pairArgs.expiresAt, expiresAt);
    });
    it ('distinguishes pairing from authorization completion failures and revokes both failed grants', async () => {
        const pair = await attempt ('pair'); assert.equal (pair.result.error, 'pair'); assert.equal (pair.revoked, true);
        const completion = await attempt ('completion'); assert.equal (completion.result.error, 'completion'); assert.equal (completion.revoked, true); assert.doesNotMatch (JSON.stringify (completion.result), /private/);
    });
});
