import { readFile, writeFile } from 'node:fs/promises';

// Inventory only: classification does not grant agent permissions.
const catalog = JSON.parse (await readFile ('website/assets/commands.json', 'utf8'));
const groups = new Map ();
for (const command of catalog.commands) {
    const group = groups.get (command.category) || []; group.push ({ id : command.id, title : command.title, mutates : command.mutates, interactive : /\b(interactive|dialog)\b/i.test (command.description), review : 'pending' }); groups.set (command.category, group);
}
const result = { apiVersion : catalog.apiVersion, count : catalog.commands.length, status : 'Inventory only: no tool is exposed until individually reviewed.', categories : Object.fromEntries ([...groups].sort ((a, b) => a[0].localeCompare (b[0]))) };
await writeFile ('docs/auto3d-mcp-inventory.json', JSON.stringify (result, null, 2) + '\n');
