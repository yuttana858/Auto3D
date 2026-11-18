import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ArrayRevealSample } from '../source/website/arrayreveal.js';
import { ScheduleArrayReveal } from '../source/website/timelinearray.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { CommandRegistry } from '../source/website/commandregistry.js';

describe ('Scheduled array reveal', () => {
    function fixture () {
        const objects = [0, 1, 2].map (i => ({ id : 'copy' + i, name : 'Copy ' + i, visible : true, threeObject : new THREE.Object3D (), position : [i, 0, 0], rotation : [0, 0, 0], scale : [1, 1, 1], keyframes : [] }));
        const document = { objects, ApplyTransform : () => {} }, viewer = { navigation : {}, UpdateGroundGrid : () => {}, Render : () => {} }; const editor = { document, website : { auth : { user : { id : 'user' } }, accountReady : true, viewer }, history : { Push : value => { editor.undo = value; } }, MarkDirty : () => {}, AnimationUI : () => {}, UpdateSelectionBox : () => {}, SyncInputs : () => {}, readOnly : false, busy : false }; editor.timeline = new SessionTimeline (editor); return { editor, objects };
    }
    it ('reproduces the staggered drop without creating or removing models, and supports undo', () => {
        const { editor, objects } = fixture (); ScheduleArrayReveal (editor, { objectIds : objects.map (o => o.id), time : 1, duration : 4, dropHeight : 2 });
        for (const progress of [0, .1, .3, .7, 1]) { editor.timeline.Seek (1 + 4 * progress, false); for (let i = 0; i < objects.length; i++) { const sample = ArrayRevealSample (i, objects.length, progress); assert.equal (objects[i].threeObject.visible, sample.visible); assert.ok (Math.abs (objects[i].position[1] - sample.offset * 2) < 1e-6); } }
        assert.equal (editor.document.objects.length, 3); editor.undo.undo (); assert.ok (objects.every (o => o.keyframes.length === 0 && o.visibilityKeys.length === 0 && o.position[1] === 0)); editor.undo.redo (); assert.ok (objects.every (o => o.keyframes.length === 3));
    });
    it ('rejects existing tracks or invalid targets without partial edits', () => { const { editor, objects } = fixture (); objects[1].keyframes = [{ time : 0 }]; assert.throws (() => ScheduleArrayReveal (editor, { objectIds : objects.map (o => o.id) }), /existing/); assert.equal (objects[0].keyframes.length, 0); assert.throws (() => ScheduleArrayReveal (editor, { objectIds : ['missing'] }), /visible/); });
    it ('rolls back new tracks if timeline evaluation fails', () => { const { editor, objects } = fixture (); editor.timeline.Seek = () => { throw new Error ('Render failed'); }; assert.throws (() => ScheduleArrayReveal (editor, { objectIds : objects.map (item => item.id) }), /Render failed/); assert.ok (objects.every (item => item.keyframes.length === 0 && item.visibilityKeys.length === 0 && item.position[1] === 0)); });
    it ('accepts created object IDs from a previous macro step', async () => { const { editor, objects } = fixture (); const registry = new CommandRegistry (editor), schema = { type : 'object', properties : {}, required : [] }; registry.Register ({ id : 'create', inputSchema : schema, mutates : true }, () => ({ objectIds : objects.map (o => o.id) })); registry.Register ({ id : 'schedule', inputSchema : { type : 'object', properties : { objectIds : { type : 'array', items : { type : 'string' } } }, required : ['objectIds'] }, mutates : true }, args => ScheduleArrayReveal (editor, args)); const result = await registry.RunMacro ({ version : 1, steps : [{ id : 'make', command : 'create' }, { id : 'animate', command : 'schedule', arguments : { objectIds : { $ref : 'make.objectIds' } } }] }); assert.equal (result.ok, true, JSON.stringify (result)); assert.equal (result.completed[1].result.objects, 3); });
});
