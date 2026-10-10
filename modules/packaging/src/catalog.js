// Original descriptions and illustrations; identifiers follow the FEFCO code.
export const FefcoSource = 'https://www.fefco.org/technical-information/fefco-code';
export const FefcoFamilies = [
    { id : '02', name : 'Slotted boxes', available : true },
    { id : '03', name : 'Telescope boxes', available : false },
    { id : '04', name : 'Folder boxes and trays', available : false },
    { id : '05', name : 'Slide boxes', available : false },
    { id : '06', name : 'Rigid boxes', available : false },
    { id : '07', name : 'Ready-glued boxes', available : false },
    { id : '08', name : 'Retail and e-commerce', available : false },
    { id : '09', name : 'Interior fitments', available : false }
];
export const FefcoStyles = [
    { code : '0201', acronym : 'RSC', name : 'Regular slotted container', category : 'Regular slotted', description : 'Equal-depth flaps. The two outer flaps meet at the center.', priority : true },
    { code : '0200', acronym : 'HSC', name : 'Half slotted container', category : 'Half slotted', description : 'A slotted base with an open top and no top flaps.', priority : true },
    { code : '0202', acronym : 'OSC', name : 'Overlap slotted container', category : 'Overlap slotted', description : 'Longer equal-depth flaps give a configurable partial overlap.' },
    { code : '0203', acronym : 'FOL', name : 'Full overlap slotted container', category : 'Overlap slotted', description : 'Equal-depth flaps reach the full box width for overlapping closure.' }
];
export function FefcoCatalog () { return { source : FefcoSource, edition : '12th (2022)', families : FefcoFamilies.map (item => ({ ...item })), styles : FefcoStyles.map (item => ({ ...item, family : '02', available : true, folding : { supported : true, cadMapped : true, solidCaliper : true, top : item.code === '0200' ? 'open' : 'flaps' } })) }; }
export function FefcoThumbnail (code)
{
    if (code === '0201') { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 140"><ellipse cx="90" cy="121" rx="65" ry="10" fill="#000" opacity=".08"/><g stroke="#87633f" stroke-width="1.4" stroke-linejoin="round"><path d="M24 48L82 29 145 52 87 76Z" fill="#d6b183"/><path d="M24 48L87 76 87 124 24 94Z" fill="#c7a071"/><path d="M87 76L145 52 145 99 87 124Z" fill="#ad8150"/><path d="M53 38.5L116 64" fill="none" stroke="#87633f" stroke-width="2"/><path d="M28 50L87 78 141 55" fill="none" stroke="#edd2a5" stroke-width="3"/></g></svg>'; }
    const hsc = code === '0200'; const overlap = code === '0202' || code === '0203';
    const flap = hsc ? '' : '<path d="M24 48L8 24 67 8 82 29Z" fill="#d6b183"/><path d="M82 29L98 7 143 24 125 45Z" fill="#c49a68"/><path d="M24 48L42 29 72 39 61 62Z" fill="#b78c59"/><path d="M125 45L145 34 160 59 145 80Z" fill="#d6b183"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 140"><ellipse cx="90" cy="121" rx="65" ry="10" fill="#000" opacity=".08"/><g stroke="#87633f" stroke-width="1.4" stroke-linejoin="round"><path d="M24 48L82 29 145 52 87 76Z" fill="#85613d"/>' + flap + '<path d="M24 48L87 76 87 124 24 94Z" fill="#c7a071"/><path d="M87 76L145 52 145 99 87 124Z" fill="#ad8150"/><path d="M28 50L87 78 141 55" fill="none" stroke="#edd2a5" stroke-width="3"/><path d="M28 55L28 91M90 81L90 120" stroke="#997047" opacity=".7"/>' + (overlap ? '<path d="M43 36L' + (code === '0203' ? '118 63' : '100 56') + '" stroke-dasharray="3 2" fill="none"/>' : '') + '</g></svg>';
}
