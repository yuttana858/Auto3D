import assert from 'node:assert/strict';
import { BindLiveNumber, RefreshLiveInput } from '../src/liveinput.js';

class Input extends EventTarget
{
    constructor () { super (); this.value = ''; this.dataset = {}; this.attributes = new Map (); this.isConnected = true; this.disabled = false; }
    setAttribute (key, value) { this.attributes.set (key, value); }
    removeAttribute (key) { this.attributes.delete (key); }
    type (text) { this.value = text; this.dispatchEvent (new Event ('input')); }
}
const wait = ms => new Promise (resolve => setTimeout (resolve, ms));

describe ('Primary Products live numeric fields', function () {
    it ('debounces typing and does not duplicate a completed edit on blur', async function () {
        const input = new Input (), values = [], field = BindLiveNumber (input, value => values.push (value), { delay : 10 });
        input.type ('2'); input.type ('22'); input.type ('220'); await wait (30);
        assert.deepEqual (values, [220]); input.dispatchEvent (new Event ('change')); input.dispatchEvent (new Event ('blur')); await field.flush ();
        assert.deepEqual (values, [220]); assert.equal (input.dataset.ppDirty, undefined); field.cancel ();
    });
    it ('keeps incomplete and invalid draft text without mutating the model', async function () {
        const input = new Input (), values = [], field = BindLiveNumber (input, value => values.push (value));
        for (const text of ['', '-', '2e']) { input.type (text); await field.flush (); assert.equal (input.value, text); }
        assert.deepEqual (values, []); assert.equal (input.dataset.ppDirty, 'true'); field.cancel ();
    });
    it ('flushes a valid edit on Enter before the debounce expires', async function () {
        const input = new Input (), values = [], field = BindLiveNumber (input, value => values.push (value));
        input.type ('22.75'); const event = new Event ('keydown'); Object.defineProperty (event, 'key', { value : 'Enter' }); input.dispatchEvent (event); await wait (0);
        assert.deepEqual (values, [22.75]); field.cancel ();
    });
    it ('does not apply a pending edit to a different product or unit system', async function () {
        const input = new Input (), values = []; let context = 'product-a:mm'; const field = BindLiveNumber (input, value => values.push (value), { context : () => context });
        input.type ('200'); context = 'product-b:mm'; await field.flush (); input.type ('210'); context = 'product-b:in'; await field.flush ();
        assert.deepEqual (values, []); field.cancel ();
    });
    it ('keeps newer text dirty when an earlier asynchronous edit completes', async function () {
        const input = new Input (); let finish; const field = BindLiveNumber (input, () => new Promise (resolve => { finish = resolve; }));
        input.type ('200'); const pending = field.flush (); input.type ('200.5'); finish (); await pending;
        assert.equal (input.value, '200.5'); assert.equal (input.dataset.ppDirty, 'true'); field.cancel ();
    });
    it ('preserves rejected values until corrected and reports validation errors', async function () {
        const input = new Input (), errors = [], field = BindLiveNumber (input, value => { if (value < 20) { throw new Error ('Height is too small.'); } }, { report : message => errors.push (message) });
        input.type ('2'); await field.flush (); assert.equal (input.value, '2'); assert.equal (input.attributes.get ('aria-invalid'), 'true'); assert.deepEqual (errors, ['Height is too small.']);
        input.type ('220'); await field.flush (); assert.equal (input.attributes.has ('aria-invalid'), false); assert.equal (input.dataset.ppDirty, undefined); field.cancel ();
    });
    it ('does not apply detached, disabled, or disposed field edits', async function () {
        const input = new Input (), values = [], field = BindLiveNumber (input, value => values.push (value));
        input.type ('200'); input.isConnected = false; await field.flush (); input.isConnected = true; input.type ('210'); input.disabled = true; await field.flush (); input.disabled = false; input.type ('220'); field.cancel (); await field.flush ();
        assert.deepEqual (values, []);
    });
    it ('refreshes unfocused valid fields and retains focused or invalid text', function () {
        const before = globalThis.document, input = new Input ();
        try {
            globalThis.document = { activeElement : input }; input.value = '200.'; RefreshLiveInput (input, 200); assert.equal (input.value, '200.');
            globalThis.document.activeElement = null; input.dataset.ppDirty = 'true'; RefreshLiveInput (input, 180); assert.equal (input.value, '200.');
            delete input.dataset.ppDirty; RefreshLiveInput (input, 180); assert.equal (input.value, '180');
            input.dataset.ppDirty = 'true'; RefreshLiveInput (input, 220, true); assert.equal (input.value, '220');
        } finally { if (before === undefined) { delete globalThis.document; } else { globalThis.document = before; } }
    });
    it ('reapplies a previously entered value after Undo or an external same-product update', async function () {
        const before = globalThis.document, input = new Input (), values = [], field = BindLiveNumber (input, value => values.push (value), { context : () => 'product-a:mm' });
        try {
            globalThis.document = { activeElement : null };
            input.type ('250'); await field.flush (); RefreshLiveInput (input, 200); assert.equal (input.value, '200');
            input.type ('250'); await field.flush (); assert.deepEqual (values, [250, 250]);
            input.dispatchEvent (new Event ('change')); input.dispatchEvent (new Event ('blur')); await field.flush (); assert.deepEqual (values, [250, 250]);
        } finally { field.cancel (); if (before === undefined) { delete globalThis.document; } else { globalThis.document = before; } }
    });
});
