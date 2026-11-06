import assert from 'node:assert/strict';
import { DiscoveryVersion } from '../../mcp/discovery.js';

describe ('MCP discovery version', () => {
    it ('changes when tool schemas or available permissions change', async () => {
        const tools = [{ name : 'scene.inspect', inputSchema : { type : 'object', properties : {} } }];
        const first = await DiscoveryVersion ('0.49.1', tools);
        assert.match (first, /^0\.49\.1\+[a-f0-9]{16}$/);
        assert.equal (first, await DiscoveryVersion ('0.49.1', structuredClone (tools)));
        assert.notEqual (first, await DiscoveryVersion ('0.49.1', [...tools, { name : 'auto3d.commands.invoke' }]));
        assert.notEqual (first, await DiscoveryVersion ('0.49.1', [{ ...tools[0], description : 'Updated' }]));
        assert.notEqual (first, await DiscoveryVersion ('0.49.2', tools));
        assert.notEqual (await DiscoveryVersion ('0.49.1', { tools, catalog : [] }), await DiscoveryVersion ('0.49.1', { tools, catalog : [{ id : 'new.command' }] }));
    });
});
