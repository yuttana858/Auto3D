import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CreateAgentCommands, UserGestureAvailable } from '../source/website/agentcommands.js';
import { Validate } from '../source/website/commandregistry.js';
import { CommandIds } from '../mcp/command-catalog.js';

const catalog = CreateAgentCommands ({ sessionEditor : {} }).Catalog ();
// mutates means the command changes the open document/session or shared data, which read-only viewers block.
// Sign-in, personal preferences, local diagnostics and local macros stay available in read-only viewers.
const NonMutatingVerbs = new Set (['packaging.draft.cancel', 'polygon.cancel', 'material.texture.save', 'ui.save', 'macro.cancel', 'auth.sign_out', 'auth.recover', 'diagnostics.clear', 'macro.save', 'selection.clear']); // selection.clear only deselects, like object.select.
const MustMutate = ['lighting.effects', 'lighting.restore', 'view.background', 'camera.fov', 'render.now', 'render.queue.enqueue', 'render.queue.start', 'render.queue.clear', 'render.queue.delete', 'render.queue.cancel', 'object.array.playback', 'packaging.fefco.playback'];

describe ('Agent command catalog contract', () => {
    it ('has an example that satisfies every command schema', () => {
        for (const command of catalog) { assert.doesNotThrow (() => Validate (command.example ?? {}, command.inputSchema), command.id); }
    });
    it ('marks state-changing commands as mutating', () => {
        const verbs = /\.(set|save|delete|remove|clear|create|update|generate|apply|add|rename|move|revoke|approve|reject|restore|discard|sign_out|recover|enqueue|start|stop|cancel|paste|duplicate|transform|extrude|refine)$/;
        for (const command of catalog) {
            if (/\.(inspect|list)$/.test (command.id)) { assert.equal (command.mutates, false, command.id); }
            if (verbs.test (command.id) && !NonMutatingVerbs.has (command.id)) { assert.equal (command.mutates, true, command.id); }
        }
        for (const id of MustMutate) { assert.equal (catalog.find (command => command.id === id)?.mutates, true, id); }
    });
    it ('bounds every string and number an agent can send', () => {
        const unbounded = [];
        const walk = (schema, path) => {
            if (!schema) { return; }
            const fixedPattern = typeof schema.pattern === 'string' && /^\^.*\$$/.test (schema.pattern) && !/[*+]|\{\d+,\}/.test (schema.pattern);
            if (schema.type === 'string' && schema.maxLength === undefined && !schema.enum && !fixedPattern) { unbounded.push (path); }
            if (['number', 'integer'].includes (schema.type) && schema.maximum === undefined && !schema.enum) { unbounded.push (path); }
            for (const [key, value] of Object.entries (schema.properties || {})) { walk (value, path + '.' + key); }
            if (schema.items) { walk (schema.items, path + '[]'); }
            (schema.anyOf || []).forEach ((value, index) => walk (value, path + '|' + index));
        };
        for (const command of catalog) { walk (command.inputSchema, command.id); }
        assert.deepEqual (unbounded, []);
    });
    it ('keeps the published and MCP catalogs identical to the registry', () => {
        assert.deepEqual (JSON.parse (fs.readFileSync ('website/assets/commands.json')).commands, catalog);
        assert.deepEqual ([...CommandIds], catalog.map (command => command.id));
    });
    it ('documents gesture-only actions and reports them instead of claiming success', async () => {
        for (const id of ['ui.add_model', 'ui.update_model', 'ai.project.open_file', 'ai.reference.open', 'view.fullscreen']) { assert.match (catalog.find (command => command.id === id).description, /user gesture/, id); }
        const saved = Object.getOwnPropertyDescriptor (globalThis, 'navigator');
        try {
            Object.defineProperty (globalThis, 'navigator', { value : { userActivation : { isActive : false } }, configurable : true });
            assert.equal (UserGestureAvailable (), false);
            let opened = 0; const website = { sessionEditor : { AddModel () { opened++; } }, auth : null };
            const result = await CreateAgentCommands (website).Invoke ('ui.add_model', {});
            assert.deepEqual ([result.opened, result.requiresUserGesture, opened], [false, true, 0]);
            Object.defineProperty (globalThis, 'navigator', { value : { userActivation : { isActive : true } }, configurable : true });
            assert.equal ((await CreateAgentCommands (website).Invoke ('ui.add_model', {})).opened, true); assert.equal (opened, 1);
        } finally { if (saved) { Object.defineProperty (globalThis, 'navigator', saved); } else { delete globalThis.navigator; } }
    });
    it ('renames sessions, deletes user data and discards recovery through shared editor methods', async () => {
        const calls = []; const item = { id : 'object-1', userData : { SKU : 'A' } };
        const editor = { document : { objects : [item] }, selected : item, Select () {}, SetSessionName (name) { calls.push (['rename', name]); return { name, changed : true }; }, RemoveUserData (target, key) { calls.push (['user', target.id, key]); return { objectId : target.id }; }, async DiscardRecovery () { calls.push (['discard']); return { discarded : true }; } };
        const registry = CreateAgentCommands ({ sessionEditor : editor });
        await registry.Invoke ('session.rename', { name : 'Carton review' }); await registry.Invoke ('object.user_data.delete', { objectId : 'object-1', name : 'SKU' }); await registry.Invoke ('session.recovery.discard', {});
        assert.deepEqual (calls, [['rename', 'Carton review'], ['user', 'object-1', 'SKU'], ['discard']]);
        await assert.rejects (registry.Invoke ('session.rename', { name : '' }));
    });
    it ('cancels a running macro without waiting behind it in the queue', async () => {
        const editor = { document : { objects : [] } }; const registry = CreateAgentCommands ({ sessionEditor : editor });
        let release; registry.Register ({ id : 'test.wait', mutates : false, inputSchema : { type : 'object', properties : {} } }, () => new Promise (resolve => { release = resolve; }));
        registry.Register ({ id : 'test.after', mutates : false, inputSchema : { type : 'object', properties : {} } }, () => 'ran');
        const running = registry.RunMacro ({ version : 1, steps : [{ id : 'wait', command : 'test.wait' }, { id : 'after', command : 'test.after' }] });
        await new Promise (resolve => setTimeout (resolve, 10));
        assert.deepEqual ((await registry.Execute ('macro.cancel', {})).result, { requested : true });
        release (); const result = await running; assert.equal (result.cancelled, true); assert.equal (result.completed.length, 1);
    });
});
