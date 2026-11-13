import { UpdatePulpDraft, DefaultPulpDraft, MoldedPulpVersion } from './state.js';
// Session archives keep userData values to 2000 characters, so at most 40 product references are stored.
export const MaxStoredProducts = 40;
// Authoring record stored on generated scene objects (userData), validated on archive/recovery load without loading
// geometry or UI. stage records whether the object is the flat sheet or the formed tray.
export function PulpDefinition (draft, stage, productIds = [])
{
    if (!['sheet', 'tray'].includes (stage)) { throw new Error ('Unknown molded pulp stage.'); }
    if (!Array.isArray (productIds) || productIds.length > MaxStoredProducts || productIds.some (id => typeof id !== 'string' || id.length < 1 || id.length > 128)) { throw new Error ('Invalid molded pulp product references.'); }
    return { schemaVersion : 1, module : 'molded-pulp', moduleVersion : MoldedPulpVersion, stage, productIds : [...productIds], draft : UpdatePulpDraft (DefaultPulpDraft (draft?.pulpType), draft) };
}
export function ValidatePulpDefinition (value)
{
    if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || value.module !== 'molded-pulp' || typeof value.moduleVersion !== 'string' || Object.keys (value).some (key => !['schemaVersion', 'module', 'moduleVersion', 'stage', 'productIds', 'draft'].includes (key))) { throw new Error ('Invalid molded pulp definition.'); }
    return { ...PulpDefinition (value.draft, value.stage, value.productIds), moduleVersion : value.moduleVersion };
}
