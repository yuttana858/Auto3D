import { writeFile } from 'node:fs/promises';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

const registry = CreateAgentCommands ({ sessionEditor : {} });
const commands = registry.Catalog ();
await writeFile (new URL ('../website/assets/commands.json', import.meta.url), JSON.stringify ({ apiVersion : 1, commands }, null, 2));
const commandIds = commands.map (command => '    \'' + command.id + '\'').join (',\n');
await writeFile (new URL ('../mcp/command-catalog.js', import.meta.url), 'export const CommandIds = Object.freeze ([\n' + commandIds + '\n]);\n');
