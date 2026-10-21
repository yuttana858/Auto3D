import assert from 'node:assert/strict';
import { ValidateTimelineActions, TimelineFoldSample } from '../source/website/timelineactions.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { PackSession, ReadSession } from '../source/website/sessionarchive.js';
const action = (id, time, direction = 'toggle', objectId = 'box') => ({ id, objectId, type : 'foldUnfold', time, duration : 2, direction });
describe ('Procedural fold action timeline', () => {
    it ('Evaluates toggles deterministically when seeking forwards and backwards', () => {
        const actions = ValidateTimelineActions ([action ('second', 4), action ('first', 1)]);
        assert.equal (TimelineFoldSample (actions, 'box', 0), null);
        for (const time of [2, 3, 6, 5, 2]) {
            const expected = { 2 : .5, 3 : 0, 5 : .5, 6 : 1 }[time];
            assert.ok (Math.abs (TimelineFoldSample (actions, 'box', time).pose - expected) < 1e-10);
        }
        assert.equal (TimelineFoldSample (actions, 'other', 6), null);
    });
    it ('Supports partial starting poses and optional camera settling holds', () => {
        const actions = [action ('unfold', 1, 'unfold')];
        assert.equal (TimelineFoldSample (actions, 'box', 1.1, .6).pose, .6);
        assert.ok (Math.abs (TimelineFoldSample (actions, 'box', 2, .6).pose - .3) < 1e-10);
        assert.ok (TimelineFoldSample (actions, 'box', 1.1, .6, false).pose < .6);
        assert.equal (TimelineFoldSample (actions, 'box', 3, .6).pose, 0);
    });
    it ('Rejects malformed, overlapping and excessive action spans before mutation', () => {
        for (const value of [null, [action ('a', -1)], [action ('a', 3600)], [action ('a', 1), action ('a', 4)], [action ('a', 1), action ('b', 2)], [{ ...action ('a', 1), surprise : true }]]) { assert.throws (() => ValidateTimelineActions (value)); }
        assert.equal (ValidateTimelineActions ([action ('a', 1), action ('b', 3), action ('c', 1, 'fold', 'other')]).length, 3);
    });
});

describe ('Fold Action editing and persistence', () => {
    const setup = () => {
        const object = { id : 'box', userData : { _auto3dFefco : '{}' }, keyframes : [] };
        const editor = { document : { objects : [object] }, selected : object, website : { auth : { user : { id : 'owner' } }, accountReady : true }, history : new SceneHistory (), AnimationUI : () => {}, MarkDirty : () => {}, packaging : { presentation : { Prepare : async () => {}, manual : new Map () } } };
        const timeline = new SessionTimeline (editor); timeline.Seek = time => { timeline.time = time; }; return { editor, timeline };
    };
    it ('Adds and deletes one reversible action, validates overlap and rejects read-only edits', async () => {
        const { editor, timeline } = setup ();
        const added = await timeline.AddAction ({ time : 1, duration : 2 }); assert.equal (timeline.actions.length, 1);
        await assert.rejects (() => timeline.AddAction ({ time : 2, duration : 2 }), /overlap/);
        await editor.history.Undo (); assert.equal (timeline.actions.length, 0); await editor.history.Redo (); assert.equal (timeline.actions.length, 1);
        timeline.DeleteAction (added.action.id); assert.equal (timeline.actions.length, 0); await editor.history.Undo (); assert.equal (timeline.actions.length, 1);
        editor.readOnly = true; await assert.rejects (() => timeline.AddAction (), /editable/); assert.throws (() => timeline.DeleteAction (added.action.id), /edited/);
        const restored = new SessionTimeline (editor); restored.Load (timeline.Serialize ()); assert.deepEqual (restored.actions, timeline.actions);
    });
    it ('Rejects account changes during asynchronous preparation before adding history', async () => {
        const { editor, timeline } = setup (); editor.packaging.presentation.Prepare = async () => { editor.website.auth.user.id = 'changed'; };
        await assert.rejects (() => timeline.AddAction (), /workspace changed/); assert.equal (timeline.actions.length, 0); assert.equal (editor.history.undo.length, 0);
    });
    it ('Rejects an archive action targeting a missing box', () => {
        const packed = PackSession (new SceneDocument (), { timeline : { actions : [] } }); packed.view.timeline.actions = [action ('missing', 1)];
        assert.throws (() => ReadSession (packed), /target/);
    });
});
