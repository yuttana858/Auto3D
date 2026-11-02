// OAuth client names may be self-reported. The provider supplies clientDomain
// only after verifying a client metadata document; do not infer a brand.
export function AgentLabel (description)
{
    const raw = typeof description?.clientName === 'string' ? description.clientName : '';
    const name = [...raw].filter (character => { const code = character.codePointAt (0); return !(code < 32 || code >= 127 && code <= 159 || code === 0x200e || code === 0x200f || code >= 0x202a && code <= 0x202e || code >= 0x2066 && code <= 0x2069); }).join ('').trim ().slice (0, 80) || 'Agent';
    const domain = typeof description?.clientDomain === 'string' && /^[a-z0-9.-]{1,253}$/i.test (description.clientDomain) ? description.clientDomain.toLowerCase () : null;
    return { name, domain };
}
