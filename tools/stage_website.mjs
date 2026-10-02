import { cp, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd ();
const destination = path.resolve (process.argv[2]);
await stat (path.join (destination, '.git')); // Require an existing deployment checkout.
const { version } = JSON.parse (await readFile (path.join (root, 'package.json'), 'utf8'));
for (const name of ['index.html', 'embed.html', 'robots.txt', 'assets', 'info']) {
    await cp (path.join (root, 'website', name), path.join (destination, name), { recursive : true });
}
await cp (path.join (root, 'build', 'website'), path.join (destination, 'o3dv'), { recursive : true });
for (const name of ['index.html', 'embed.html', 'info/index.html', 'info/cookies.html', 'info/faq.html']) {
    const filename = path.join (destination, name);
    const prefix = name.startsWith ('info/') ? '../' : '';
    const html = await readFile (filename, 'utf8');
    await writeFile (filename, html.replace (/<!-- website start -->[\s\S]*?<!-- website end -->/, '<!-- website start -->\n<link rel="stylesheet" href="' + prefix + 'o3dv/o3dv.website.min.css?v=' + version + '">\n<script src="' + prefix + 'o3dv/o3dv.website.min.js?v=' + version + '"></script>\n<!-- website end -->'));
}
console.log ('Staged Auto3D ' + version + ' at ' + destination);
