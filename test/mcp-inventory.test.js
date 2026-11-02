import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe ('MCP capability inventory', () => {
    it ('accounts for every indexed command without granting unreviewed tools', async () => {
        const catalog = JSON.parse (await readFile ('website/assets/commands.json', 'utf8')).commands, inventory = JSON.parse (await readFile ('docs/auto3d-mcp-inventory.json', 'utf8')); const items = Object.values (inventory.categories).flat ();
        assert.equal (inventory.count, catalog.length); assert.deepEqual (items.map (item => item.id).sort (), catalog.map (item => item.id).sort ()); assert.ok (items.every (item => item.review === 'pending'));
    });
});
