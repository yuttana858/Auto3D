import assert from 'node:assert/strict';
import { ModulePanelState } from '../source/website/modulepanels.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
function State () { const state = new ModulePanelState (); for (const [id, side] of [['upload', 'left'], ['data', 'right'], ['ai', 'right'], ['packaging', 'right']]) { state.Register (id, side, id, id === 'upload' ? 'minimal' : 'closed'); } return state; }
describe ('Independent module panel modes', () => {
    it ('Retains each module mode when switching without sharing content state', () => {
        const state = State (); state.Set ('ai', 'extended'); state.Set ('packaging', 'minimal'); assert.equal (state.Inspect ('ai').visible, false); assert.equal (state.Inspect ('ai').mode, 'extended'); assert.equal (state.Inspect ('packaging').visible, true); state.Set ('ai', 'extended'); assert.equal (state.Inspect ('packaging').visible, false); assert.equal (state.Inspect ('ai').visible, true); state.Set ('ai', 'closed'); assert.equal (state.modules.get ('ai').preferred, 'extended'); assert.equal (state.Inspect ('upload').visible, true);
    });
    it ('Rejects bad modules, modes and duplicate registrations without changing the active panel', () => {
        const state = State (); const before = JSON.stringify ([...state.modules]); assert.throws (() => state.Set ('missing', 'extended')); assert.throws (() => state.Set ('ai', 'fullscreen')); assert.throws (() => state.Register ('ai', 'left', 'Duplicate')); assert.equal (JSON.stringify ([...state.modules]), before); assert.equal (state.active.right, 'data');
    });
    it ('Routes UI commands and the legacy Packaging alias to independent shared services', async () => {
        const state = State (); const calls = []; const website = { sessionEditor : {}, modulePanels : { Set : async (id, mode) => { calls.push ([id, mode]); return state.Set (id, mode); }, Inspect : () => [...state.modules.keys ()].map (id => state.Inspect (id)) }, packagingPanel : { Open : () => { calls.push (['packaging', 'open']); return { opened : true }; } }, aiWorkspace : { Open : () => { calls.push (['ai', 'open']); return { opened : true }; } } }; const registry = CreateAgentCommands (website);
        assert.equal ((await registry.Execute ('ui.module.mode', { module : 'packaging', mode : 'extended' })).ok, true); assert.equal ((await registry.Execute ('ui.module.mode', { module : 'packaging', mode : 'unknown' })).ok, false); assert.equal ((await registry.Execute ('ui.module.mode', { module : 'ai', mode : 'minimal', extra : true })).ok, false); assert.equal ((await registry.Execute ('ui.packaging')).ok, true); assert.equal ((await registry.Execute ('ui.ai.packaging')).ok, true); assert.equal ((await registry.Execute ('ui.ai')).ok, true); assert.deepEqual (calls, [['packaging', 'extended'], ['packaging', 'open'], ['packaging', 'open'], ['ai', 'open']]); assert.equal ((await registry.Execute ('ui.modules.inspect')).result.panels.length, 4);
    });
});
