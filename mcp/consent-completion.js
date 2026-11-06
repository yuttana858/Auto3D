// Keep pairing and OAuth completion failures distinct without disclosing secrets.
export async function CompleteAgentConsent ({ broker, oauth, accountId, registrationId, record, approved, name, harness, decision, appWindowCode })
{
    if (decision === 'approve' && appWindowCode) {
        try { await broker.PairWithCode ({ accountId, grantId : registrationId, code : appWindowCode, expiresAt : record.expiresAt }); }
        catch { await broker.RevokeRegistration ({ accountId, id : registrationId }); return { error : 'pair' }; }
    }
    try {
        const result = await oauth.completeAuthorization ({ request : approved.request, userId : accountId, scope : approved.request.scope, revokeExistingGrants : false, metadata : { registrationId, name, harness }, props : { registrationId, authorizedAt : record.createdAt } });
        return { redirectTo : result.redirectTo };
    } catch {
        await broker.RevokeRegistration ({ accountId, id : registrationId });
        console.error ('Auto3D agent authorization completion failed');
        return { error : 'completion' };
    }
}
