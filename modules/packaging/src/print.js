// Printed top face for flat boards (collars, pads, custom dielines): a white or natural top ("ground")
// and optional artwork placed on the dieline in canonical mm. The artwork image itself is a host
// resource identified by its SHA-256; this module only maps it. Pure: no host imports.
//
// Board meshes keep profile X/Y as world X/−Z with the caliper up, so the printed face is the top
// (+Y) face. The artwork rectangle is in profile coordinates: x, y = lower-left corner (y up).

export const PrintGrounds = Object.freeze (['natural', 'white']);
export const PrintMimes = Object.freeze (['image/png', 'image/jpeg', 'image/webp']);
export const WhiteTopColor = Object.freeze ([247, 246, 241]);
const Keys = ['version', 'ground', 'artwork'], ArtworkKeys = ['resourceId', 'mime', 'name', 'widthPx', 'heightPx', 'xMm', 'yMm', 'widthMm', 'heightMm'];

export function ValidatePrint (input)
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || input.version !== 1 || Object.keys (input).some (key => !Keys.includes (key))) { throw new Error ('Invalid board print settings.'); }
    if (!PrintGrounds.includes (input.ground)) { throw new Error ('Choose a print ground: natural or white.'); }
    const result = { version : 1, ground : input.ground };
    if (input.artwork !== undefined && input.artwork !== null) {
        const a = input.artwork;
        if (!a || typeof a !== 'object' || Array.isArray (a) || Object.keys (a).some (key => !ArtworkKeys.includes (key))) { throw new Error ('Invalid board artwork.'); }
        if (typeof a.resourceId !== 'string' || !/^[0-9a-f]{64}$/.test (a.resourceId)) { throw new Error ('Board artwork needs its image resource ID.'); }
        if (!PrintMimes.includes (a.mime)) { throw new Error ('Board artwork must be PNG, JPEG or WebP.'); }
        for (const key of ['widthPx', 'heightPx']) { if (!Number.isInteger (a[key]) || a[key] < 1 || a[key] > 8192) { throw new Error ('Board artwork image size must be 1–8192 px.'); } }
        for (const key of ['xMm', 'yMm']) { if (typeof a[key] !== 'number' || !Number.isFinite (a[key]) || Math.abs (a[key]) > 100000) { throw new Error ('Board artwork position must be within ±100000 mm.'); } }
        for (const key of ['widthMm', 'heightMm']) { if (typeof a[key] !== 'number' || !Number.isFinite (a[key]) || a[key] < 0.1 || a[key] > 100000) { throw new Error ('Board artwork size must be 0.1–100000 mm.'); } }
        result.artwork = { resourceId : a.resourceId, mime : a.mime, name : typeof a.name === 'string' && a.name ? a.name.slice (0, 120) : 'Artwork', widthPx : a.widthPx, heightPx : a.heightPx, xMm : a.xMm, yMm : a.yMm, widthMm : a.widthMm, heightMm : a.heightMm };
    }
    return result;
}

// Places artwork of the given pixel size over a rectangle (profile mm): 'cover' fills it (cropping by the
// dieline cut), 'contain' fits inside it, 'stretch' matches it exactly. The image stays centred.
export function FitArtwork ({ widthPx, heightPx }, { minX, minY, maxX, maxY }, mode = 'cover')
{
    if (!(widthPx > 0 && heightPx > 0) || !(maxX > minX && maxY > minY)) { throw new Error ('Artwork and area need positive sizes.'); }
    if (!['cover', 'contain', 'stretch'].includes (mode)) { throw new Error ('Fit artwork with cover, contain or stretch.'); }
    const w = maxX - minX, h = maxY - minY, image = widthPx / heightPx, area = w / h;
    let widthMm = w, heightMm = h;
    if (mode === 'cover') { if (image > area) { widthMm = h * image; } else { heightMm = w / image; } }
    if (mode === 'contain') { if (image > area) { heightMm = w / image; } else { widthMm = h * image; } }
    return { xMm : minX + (w - widthMm) / 2, yMm : minY + (h - heightMm) / 2, widthMm, heightMm };
}

// Clips a convex polygon of [x, y] points to the half-plane where sign * (p[axis] − value) >= 0.
function Clip (polygon, axis, value, sign)
{
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = sign * (a[axis] - value), db = sign * (b[axis] - value);
        if (da >= 0) { result.push (a); }
        if ((da >= 0) !== (db >= 0)) { const f = da / (da - db); result.push ([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
    }
    return result.length >= 3 ? result : [];
}
const Area = polygon => polygon.reduce ((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

// Applies the print to a CreateBoard mesh in place: top-face triangles take the ground material, and the
// part under the artwork rectangle takes the artwork material with UVs across that rectangle. Returns the
// material indices it added.
export function ApplyBoardPrint (mesh, materials, print)
{
    const settings = ValidatePrint (print), artwork = settings.artwork;
    if (settings.ground === 'natural' && !artwork) { return { ground : null, artwork : null }; }
    const base = materials[0];
    let ground = 0;
    if (settings.ground === 'white') {
        // White top: the coated liner keeps its paper relief but loses the kraft colour image.
        const white = { ...base }; delete white.diffuseMap;
        ground = materials.push ({ ...white, role : 'print-ground', name : 'White top', color : [...WhiteTopColor], roughness : Math.min (base.roughness ?? .8, .62) }) - 1;
    }
    const art = artwork ? materials.push ({ role : 'print', name : 'Print · ' + artwork.name, color : [255, 255, 255], roughness : .5, metalness : 0, printResource : artwork.resourceId, printMime : artwork.mime }) - 1 : null;
    const top = mesh.triangles.filter (t => t.material === 0 && mesh.normals[t.normals[0]][1] > .5);
    if (!artwork) { top.forEach (t => { t.material = ground; }); return { ground, artwork : null }; }
    const x0 = artwork.xMm, y0 = artwork.yMm, x1 = x0 + artwork.widthMm, y1 = y0 + artwork.heightMm;
    const keep = new Set (mesh.triangles.filter (t => !top.includes (t)));
    const added = [];
    const emit = (polygon, y, material, inside) => {
        if (polygon.length < 3 || Math.abs (Area (polygon)) < 1e-9) { return; }
        const ids = polygon.map (([x, py]) => {
            const v = mesh.vertices.push ([x, y, -py]) - 1, n = mesh.normals.push ([0, 1, 0]) - 1;
            const uv = mesh.uvs.push (inside ? [(x - x0) / (x1 - x0), (py - y0) / (y1 - y0)] : [x / 50, py / 50]) - 1;
            return { v, n, uv };
        });
        for (let i = 1; i + 1 < ids.length; i++) { const tri = [ids[0], ids[i], ids[i + 1]]; added.push ({ vertices : tri.map (p => p.v), normals : tri.map (p => p.n), uvs : tri.map (p => p.uv), material }); }
    };
    for (const t of top) {
        const points = t.vertices.map (i => [mesh.vertices[i][0], -mesh.vertices[i][2]]), y = mesh.vertices[t.vertices[0]][1];
        // Split into the parts left, right, below and above the artwork, and the part inside it.
        emit (Clip (points, 0, x0, -1), y, ground, false); let rest = Clip (points, 0, x0, 1);
        emit (Clip (rest, 0, x1, 1), y, ground, false); rest = Clip (rest, 0, x1, -1);
        emit (Clip (rest, 1, y0, -1), y, ground, false); rest = Clip (rest, 1, y0, 1);
        emit (Clip (rest, 1, y1, 1), y, ground, false); rest = Clip (rest, 1, y1, -1);
        emit (rest, y, art, true);
    }
    mesh.triangles = [...mesh.triangles.filter (t => keep.has (t)), ...added];
    return { ground, artwork : art };
}
