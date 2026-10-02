import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = 'build/pages';
await mkdir (output, { recursive: true });
await cp ('website', output, { recursive: true });
await cp ('build/website', path.join (output, 'o3dv'), { recursive: true });
for (const file of ['index.html', 'embed.html', 'info/index.html', 'info/cookies.html', 'info/faq.html']) {
    const target = path.join (output, file);
    const prefix = file.startsWith ('info/') ? '../' : '';
    const html = await readFile (target, 'utf8');
    await writeFile (target, html.replace (/<!-- website start -->[\s\S]*?<!-- website end -->/, `<!-- website start -->\n<link rel="stylesheet" href="${prefix}o3dv/o3dv.website.min.css">\n<script src="${prefix}o3dv/o3dv.website.min.js"></script>\n<!-- website end -->`));
}
await cp ('LICENSE.md', path.join (output, 'LICENSE.md'));
await writeFile (path.join (output, '.nojekyll'), '');
console.log (`Pages site built at ${output}`);
