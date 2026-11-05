import { DefaultProductDraft, UpdateProductDraft } from './state.js';

export function ProductDefinition (draft)
{
    return { schemaVersion : 1, generatorVersion : 1, units : 'mm', draft : UpdateProductDraft (DefaultProductDraft (), draft) };
}
export function ValidateProductDefinition (value)
{
    if (!value || typeof value !== 'object' || Array.isArray (value) || Object.keys (value).some (key => !['schemaVersion', 'generatorVersion', 'units', 'draft'].includes (key)) || value.schemaVersion !== 1 || value.generatorVersion !== 1 || value.units !== 'mm') { throw new Error ('Unsupported Primary Products definition.'); }
    const keys = Object.keys (DefaultProductDraft ());
    if (!value.draft || typeof value.draft !== 'object' || Array.isArray (value.draft) || keys.some (key => !Object.hasOwn (value.draft, key))) { throw new Error ('Incomplete Primary Products definition.'); }
    return ProductDefinition (value.draft);
}
