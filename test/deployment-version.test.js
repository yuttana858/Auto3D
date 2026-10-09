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
    it ('verifies separately deployed Packaging script and styles, and rejects stale or external module assets', async () => {
        const hash = text => createHash ('sha256').update (text).digest ('hex');
        const module = { version : '1.0.0', script : '/o3dv/packaging/packaging.module.js?v=0123456789ab', scriptHash : hash ('packaging'), stylesheet : '/o3dv/packaging/packaging.module.css?v=0123456789ab', stylesheetHash : hash ('styles') };
        const fetcher = (override = {}, content = 'packaging') => async url => {
            if (url.pathname === '/version.json') { return new Response (JSON.stringify ({ ...release, modules : { packaging : { ...module, ...override } } })); }
            if (url.pathname.includes ('packaging.module.js')) { return new Response (content); }
            if (url.pathname.includes ('packaging.module.css')) { return new Response ('styles'); }
            return fixture () (url);
        };
        assert.equal ((await VerifyDeployment ('https://fixture.example', sha, fetcher ())).verified, true);
        await assert.rejects (VerifyDeployment ('https://fixture.example', sha, fetcher ({}, 'old module')), /Packaging module script/);
        await assert.rejects (VerifyDeployment ('https://fixture.example', sha, fetcher ({ stylesheetHash : hash ('old styles') })), /Packaging module stylesheet/);
        await assert.rejects (VerifyDeployment ('https://fixture.example', sha, fetcher ({ script : 'https://elsewhere.example/module.js' })), /module location/);
    });
});
