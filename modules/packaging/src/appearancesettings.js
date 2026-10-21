export const DefaultBoardAppearance = Object.freeze ({ enabled : true, panelBow : .18, foldSoftness : 1, cutCompression : .18, paperGrain : .35 });
export function ValidateBoardAppearance (input = {})
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (key => !Object.prototype.hasOwnProperty.call (DefaultBoardAppearance, key))) { throw new Error ('Invalid board appearance settings.'); }
    const result = { ...DefaultBoardAppearance, ...input };
    if (typeof result.enabled !== 'boolean' || !['panelBow', 'foldSoftness', 'cutCompression', 'paperGrain'].every (key => Number.isFinite (result[key]) && result[key] >= 0 && result[key] <= (key === 'foldSoftness' ? 2 : 1))) { throw new Error ('Use board appearance strengths from 0 to 1, or fold softness from 0 to 2.'); }
    return result;
}
