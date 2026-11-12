export const MaxLabelSVG = 65536;
export function ValidateLabelSource (source)
{
    if (!source || typeof source !== 'object' || Array.isArray (source)) { throw new Error ('Invalid editable label source.'); }
    if (source.kind === 'svg') {
        if (Object.keys (source).some (k => !['kind', 'svg'].includes (k)) || typeof source.svg !== 'string' || new TextEncoder ().encode (source.svg).length > MaxLabelSVG || !source.svg.trim ().startsWith ('<svg')) { throw new Error ('Use a self-contained SVG up to 64 KiB.'); }
        return { ...source };
    }
    if (source.kind !== 'text' || Object.keys (source).some (k => !['kind', 'text', 'color', 'background', 'fontSize', 'fontFamily', 'align'].includes (k))) { throw new Error ('Invalid text label settings.'); }
    const s = { color : '#123740', background : '#ffffff', fontSize : 72, fontFamily : 'sans-serif', align : 'center', ...source };
    if (typeof s.text !== 'string' || !s.text.trim () || s.text.length > 500 || s.text.split ('\n').length > 6 || !/^#[a-fA-F0-9]{6}$/.test (s.color) || s.background !== 'transparent' && !/^#[a-fA-F0-9]{6}$/.test (s.background) || !Number.isFinite (s.fontSize) || s.fontSize < 8 || s.fontSize > 120 || !['sans-serif', 'serif', 'monospace'].includes (s.fontFamily) || !['left', 'center', 'right'].includes (s.align)) { throw new Error ('Use up to 500 characters / six lines, a supported font, and a size of 8–120.'); }
    return s;
}
export function TextLabelSVG (input)
{
    const s = ValidateLabelSource ({ ...input, kind : 'text' }), escape = text => text.replace (/[&<>"']/g, c => ({ '&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', '\'' : '&apos;' }[c]));
    const lines = s.text.split ('\n'), fontSize = Math.min (s.fontSize, 960 / (Math.max (...s.text.split ('\n').map (line => Array.from (line).length)) + 1)), height = Math.max (512, lines.length * fontSize * 1.3 + 64), x = { left : 32, center : 512, right : 992 }[s.align], anchor = { left : 'start', center : 'middle', right : 'end' }[s.align];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 ${height}">${s.background === 'transparent' ? '' : `<rect width="1024" height="${height}" fill="${s.background}"/>`}<text x="${x}" y="${(height - (lines.length - 1) * fontSize * 1.3) / 2}" font-family="${s.fontFamily}" font-size="${fontSize}" fill="${s.color}" text-anchor="${anchor}">${lines.map ((line, i) => `<tspan x="${x}" dy="${i ? fontSize * 1.3 : 0}">${escape (line)}</tspan>`).join ('')}</text></svg>`;
}
