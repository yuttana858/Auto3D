import assert from 'node:assert/strict';
import { ViewportQuality } from '../source/engine/viewer/viewportquality.js';
import { AccountPreferenceState, Preferences } from '../source/website/preferences.js';
import { Preferences as ValidatePreferences } from '../functions/_lib/accountstorage.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

describe ('Display-only viewport quality', () => {
    it ('lowers Auto resolution during movement and restores it only after the latest movement', () => {
        const timers = new Map (); let id = 0; let draws = 0;
        const quality = new ViewportQuality ({ deviceRatio : () => 3, requestDraw : () => draws++, schedule : callback => { const key = ++id; timers.set (key, () => { timers.delete (key); callback (); }); return key; }, cancel : key => timers.delete (key) });
        assert.equal (quality.Ratio (), 2); quality.Interact (); assert.equal (quality.Ratio (), 1);
        quality.Interact (); assert.equal (timers.size, 1); timers.values ().next ().value ();
        assert.equal (quality.Ratio (), 2); assert.equal (quality.interacting, false); assert.equal (draws, 1);
        quality.Interact (); quality.SetMode ('quality'); assert.equal (timers.size, 0); assert.equal (quality.Ratio (), 3);
        quality.Interact (); assert.equal (timers.size, 0); quality.SetMode ('fast'); assert.equal (quality.Ratio (), 1);
    });
    it ('rejects invalid modes without changing state and handles missing/low display ratios', () => {
        const quality = new ViewportQuality ({ deviceRatio : () => NaN }); assert.equal (quality.Ratio (), 1);
        assert.throws (() => quality.SetMode ('invalid')); assert.equal (quality.mode, 'auto');
        quality.deviceRatio = () => 0.75; quality.SetMode ('fast'); assert.equal (quality.Ratio (), 0.75);
    });
    it ('defaults older accounts to Auto and validates persisted modes without accepting extra fields', () => {
        assert.equal (AccountPreferenceState ({ theme : 1 }).viewportQuality, 'auto');
        assert.equal (AccountPreferenceState ({ viewportQuality : 'fast' }).viewportQuality, 'fast');
        assert.equal (ValidatePreferences ({ units : 'metric', theme : 1, viewportQuality : 'quality' }).viewportQuality, 'quality');
        assert.throws (() => ValidatePreferences ({ units : 'metric', theme : 1, viewportQuality : 'invalid' }));
        assert.throws (() => ValidatePreferences ({ units : 'metric', theme : 1, viewportQuality : 'fast', apiKey : 'bad' }));
    });
    it ('uses one shared preference service for commands/macros without editing read-only model geometry', async () => {
        const quality = new ViewportQuality (); let saves = 0;
        const prefs = Object.assign (Object.create (Preferences.prototype), { website : { viewer : { viewportQuality : quality, SetViewportQuality : mode => quality.SetMode (mode) } }, SaveAccount : async () => { saves++; } });
        const commands = CreateAgentCommands ({ sessionEditor : { readOnly : true }, preferences : prefs, viewer : prefs.website.viewer });
        assert.equal ((await commands.Execute ('preferences.viewport.quality', { mode : 'invalid' })).ok, false); assert.equal (saves, 0);
        assert.equal ((await commands.Execute ('preferences.viewport.quality', { mode : 'fast', extra : true })).ok, false);
        const result = await commands.RunMacro ({ version : 1, steps : [{ id : 'quality', command : 'preferences.viewport.quality', arguments : { mode : 'fast' } }, { id : 'inspect', command : 'preferences.viewport.quality.inspect', arguments : {} }] });
        assert.equal (result.ok, true); assert.equal (quality.mode, 'fast'); assert.equal (saves, 1);
    });
});
