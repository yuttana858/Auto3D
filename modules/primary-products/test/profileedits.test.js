import assert from 'node:assert/strict';
import { ProductProfileEditor } from '../src/profileeditor.js';
import { DefaultProductDraft, UpdateProductDraft } from '../src/state.js';
import { ProfileChanges } from '../src/profilechanges.js';
import { ContentPresets } from '../src/contents.js';

function Editor (changes = {})
{
    let draft = UpdateProductDraft (DefaultProductDraft (), changes), release;
    const gate = new Promise (resolve => { release = resolve; }), applied = [];
    const ui = Object.assign (Object.create (ProductProfileEditor.prototype), { status : {}, inputs : new Map (), SetDisabled () {}, Refresh (state) { this.state = state; } });
    ui.host = { inspect : () => ({ objectId : 'a', draft, units : 'metric' }), blocked : () => false, update : async patch => { if (!applied.length) { await gate; } draft = ProfileChanges (draft, patch); applied.push (patch); return {}; } };
    ui.state = ui.host.inspect (); return { ui, release, applied, draft : () => draft };
}

describe ('Queued product profile edits', function () {
    it ('preserves an in-flight fill height while later contents fields are coalesced', async function () {
        const e = Editor ({ contents : { type : 'liquid', fillPercent : 70, opacity : .2 } });
        const fill = e.ui.Commit ({ contents : { fillPercent : 80 } }); await Promise.resolve ();
        const opacity = e.ui.Commit ({ contents : { opacity : .4 } }), color = e.ui.Commit ({ contents : { color : '#bb6622' } });
        e.release (); assert.deepEqual (await Promise.all ([fill, opacity, color]), [true, true, true]);
        assert.equal (e.applied.length, 2); assert.equal (e.draft ().contents.fillPercent, 80); assert.equal (e.draft ().contents.opacity, .4); assert.equal (e.draft ().contents.color, '#bb6622');
    });
    it ('resolves queued optics against the latest accepted glass appearance', async function () {
        const e = Editor ({ optics : { color : '#aabbcc', opacity : .1, ior : 1.5, tintDistanceMm : 35 } });
        const ior = e.ui.Commit ({ optics : { ior : 1.8 } }); await Promise.resolve ();
        const opacity = e.ui.Commit ({ optics : { opacity : .2 } }), color = e.ui.Commit ({ optics : { color : '#bbaa77' } });
        e.release (); await Promise.all ([ior, opacity, color]);
        assert.deepEqual (e.draft ().optics, { color : '#bbaa77', opacity : .2, ior : 1.8, tintDistanceMm : 35 });
    });
    it ('keeps the visible material defaults when editing one optical property', async function () {
        const e = Editor ({ material : 'amberGlass' });
        const change = e.ui.Commit ({ optics : { opacity : .2 } }); e.release (); await change;
        assert.equal (e.draft ().optics.color, e.draft ().color); assert.equal (e.draft ().optics.ior, 1.5); assert.equal (e.draft ().optics.tintDistanceMm, 25);
    });
    it ('applies a new contents preset while retaining an explicitly queued fill height', async function () {
        const e = Editor ({ contents : { type : 'liquid', fillPercent : 70 } });
        const height = e.ui.Commit ({ heightMm : 220 }); await Promise.resolve ();
        const fill = e.ui.Commit ({ contents : { fillPercent : 80, opacity : .1 } }), type = e.ui.Commit ({ contents : { type : 'oil' } });
        e.release (); await Promise.all ([height, fill, type]);
        assert.equal (e.draft ().contents.type, 'oil'); assert.equal (e.draft ().contents.fillPercent, 80); assert.equal (e.draft ().contents.opacity, ContentPresets.oil.opacity); assert.equal (e.draft ().contents.color, ContentPresets.oil.color);
    });
    it ('keeps an explicit empty bottle when a delayed field edit follows it', async function () {
        const e = Editor ({ contents : { type : 'liquid', fillPercent : 70 } });
        const fill = e.ui.Commit ({ contents : { fillPercent : 80 } }); await Promise.resolve ();
        const clear = e.ui.Commit ({ contents : null }), staleOpacity = e.ui.Commit ({ contents : { opacity : .4 } });
        e.release (); await Promise.all ([fill, clear, staleOpacity]); assert.equal (e.draft ().contents, undefined);
    });
});
