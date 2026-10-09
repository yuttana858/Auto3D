import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VerifyDeployment } from '../tools/verify_deployment.mjs';
describe ('Production release verification', () => {
    const script = '/o3dv/o3dv.website.min.js?v=0123456789ab'; const code = 'the built application'; const sha = 'a'.repeat (40);
    const release = { version : '0.27.1', build : sha, script, scriptHash : createHash ('sha256').update (code).digest ('hex') };
    const fixture = (changes = {}, servedCode = code, htmlBuild = sha) => async url => new Response (url.pathname === '/version.json' ? JSON.stringify ({ ...release, ...changes }) : url.pathname === '/' ? `<meta name="auto3d-build" content="${htmlBuild}"><script src="${script.slice (1)}"></script>` : servedCode);
    it ('checks the manifest, HTML build and actual served bundle together', async () => { assert.deepEqual (await VerifyDeployment ('https://fixture.example', sha, fixture ()), { version : '0.27.1', build : sha, verified : true }); });
    it ('rejects old commits, stale HTML, stale bundles and external script URLs', async () => {
        await assert.rejects (VerifyDeployment ('https://fixture.example', sha, fixture ({ build : 'old' })), /commit/);
        await assert.rejects (VerifyDeployment ('https://fixture.example', sha, fixture ({}, code, 'old')), /HTML/);
        await assert.rejects (VerifyDeployment ('https://fixture.example', sha, fixture ({}, 'old bundle')), /bundle/);
        await assert.rejects (VerifyDeployment ('https://fixture.example', sha, fixture ({ script : 'https://elsewhere.example/app.js' })), /location/);
    });
});
