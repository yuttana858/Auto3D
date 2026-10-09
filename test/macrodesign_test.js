import assert from 'node:assert/strict';
import { EditMacro, StepSummary, CommandGroup } from '../source/website/macrodesign.js';

describe ('Visual macro design', () => {
    it ('preserves references and IDs while reordering without changing the original', () => {
        const original = { version : 1, steps : [{ id : 'step1', command : 'object.duplicate', arguments : {} }, { id : 'step2', command : 'object.transform', arguments : { objectId : { $ref : 'step1.id' } } }] };
        const moved = EditMacro (original, 'move', original.steps[1], 0);
        assert.equal (moved.steps[0].id, 'step2'); assert.deepEqual (moved.steps[0].arguments.objectId, { $ref : 'step1.id' }); assert.equal (original.steps[0].id, 'step1');
        const added = EditMacro (moved, 'add', { command : 'scene.inspect', arguments : {} }); assert.equal (added.steps[2].id, 'step3');
        assert.equal (EditMacro (added, 'remove', added.steps[1]).steps.length, 2);
        assert.throws (() => EditMacro (original, 'move', original.steps[0], 5));
    });
    it ('explains arrays, placement and adding saved models without code', () => {
        assert.equal (StepSummary ({ id : 'object.array' }, { width : 2, length : 3, height : 6 }), 'Array (2 W × 3 L × 6 H)');
        assert.equal (StepSummary ({ id : 'object.transform' }, { position : [1, 2, 3] }), 'Move (1, 2, 3)');
        assert.equal (StepSummary ({ id : 'library.account.open' }, { append : true }), 'Add saved model to scene');
        assert.equal (CommandGroup ({ id : 'animation.embedded.playback' }), 'Imported clips');
    });
});
