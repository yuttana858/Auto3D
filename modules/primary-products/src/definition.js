import { ValidateProductArtwork } from './artwork.js';
import { DefaultProductDraft, UpdateProductDraft } from './state.js';

export function ProductDefinition (draft, artwork = [])
{
    const normalized = UpdateProductDraft (DefaultProductDraft (), draft); const result = { schemaVersion : 1, generatorVersion : 1, units : 'mm', draft : normalized };
    if (artwork.length) { result.artwork = ValidateProductArtwork (normalized, artwork); }
    return result;
}
export function ValidateProductDefinition (value)
{
    if (!value || typeof value !== 'object' || Array.isArray (value) || Object.keys (value).some (key => !['schemaVersion', 'generatorVersion', 'units', 'draft', 'artwork'].includes (key)) || value.schemaVersion !== 1 || value.generatorVersion !== 1 || value.units !== 'mm') { throw new Error ('Unsupported Primary Products definition.'); }
    const keys = Object.keys (DefaultProductDraft (value.draft?.family));
    if (!value.draft || typeof value.draft !== 'object' || Array.isArray (value.draft) || keys.some (key => !Object.hasOwn (value.draft, key))) { throw new Error ('Incomplete Primary Products definition.'); }
    return ProductDefinition (value.draft, value.artwork === undefined ? [] : ValidateProductArtwork (value.draft, value.artwork));
}
