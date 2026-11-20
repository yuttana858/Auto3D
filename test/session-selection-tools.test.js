import assert from 'node:assert/strict';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

function Fixture ()
{
    const objects = ['a', 'b', 'c'].map (id => ({ id, userData : {}, visible : true }));
    objects[0].userData = { _auto3dGroup : 'pair', _auto3dGroupKind : 'group' }; objects[1].userData = { ...objects[0].userData };
    const editor = Object.assign (Object.create (SessionEditor.prototype), { document : new SceneDocument (), history : new SceneHistory (), selectedIds : new Set (), selected : null, busy : false, readOnly : false });
    editor.document.objects = objects; editor.website = { sessionEditor : editor, auth : { user : { id : 'owner' } }, accountReady : true, preferences : { units : 'metric' } };
    editor.Select = function (object, fromNavigator, additive, single) { this.selected = object; assert.equal (additive, true); assert.equal (single, true); };
    return { editor, objects, commands : CreateAgentCommands (editor.website) };
}

describe ('Selection tools shared controls', () => {
    it ('replaces, adds and subtracts complete groups, or targets an explicit single member', () => {
        const { editor, objects : [a, b, c] } = Fixture ();
        assert.deepEqual (editor.SetSelection ([a]).selectedObjectIds, ['a', 'b']);
        assert.deepEqual (editor.SetSelection ([c], { mode : 'add' }).selectedObjectIds, ['a', 'b', 'c']);
        assert.deepEqual (editor.SetSelection ([b], { mode : 'subtract' }).selectedObjectIds, ['c']);
        assert.deepEqual (editor.SetSelection ([a], { expandGroups : false }).selectedObjectIds, ['a']);
        assert.deepEqual (editor.SetSelection ([]).selectedObjectIds, []); assert.equal (editor.selected, null);
    });
    it ('validates the entire selection before mutation and permits read-only selection', () => {
        const { editor, objects : [a, , c] } = Fixture (); editor.SetSelection ([c]);
        for (const [objects, options] of [[[a, { id : 'stale' }], {}], [[a], { mode : 'invalid' }], [[a], { expandGroups : 1 }], [[a], { primary : c }]]) {
            assert.throws (() => editor.SetSelection (objects, options)); assert.equal (editor.selected, c); assert.deepEqual ([...editor.selectedIds], ['c']);
        }
        editor.busy = true; assert.throws (() => editor.SetSelection ([a]), /Wait/); editor.busy = false;
        editor.readOnly = true; assert.deepEqual (editor.SetSelection ([a]).selectedObjectIds, ['a', 'b']);
    });
    it ('restores an exact active member without expanding a former group', () => {
        const { editor, objects : [a, b, c] } = Fixture ();
        editor.SetSelection ([a, c], { expandGroups : false, primary : a }); assert.equal (editor.selected, a);
        assert.deepEqual (editor.SetSelection ([b, c], { expandGroups : false, primary : b }).selectedObjectIds, ['b', 'c']); assert.equal (editor.selected, b);
    });
    it ('exposes strict selection and rectangle actions to shared commands', async () => {
        const { editor, commands } = Fixture (); let rectangle;
        editor.rectangleSelection = { Select : args => { rectangle = args; return { selectedObjectIds : ['a'] }; }, SetActive : active => ({ active }), Inspect : () => ({ active : false }) };
        assert.equal ((await commands.Execute ('selection.set', { objectIds : ['a'] })).ok, true); assert.deepEqual ([...editor.selectedIds], ['a', 'b']);
        assert.equal ((await commands.Execute ('selection.set', { objectIds : ['c', 'missing'] })).ok, false); assert.deepEqual ([...editor.selectedIds], ['a', 'b']);
        const args = { x1 : .1, y1 : .2, x2 : .7, y2 : .9, mode : 'subtract' };
        assert.equal ((await commands.Execute ('selection.rectangle', args)).ok, true); assert.deepEqual (rectangle, args);
        for (const invalid of [{ ...args, x1 : -1 }, { ...args, y2 : 2 }, { ...args, mode : 'toggle' }, { ...args, arbitrary : true }]) { assert.equal ((await commands.Execute ('selection.rectangle', invalid)).ok, false); }
        assert.equal ((await commands.Execute ('selection.rectangle.mode', { active : true })).result.active, true);
        assert.equal ((await commands.Execute ('selection.rectangle.inspect')).result.active, false);
        editor.readOnly = true; assert.equal ((await commands.Execute ('selection.set', { objectIds : ['c'] })).ok, true); assert.equal ((await commands.Execute ('object.array.ungroup')).ok, false);
    });
    it ('enables Group and the appropriate Ungroup actions for the current selection', () => {
        const { editor, objects : [a, b, c] } = Fixture (); editor.SetSelection ([c]);
        assert.equal (editor.ToolDisabled ('group'), true); assert.equal (editor.ToolDisabled ('ungroup'), true);
        editor.SetSelection ([a], { expandGroups : false }); assert.equal (editor.ToolDisabled ('group'), false); assert.equal (editor.ToolDisabled ('ungroup'), false); assert.equal (editor.ToolDisabled ('ungroup-array'), true);
        a.userData._auto3dGroupKind = b.userData._auto3dGroupKind = 'array'; assert.equal (editor.ToolDisabled ('ungroup-array'), false);
        editor.readOnly = true; assert.equal (editor.ToolDisabled ('group'), true); assert.equal (editor.ToolDisabled ('ungroup-array'), true); assert.equal (editor.ToolDisabled ('box-select'), false);
    });
    it ('routes Group/Ungroup shortcuts without intercepting text input', () => {
        const { editor } = Fixture (); const actions = []; editor.Run = action => action (); editor.GroupObjects = () => actions.push ('group'); editor.UngroupObjects = () => actions.push ('ungroup');
        const event = { key : 'g', ctrlKey : true, target : {}, preventDefault () {} };
        editor.KeyDown (event); editor.KeyDown ({ ...event, shiftKey : true });
        editor.KeyDown ({ ...event, target : { type : 'number', matches : () => true } });
        assert.deepEqual (actions, ['group', 'ungroup']);
    });
});
