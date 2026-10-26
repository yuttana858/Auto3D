import { Blob } from 'node:buffer';
import assert from 'node:assert/strict';
import { AccountPreferenceState, Preferences, AppBuildInfo } from '../source/website/preferences.js';
import { Settings, CameraSettings } from '../source/website/settings.js';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { SceneDocument } from '../source/website/scenedocument.js';
import { PackSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
function editor (archive) {
    const storage = { accountId : 'a', GetRecovery : async () => ({ archive, updatedAt : 1 }), ClearRecovery : () => { throw new Error ('Checkpoint must be retained.'); } };
    const value = Object.assign (Object.create (SessionEditor.prototype), { website : { auth : { user : { id : 'a' } }, accountReady : true }, library : { deviceStorage : storage }, document : new SceneDocument (), busy : false, readOnly : false, Status : () => {}, MarkDirty : () => { value.dirty = true; }, OpenArchive : async buffer => { value.document = OpenSessionArchive (buffer).document; } }); return value;
}
describe ('Account viewport preferences and unsaved recovery', () => {
    let fetchBefore; let documentBefore;
    beforeEach (() => { fetchBefore = global.fetch; documentBefore = global.document; });
    afterEach (() => { global.fetch = fetchBefore; global.document = documentBefore; });
    it ('normalizes partial/invalid saved settings without retaining previous account values', () => {
        const a = AccountPreferenceState ({ theme : 2, units : 'standard', view : { backgroundPreset : 'light', backgroundColor : [1, 2, 3, 255], showGroundGrid : false } });
        assert.equal (a.settings.themeId, 2); assert.equal (a.settings.backgroundPreset, 'standard'); assert.equal (a.settings.showGroundGrid, false);
        const b = AccountPreferenceState ({ view : { backgroundPreset : 'bad', backgroundColor : [NaN, 2, 3, 255] } }); assert.equal (b.settings.themeId, 1); assert.equal (b.units, 'metric'); assert.equal (b.settings.backgroundPreset, 'standard');
    });
    it ('shares concurrent loads and commits the complete saved viewport before switching appearance', async () => {
        let finish; let calls = 0; let batch = 0;
        global.fetch = () => { calls++; return new Promise (resolve => { finish = resolve; }); };
        const prefs = Object.assign (Object.create (Preferences.prototype), { accountId : null, loadGeneration : 0, loading : null, applying : false });
        prefs.website = { auth : { user : { id : 'a' } }, settings : new Settings (2), cameraSettings : new CameraSettings (), sidebar : { detailsPanel : {}, UpdateControlsStatus : () => {} }, viewer : { BeginRenderBatch : () => batch++, EndRenderBatch : () => batch--, SetNavigationMode : () => {}, SetProjectionMode : () => {}, SetEdgeSettings : () => {} }, SwitchTheme : (theme, reset) => { assert.equal (batch, 1); assert.equal (theme, 2); assert.equal (reset, false); assert.equal (prefs.website.settings.backgroundPreset, 'outdoor'); }, UpdateEnvironmentMap : () => {}, UpdateViewport : () => {}, sessionEditor : { UnitsChanged : () => {}, library : { InitializeAccount : () => {} } } };
        prefs.website.cameraSettings.SaveToCookies = () => {};
        // Object.assign replaces only instance defaults; the prototype method is stubbed below.
        const original = CameraSettings.prototype.SaveToCookies; CameraSettings.prototype.SaveToCookies = () => {};
        try { const first = prefs.LoadAccount ('a'); assert.equal (first, prefs.LoadAccount ('a')); finish (Response.json ({ preferences : { theme : 2, view : { backgroundPreset : 'outdoor' } } })); await first; assert.equal (calls, 1); assert.equal (batch, 0); assert.equal (prefs.accountId, 'a'); } finally { CameraSettings.prototype.SaveToCookies = original; }
    });
    it ('Starts dark mode with a dark default while retaining custom, scenic and environment backgrounds', () => { assert.equal (AccountPreferenceState ({ theme : 2, view : { backgroundPreset : 'light' } }).settings.backgroundPreset, 'standard'); for (const preset of ['custom', 'sunset', 'outdoor']) { const state = AccountPreferenceState ({ theme : 2, view : { backgroundPreset : preset, backgroundColor : [255, 255, 255, 255] } }); assert.equal (state.settings.backgroundPreset, preset); assert.equal (state.settings.backgroundColor.r, 255); } assert.equal (AccountPreferenceState ({ theme : 2, view : { backgroundPreset : 'light', backgroundIsEnvMap : true } }).settings.backgroundPreset, 'light'); const cookies = new Settings (2); cookies.backgroundPreset = 'light'; cookies.AlignBackgroundWithTheme (); assert.equal (cookies.backgroundPreset, 'standard'); });
    it ('ignores a stale account load after explicit logout even if the same account signs in again', async () => {
        let finish; global.fetch = () => new Promise (resolve => { finish = resolve; });
        const prefs = Object.assign (Object.create (Preferences.prototype), { accountId : null, loadGeneration : 0, loading : null, website : { auth : { user : { id : 'a' } }, settings : {}, cameraSettings : {} } });
        const loaded = prefs.LoadAccount ('a'); prefs.LockAccount (); finish (Response.json ({ preferences : { theme : 2 } })); await assert.rejects (loaded, /Account changed/); assert.equal (prefs.accountId, null);
    });
    it ('validates recovery before mutation and retains the checkpoint after restore', async () => {
        const good = editor (new Blob ([CreateSessionArchive (PackSession (new SceneDocument ())) ]));
        assert.equal ((await good.InspectRecovery ()).valid, true); assert.deepEqual (await good.RestoreRecovery (), { recovered : true, objects : 0 }); assert.equal (good.dirty, true);
        const bad = editor (new Blob (['invalid zip'])); assert.equal ((await bad.InspectRecovery ()).valid, false); let mutated = false; bad.OpenArchive = () => { mutated = true; }; await assert.rejects (bad.RestoreRecovery ()); assert.equal (mutated, false);
    });
    it ('blocks recovery in occupied/read-only workspaces and across asynchronous account changes', async () => {
        const value = editor (new Blob (['invalid'])); value.readOnly = true; await assert.rejects (value.RestoreRecovery (), /editable/); value.readOnly = false; value.document.objects.push ({}); await assert.rejects (value.RestoreRecovery (), /Save and close/);
        value.document.objects = []; let finish; value.library.deviceStorage.GetRecovery = () => new Promise (resolve => { finish = resolve; }); const read = value.InspectRecovery (); value.website.auth.user.id = 'b'; finish ({ archive : new Blob (['invalid']) }); await assert.rejects (read, /same account/);
    });
    it ('exposes strict diagnostic and restore commands through shared services and macros', async () => {
        const value = editor (new Blob ([CreateSessionArchive (PackSession (new SceneDocument ())) ])); const commands = CreateAgentCommands ({ sessionEditor : value });
        assert.equal ((await commands.Execute ('session.recovery.inspect', {})).ok, true);
        assert.equal ((await commands.Execute ('session.recovery.restore', { arbitrary : true })).ok, false);
        const result = await commands.RunMacro ({ version : 1, steps : [{ id : 'restore', command : 'session.recovery.restore', arguments : {} }] }); assert.equal (result.ok, true, JSON.stringify (result));
        assert.equal (AppBuildInfo ().version, '0.37.4');
    });
});
