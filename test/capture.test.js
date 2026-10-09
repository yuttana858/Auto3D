import assert from 'node:assert/strict';
import { Viewer } from '../source/engine/viewer/viewer.js';
import { CaptureApp, CaptureAllowed, CaptureFilter, CaptureSummary } from '../source/website/agentcapture.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { CaptureForChat } from '../tools/agent_capture.mjs';
const png = 'data:image/png;base64,iVBORw0KGgo=';
function Website () { const website = { auth : { user : { id : 'user' } }, accountReady : true, viewer : { GetImageSize : () => ({ width : 2400, height : 1200 }), GetImageAsDataUrl : () => png }, sessionEditor : {} }; website.sessionEditor.website = website; return website; }
describe ('Agent image capture', () => {
    it ('restores rendering state after an image export failure', () => {
        const previous = globalThis.window; globalThis.window = { devicePixelRatio : 2 };
        const restored = []; let alpha = 1; const background = {}; const viewer = {
            GetImageSize : () => ({ width : 600, height : 400 }), scene : { background },
            renderer : { getClearAlpha : () => alpha, setClearAlpha : (value) => { alpha = value; }, domElement : { toDataURL : () => { throw new Error ('tainted'); } } },
            ResizeRenderer : (width, height) => restored.push ([width, height]), Render : () => {}
        };
        try { assert.throws (() => Viewer.prototype.GetImageAsDataUrl.call (viewer, 800, 600, true), /tainted/); assert.equal (alpha, 1); assert.equal (viewer.scene.background, background); assert.deepEqual (restored.at (-1), [600, 400]); }
        finally { if (previous === undefined) { delete globalThis.window; } else { globalThis.window = previous; } }
    });
    it ('returns bounded PNG image content through commands and macros', async () => {
        const website = Website (); const registry = CreateAgentCommands (website);
        const captured = await registry.Execute ('capture.image', { scope : 'viewport', maxSize : 800 });
        assert.equal (captured.ok, true); assert.equal (captured.result.width, 800); assert.equal (captured.result.height, 400);
        assert.deepEqual (captured.result.content, [{ type : 'image', mimeType : 'image/png', data : 'iVBORw0KGgo=' }]);
        const macro = await registry.RunMacro ({ version : 1, steps : [{ id : 'capture', command : 'capture.image', arguments : { scope : 'viewport' } }] }); assert.equal (macro.ok, true);
        for (const args of [{ maxSize : 800.5 }, { maxSize : 4096 }, { scope : 'desktop' }, { token : 'secret' }]) { assert.equal ((await registry.Execute ('capture.image', args)).ok, false); }
    });
    it ('denies logout, recovery and account changes during capture', async () => {
        const website = Website (); website.auth.loggedOut = true; assert.throws (() => CaptureAllowed (website), /Sign in/); website.auth.loggedOut = false;
        website.authPanel = { recovery : {} }; assert.throws (() => CaptureAllowed (website), /recovery/); website.authPanel = null;
        website.viewer.GetImageAsDataUrl = () => { website.auth.user.id = 'other'; return png; }; await assert.rejects (CaptureApp (website), /Account changed/);
        website.auth.user = null; assert.equal ((await CreateAgentCommands (website).Execute ('capture.image')).ok, false);
    });
    it ('filters credentials, including passwords shown as text, and hides image text payloads', () => {
        let selector; assert.equal (CaptureFilter ({ nodeType : 1, matches : (value) => { selector = value; return true; } }), false);
        assert.ok (selector.includes ('.password_input')); assert.ok (selector.includes ('Account administration')); assert.ok (selector.includes ('input')); assert.ok (selector.includes ('textarea')); assert.ok (selector.includes ('data-capture-preview'));
        assert.equal (CaptureFilter ({ nodeType : 3 }), true); assert.ok (!CaptureSummary ({ content : [{ data : 'x'.repeat (2000) }] }).includes ('x'.repeat (2000)));
    });
    it ('hands images to chat tools without a text/base64 dump and propagates auth errors', async () => {
        const result = await CaptureForChat ({ evaluate : async () => ({ ok : true, result : { mimeType : 'image/png', content : [{ type : 'image', mimeType : 'image/png', data : 'test' }], scope : 'viewport', width : 10, height : 5 } }) }); assert.equal (result.content[0].type, 'image');
        await assert.rejects (CaptureForChat ({ evaluate : async () => ({ ok : false, error : { message : 'Sign in' } }) }), /Sign in/);
    });
});
