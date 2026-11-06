// The discovery fingerprint changes when advertised tools, catalog or permissions change.
// It is public metadata: never include account identifiers or token contents.
export async function DiscoveryVersion (appVersion, tools)
{
    const bytes = new TextEncoder ().encode (JSON.stringify (tools));
    const hash = new Uint8Array (await crypto.subtle.digest ('SHA-256', bytes));
    return appVersion + '+' + [...hash.slice (0, 8)].map (value => value.toString (16).padStart (2, '0')).join ('');
}
