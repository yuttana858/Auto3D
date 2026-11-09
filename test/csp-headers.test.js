import assert from 'node:assert/strict';
import fs from 'node:fs';

describe ('Content-Security-Policy', () => {
    const headers = fs.readFileSync ('website/_headers', 'utf8');
    const policy = headers.match (/Content-Security-Policy: (.*)/)?.[1] || '';
    it ('blocks inline script, plugins and framing of the editor', () => {
        const script = policy.match (/script-src ([^;]*)/)[1];
        assert.ok (!script.includes ("'unsafe-inline'")); assert.ok (script.includes ('__INLINE_SCRIPT_HASHES__'));
        assert.match (policy, /object-src 'none'/); assert.match (policy, /base-uri 'self'/); assert.match (policy, /default-src 'self'/);
        assert.match (headers, /\/index\.html\n {2}X-Frame-Options: SAMEORIGIN/);
    });
    it ('hashes every inline bootstrap script in the Pages build', () => {
        const build = fs.readFileSync ('tools/build_pages.mjs', 'utf8');
        for (const file of ['index.html', 'embed.html', 'mini.html']) { assert.ok (build.includes ("'" + file + "'")); }
        assert.match (build, /__INLINE_SCRIPT_HASHES__/);
    });
});
