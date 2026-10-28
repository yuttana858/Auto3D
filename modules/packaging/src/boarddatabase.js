import { BoardCalipers } from './profile.js';
import { DefaultBoardSpecification, ValidateBoardSpecification } from './engineering.js';
export const BoardFlutes = ['E', 'B', 'C', 'EB', 'BC', 'ACA', 'BCB'];
// Allowance factors stay design/style-specific; the reusable catalog holds board data.
export const BoardCSVColumns = Object.keys (DefaultBoardSpecification ()).filter (key => !['insideFactors', 'outsideFactors'].includes (key));
export function DefaultBoardDatabase ()
{
    return BoardFlutes.map (flute => {
        const caliperMm = BoardCalipers[flute + ' flute (nominal)']; const spec = DefaultBoardSpecification (caliperMm);
        Object.assign (spec, { id : 'nominal-' + flute.toLowerCase (), name : flute + ' flute · nominal', flute, provenance : 'Nominal starting point, not a supplier-certified grade. Replace with measured converter data.', flutePitchMm : flute === 'E' || flute === 'EB' ? 3.5 : flute === 'B' ? 6.5 : 8 });
        return Object.fromEntries (BoardCSVColumns.map (key => [key, spec[key]]));
    });
}
export function ValidateBoardDatabase (input)
{
    if (!Array.isArray (input) || !input.length || input.length > 32) { throw new Error ('Board database needs 1–32 records.'); }
    const ids = new Set ();
    return input.map (record => {
        if (!record || Object.keys (record).some (key => !BoardCSVColumns.includes (key)) || !BoardFlutes.includes (record.flute)) { throw new Error ('Use E, B, C, EB, BC, ACA or BCB flute and the supported board columns.'); }
        const specification = ValidateBoardSpecification ({ ...record, insideFactors : [0, 0, 0], outsideFactors : [0, 0, 0] });
        if (specification.caliperMm < 0.5 || specification.caliperMm > 15) { throw new Error ('Packaging generation requires 0.5–15 mm board caliper.'); }
        if (ids.has (specification.id)) { throw new Error ('Board IDs must be unique.'); } ids.add (specification.id);
        return Object.fromEntries (BoardCSVColumns.map (key => [key, specification[key]]));
    });
}
export function ExportBoardCSV (records)
{
    const quote = value => '"' + String (value).replaceAll ('"', '""') + '"';
    return [BoardCSVColumns.join (','), ...ValidateBoardDatabase (records).map (record => BoardCSVColumns.map (key => quote (record[key])).join (','))].join ('\r\n') + '\r\n';
}
export function ImportBoardCSV (text)
{
    if (typeof text !== 'string' || new TextEncoder ().encode (text).byteLength > 65536) { throw new Error ('Use a CSV file up to 64 KiB.'); }
    const rows = []; let row = [], field = '', quoted = false, closed = false;
    const pushField = () => { row.push (field); field = ''; closed = false; };
    text = text.replace (/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) { if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else { field += char; } continue; }
        if (closed && ![',', '\r', '\n'].includes (char)) { throw new Error ('Unexpected text after a quoted CSV value.'); }
        if (char === '"') { if (field) { throw new Error ('Quote CSV values from the start of a field.'); } quoted = true; }
        else if (char === ',') { pushField (); }
        else if (char === '\r' || char === '\n') { if (char === '\r' && text[i + 1] === '\n') { i++; } pushField (); if (row.some (value => value !== '')) { rows.push (row); } row = []; }
        else { field += char; }
    }
    if (quoted) { throw new Error ('Unclosed CSV quote.'); } if (field || row.length) { pushField (); rows.push (row); }
    const header = rows.shift ();
    if (!header || header.length !== BoardCSVColumns.length || new Set (header).size !== header.length || header.some (key => !BoardCSVColumns.includes (key))) { throw new Error ('Keep every supported CSV column exactly once.'); }
    const sample = DefaultBoardDatabase ()[0];
    return ValidateBoardDatabase (rows.map (values => {
        if (values.length !== header.length) { throw new Error ('Each CSV row must have the same number of columns.'); }
        return Object.fromEntries (header.map ((key, i) => {
            const raw = values[i]; if (typeof sample[key] === 'number') { if (!raw.trim ()) { throw new Error ('Numeric CSV fields cannot be empty.'); } return [key, Number (raw)]; }
            if (typeof sample[key] === 'boolean') { if (!['true', 'false'].includes (raw)) { throw new Error ('Calibration status must be true or false.'); } return [key, raw === 'true']; }
            return [key, raw];
        }));
    }));
}
