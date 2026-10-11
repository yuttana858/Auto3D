import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export async function VerifyDeployment (origin, expectedBuild, fetchImpl = fetch) {
    const root = new URL (origin); const read = async path => {
        const response = await fetchImpl (new URL (path, root), { cache : 'no-store', signal : AbortSignal.timeout (15000) });
        if (!response.ok) { throw new Error ('Release verification HTTP ' + response.status); }
        return response;
    };
    const release = await (await read ('/version.json?check=' + Date.now ())).json ();
    if (release.build !== expectedBuild) { throw new Error ('Deployment commit does not match the release: ' + release.build); }
    if (!/^\/o3dv\/o3dv\.website\.min\.js\?v=[a-f0-9]{12}$/.test (release.script)) { throw new Error ('Invalid release script location.'); }
    const html = await (await read ('/?check=' + Date.now ())).text ();
    if (!html.includes ('content="' + expectedBuild + '"') || !html.includes ('src="' + release.script.slice (1) + '"')) { throw new Error ('HTML references a different release.'); }
    const buffer = await (await read (release.script)).arrayBuffer ();
    if (createHash ('sha256').update (Buffer.from (buffer)).digest ('hex') !== release.scriptHash) { throw new Error ('Served application bundle does not match the release.'); }
    if (release.viewers?.mini) {
        const mini = release.viewers.mini;
        if (!/^\/o3dv\/o3dv\.mini\.js\?v=[a-f0-9]{12}$/.test (mini.script)) { throw new Error ('Invalid Mini viewer location.'); }
        const html = await (await read ('/mini.html')).text ();
        if (!html.includes ('content="' + expectedBuild + '"') || !html.includes ('src="' + mini.script + '"')) { throw new Error ('Mini viewer HTML references a different release.'); }
        const bytes = await (await read (mini.script)).arrayBuffer ();
        if (createHash ('sha256').update (Buffer.from (bytes)).digest ('hex') !== mini.scriptHash) { throw new Error ('Mini viewer bundle does not match the release.'); }
    }
    if (release.modules?.packaging) {
        const module = release.modules.packaging;
        for (const [key, hash] of [['script', 'scriptHash'], ['stylesheet', 'stylesheetHash']]) {
            if (!new RegExp ('^/o3dv/packaging/packaging\\.module\\.' + (key === 'script' ? 'js' : 'css') + '\\?v=[a-f0-9]{12}$').test (module[key])) { throw new Error ('Invalid Packaging module location.'); }
            const bytes = await (await read (module[key])).arrayBuffer ();
            if (createHash ('sha256').update (Buffer.from (bytes)).digest ('hex') !== module[hash]) { throw new Error ('Served Packaging module ' + key + ' does not match the release.'); }
        }
    }
    return { version : release.version, build : release.build, verified : true };
}
if (process.argv[1] && import.meta.url === pathToFileURL (process.argv[1]).href) {
    let result;
    for (let attempt = 0; attempt < 5; attempt++) {
        try { result = await VerifyDeployment (process.argv[2], process.argv[3]); break; }
        catch (error) { if (attempt === 4) { throw error; } await new Promise (resolve => setTimeout (resolve, 3000)); }
    }
    console.log ('Production release verified:', JSON.stringify (result));
}
