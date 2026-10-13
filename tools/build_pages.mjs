import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const output = 'build/pages';
await mkdir (output, { recursive: true });
await cp ('website', output, { recursive: true });
await cp ('build/website', path.join (output, 'o3dv'), { recursive: true });
const moduleJS = await readFile ('build/website/packaging/packaging.module.js'); const moduleCSS = await readFile ('build/website/packaging/packaging.module.css');
const miniJS = await readFile ('build/website/o3dv.mini.js');
const version = createHash ('sha256').update (await readFile ('build/website/o3dv.website.min.js')).update (await readFile ('build/website/o3dv.website.min.css')).update (await readFile ('build/website/o3dv.optimize.js')).update (await readFile ('build/website/o3dv.recovery.js')).update (moduleJS).update (moduleCSS).update (miniJS).digest ('hex').slice (0, 12);
const buildCandidate = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || version;
const build = /^[a-f0-9]{7,64}$/i.test (buildCandidate) ? buildCandidate : version;
const appVersion = (await readFile ('source/website/preferences.js', 'utf8')).match (/AppVersion = '([^']+)'/)[1];
const scriptHash = createHash ('sha256').update (await readFile ('build/website/o3dv.website.min.js')).digest ('hex');
const modules = { packaging : { version : JSON.parse (await readFile ('modules/packaging/package.json', 'utf8')).version, script : `/o3dv/packaging/packaging.module.js?v=${version}`, scriptHash : createHash ('sha256').update (moduleJS).digest ('hex'), stylesheet : `/o3dv/packaging/packaging.module.css?v=${version}`, stylesheetHash : createHash ('sha256').update (moduleCSS).digest ('hex') } };
const viewers = { mini : { script : `/o3dv/o3dv.mini.js?v=${version}`, scriptHash : createHash ('sha256').update (miniJS).digest ('hex') } };
await writeFile (path.join (output, 'version.json'), JSON.stringify ({ version : appVersion, build, assetDigest : version, script : `/o3dv/o3dv.website.min.js?v=${version}`, scriptHash, modules, viewers }, null, 2));
const miniHtml = await readFile (path.join (output, 'mini.html'), 'utf8');
await writeFile (path.join (output, 'mini.html'), miniHtml.replace ('</head>', `<meta name="auto3d-build" content="${build}">\n</head>`).replace ('/o3dv/o3dv.mini.js"', viewers.mini.script + '"'));
for (const file of ['index.html', 'embed.html', 'info/index.html', 'info/cookies.html', 'info/faq.html']) {
    const target = path.join (output, file);
    const prefix = file.startsWith ('info/') ? '../' : '';
    const html = await readFile (target, 'utf8');
    const tagged = html.replace ('</head>', `<meta name="auto3d-build" content="${build}">\n</head>`);
    await writeFile (target, tagged.replace (/<!-- website start -->[\s\S]*?<!-- website end -->/, `<!-- website start -->\n<link rel="stylesheet" href="${prefix}o3dv/o3dv.website.min.css?v=${version}">\n<script src="${prefix}o3dv/o3dv.website.min.js?v=${version}"></script>\n<!-- website end -->`));
}
await cp ('LICENSE.md', path.join (output, 'LICENSE.md'));
await writeFile (path.join (output, '.nojekyll'), '');
console.log (`Pages site built at ${output}`);
