import assert from 'node:assert/strict';
import { StartWelcomeSequence } from '../source/website/welcome.js';

describe ('Startup welcome gate', () => {
    let originalDocument;
    beforeEach (() => { originalDocument = globalThis.document; });
    afterEach (() => { globalThis.document = originalDocument; });
    function setup ()
    {
        const handlers = {}; const version = {}, identity = { appendChild (node) { this.hint = node; } }, canvas = {};
        const splash = { style : {}, attributes : {}, querySelector (selector) { return { '.splash_version' : version, '.splash_identity' : identity, canvas }[selector]; }, setAttribute (name, value) { this.attributes[name] = value; }, addEventListener (name, handler) { handlers[name] = handler; }, focus () { this.focused = true; }, remove () { this.removed = true; } };
        globalThis.document = { getElementById : () => splash, createElement : () => ({}) };
        let entered = 0, disposed = 0; let resolveFade;
        const fade = () => new Promise (resolve => { resolveFade = resolve; });
        StartWelcomeSequence (() => { entered++; }, { createScene : (target, animated) => { assert.equal (target, canvas); assert.equal (animated, true); return () => { disposed++; }; }, fade });
        return { splash, handlers, identity, entered : () => entered, disposed : () => disposed, finishFade : () => resolveFade () };
    }
    it ('waits for a click before opening authentication and disposes the scene once', async () => {
        const test = setup (); assert.equal (test.entered (), 0); assert.equal (test.splash.attributes.role, 'button'); assert.equal (test.identity.hint.textContent, 'Click anywhere to continue');
        const first = test.handlers.click ({}); test.handlers.click ({}); assert.equal (test.entered (), 0); test.finishFade (); await first;
        assert.equal (test.entered (), 1); assert.equal (test.disposed (), 1); assert.equal (test.splash.removed, true);
    });
    it ('supports keyboard activation and handles a missing splash', async () => {
        const test = setup (); let prevented = false; test.handlers.keydown ({ key : ' ', preventDefault () { prevented = true; } }); test.finishFade (); await Promise.resolve (); await Promise.resolve ();
        assert.equal (prevented, true); assert.equal (test.entered (), 1);
        globalThis.document = { getElementById : () => null }; let continued = false; StartWelcomeSequence (() => { continued = true; }); assert.equal (continued, true);
    });
});
