import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify (execFile);

describe ('Cloudflare OAuth provider integration', function () {
    it ('issues and validates an account-bound PKCE grant and rejects code replay', async function () {
        const result = await exec (process.execPath, ['--import', './test/helpers/cloudflare-shim.mjs', './test/helpers/mcp-real-oauth.mjs'], { timeout : 10000 });
        assert.equal (result.stdout, '');
    });
});
