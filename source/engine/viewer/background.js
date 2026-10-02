export const BackgroundStops = [0, 0.45, 0.56, 0.59, 1];

export function GetBackgroundPreset (name, dark)
{
    const palettes = {
        dark : ['#000000', '#07090c', '#1b2228', '#171b1f', '#000000'],
        light : ['#ffffff', '#f8fafc', '#dbe2e8', '#e5e8eb', '#ffffff'],
        sunset : ['#30284d', '#ad697e', '#f6b779', '#9d6c64', '#302b37'],
        outdoor : ['#76afe0', '#c4dfef', '#e9eddd', '#adbda3', '#566b58']
    };
    const resolved = Object.prototype.hasOwnProperty.call (palettes, name) ? name : dark ? 'dark' : 'light';
    return { colors : palettes[resolved], dark : resolved === 'dark' || resolved === 'sunset' };
}

export function GetBackgroundGradientCSS (colors)
{
    return 'linear-gradient(to bottom, ' + colors.map ((color, index) => color + ' ' + Math.round (BackgroundStops[index] * 100) + '%').join (', ') + ')';
}
