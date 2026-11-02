import assert from 'node:assert/strict';
import { BrowserBridge } from '../agent-mcp/browser-bridge.js';

describe ('Browser agent bridge foundation', () => {
    function fixture () { let active = 'one', calls = 0; const website = { accountReady : true, auth : { user : { id : 'owner' } }, sessionEditor : { readOnly : false, sessions : { Inspect : () => ({ tabs : [{ id : 'one', name : 'First', active : active === 'one' }, { id : 'two', name : 'Second', active : active === 'two' }] }) } }, commands : { Execute : async command => { calls++; return { ok : true, command }; } } }; return { website, select : id => { active = id; }, calls : () => calls }; }
    it ('executes only allowed commands for the opted-in active session', async () => {
        const f = fixture (), bridge = new BrowserBridge ({ website : f.website, instanceId : 'window_1', windowLabel : 'Laptop' }); assert.equal (bridge.Connect ().windowLabel, 'Laptop'); bridge.SetWindowLabel ('Studio'); assert.equal (bridge.Describe ().windowLabel, 'Studio'); assert.throws (() => bridge.SetWindowLabel ('bad\nlabel')); const request = { requestId : 'r1', sessionId : 'one', command : 'scene.inspect', arguments : {} }; assert.equal ((await bridge.Execute (request)).ok, true); await assert.rejects (() => bridge.Execute (request), /Duplicate/); await assert.rejects (() => bridge.Execute ({ ...request, requestId : 'r2', command : 'object.delete' }), /unsupported/); f.select ('two'); await assert.rejects (() => bridge.Execute ({ ...request, requestId : 'r3' }), /not active/); assert.equal (f.calls (), 1);
    });
    it ('blocks access after account change or disconnect', async () => {
        const f = fixture (), bridge = new BrowserBridge ({ website : f.website, instanceId : 'window_1' }); bridge.Connect (); f.website.auth.user.id = 'other'; assert.throws (() => bridge.Describe (), /unavailable/); f.website.auth.user.id = 'owner'; bridge.Disconnect (); assert.throws (() => bridge.Describe (), /unavailable/);
    });
});
