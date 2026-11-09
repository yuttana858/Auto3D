import assert from 'node:assert/strict';
import { StartLanding } from '../source/website/welcome.js';

describe ('Combined landing and sign-in page', () => {
    let originalDocument;
    beforeEach (() => { originalDocument = globalThis.document; });
    afterEach (() => { globalThis.document = originalDocument; });
    function setup ()
    {
        const version = {}, canvas = {}, children = [];
        const splash = { style : {}, attributes : {}, classes : new Set (), classList : { add (name) { splash.classes.add (name); } }, querySelector (selector) { return { '.splash_version' : version, canvas }[selector]; }, setAttribute (name, value) { this.attributes[name] = value; }, appendChild (node) { children.push (node); }, remove () { this.removed = (this.removed || 0) + 1; } };
        globalThis.document = { getElementById : () => splash, createElement : () => ({}) };
        let disposed = 0, fades = 0; let resolveFade;
        const landing = StartLanding ({ createScene : (target, animated) => { assert.equal (target, canvas); assert.equal (animated, true); return () => { disposed++; }; }, fade : () => { fades++; return new Promise (resolve => { resolveFade = resolve; }); } });
        return { landing, splash, version, children, disposed : () => disposed, fades : () => fades, finishFade : () => resolveFade () };
    }
    it ('shows the welcome scene with a sign-in host and no click-anywhere bypass', () => {
        const test = setup ();
        assert.match (test.version.textContent, /^v\d+\.\d+\.\d+$/); assert.equal (test.splash.attributes.role, 'region'); assert.ok (test.splash.classes.has ('splash_landing'));
        assert.equal (test.children.length, 1); assert.equal (test.landing.host, test.children[0]); assert.equal (test.landing.host.className, 'splash_signin');
        assert.equal (test.splash.tabIndex, undefined, 'the landing itself is not a continue button');
    });
    it ('dismisses once with a fade, disposing the scene and removing the landing', async () => {
        const test = setup (); const first = test.landing.Dismiss (), second = test.landing.Dismiss ();
        assert.equal (first, second); assert.equal (test.fades (), 1); assert.equal (test.splash.style.pointerEvents, 'none');
        test.finishFade (); await first; assert.equal (test.disposed (), 1); assert.equal (test.splash.removed, 1);
    });
    it ('returns null when the page has no landing', () => {
        globalThis.document = { getElementById : () => null }; assert.equal (StartLanding (), null);
    });
});
