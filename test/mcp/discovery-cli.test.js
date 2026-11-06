import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { get } from 'node:http';

describe ('MCP discovery diagnostic', function () {
    this.timeout (10000);
    it ('uses a loopback callback and reports only the server and tool names', async () => {
        const child = spawn (process.execPath, ['--import', './test/fixtures/mcp-discovery-mock.mjs', './tools/diagnose_mcp_discovery.mjs'], { cwd : process.cwd (), stdio : ['ignore', 'pipe', 'pipe'] });
        let output = '', errors = '', called = false;
        child.stdout.on ('data', chunk => {
            output += chunk.toString ();
            const link = output.match (/https:\/\/auto3d-5av\.pages\.dev\/oauth\/authorize\?[^\s]+/);
            if (!called && link) {
                called = true; const url = new URL (link[0]); const callback = new URL (url.searchParams.get ('redirect_uri'));
                callback.searchParams.set ('state', url.searchParams.get ('state')); callback.searchParams.set ('code', 'fixture-secret-code');
                get (callback).on ('error', () => child.kill ());
            }
        });
        child.stderr.on ('data', chunk => { errors += chunk.toString (); });
        const code = await new Promise ((resolve, reject) => { child.on ('error', reject); child.on ('exit', resolve); });
        assert.equal (code, 0, errors); assert.match (output, /Server: Auto3D test-version/); assert.match (output, /auto3d\.sessions\.pair_code/); assert.doesNotMatch (output, /fixture-secret-token|fixture-secret-code/);
    });
});
