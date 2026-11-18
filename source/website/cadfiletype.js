const types = Object.freeze ({ x_t : 'x_t', xmt_txt : 'x_t', x_b : 'x_b', xmt_bin : 'x_b', step : 'step', stp : 'stp' });

export function CadFileType (name)
{
    const suffix = typeof name === 'string' ? name.split ('.').pop ().toLowerCase () : '';
    if (!Object.hasOwn (types, suffix)) { return null; }
    const extension = types[suffix], requiresUnits = extension === 'x_t' || extension === 'x_b';
    return { extension, suffix, format : requiresUnits ? 'parasolid' : 'step', label : requiresUnits ? 'Parasolid' : 'STEP', requiresUnits };
}

export const CadFileAccept = '.x_t,.x_b,.xmt_txt,.xmt_bin,.step,.stp';
