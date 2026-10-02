import { writeFile } from 'node:fs/promises';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

const registry = CreateAgentCommands ({ sessionEditor : {} });
await writeFile (new URL ('../website/assets/commands.json', import.meta.url), JSON.stringify ({ apiVersion : 1, commands : registry.Catalog () }, null, 2));
