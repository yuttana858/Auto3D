import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { DefaultProductDraft } from '../modules/primary-products/src/state.js';
import { PrimaryProductsPanel } from '../source/website/primaryproductspanel.js';
describe ('Primary Products panel services', () => {
    it ('exposes opening, strict drafts and shared panel modes without scene generation', async () => {
        const panel = Object.assign (Object.create (PrimaryProductsPanel.prototype), { website : { auth : { user : { id : 'test' } }, sessionEditor : {} }, draft : DefaultProductDraft (), Refresh () {}, Open () { return { opened : true }; } });
        const website = { sessionEditor : {}, primaryProductsPanel : panel };
        const commands = CreateAgentCommands (website);
        assert.equal ((await commands.Execute ('ui.primary_products')).result.opened, true);
        assert.equal ((await commands.Execute ('primary.configure', { heightMm : 254 })).result.heightMm, 254);
        assert.equal ((await commands.Execute ('primary.configure', { heightMm : 0 })).ok, false);
        assert.equal ((await commands.Execute ('primary.configure', { material : 'aluminum' })).ok, false);
        const inspected = (await commands.Execute ('primary.inspect')).result; assert.equal (inspected.generationAvailable, true); assert.equal (inspected.heightMm, 254);
        panel.website.sessionEditor.readOnly = true; assert.equal ((await commands.Execute ('primary.reset')).ok, false); assert.equal (panel.Inspect ().heightMm, 254);
    });
    it ('keeps module source independent of the application and its assets lazy', () => {
        for (const name of ['index.js', 'state.js', 'panel.js']) { assert.doesNotMatch (readFileSync (new URL ('../modules/primary-products/src/' + name, import.meta.url), 'utf8'), /from ['"].*(source\/engine|source\/website)/); }
        const adapter = readFileSync (new URL ('../source/website/primaryproductspanel.js', import.meta.url), 'utf8'); assert.match (adapter, /await import/);
    });
});

describe ('Primary Products readiness lifecycle', function () {
    it ('re-enables Generate after editor rendering without reopening or changing the draft', async function () {
        const { SessionEditor } = await import ('../source/website/sessioneditor.js');
        const { PrimaryProductsPanel : Content } = await import ('../modules/primary-products/src/panel.js');
        const controls = [{ disabled : false }, { disabled : false }];
        const editor = { busy : true, readOnly : false, buttons : new Map () };
        const host = Object.assign (Object.create (PrimaryProductsPanel.prototype), { website : { sessionEditor : editor, auth : { user : { id : 'user' } }, accountReady : true }, draft : DefaultProductDraft () });
        const content = Object.assign (Object.create (Content.prototype), { host : { inspect : () => host.Inspect (), blocked : () => host.Blocked () }, root : { querySelectorAll : () => controls }, add : controls[0], apply : controls[1], availability : {} });
        host.workspace = content; editor.website = { primaryProductsPanel : host };
        SessionEditor.prototype.RefreshButtons.call (editor); assert.equal (content.add.disabled, true); assert.match (content.availability.textContent, /operation/);
        editor.busy = false; SessionEditor.prototype.RefreshButtons.call (editor); assert.equal (content.add.disabled, false); assert.equal (content.add.textContent, 'Generate'); assert.equal (content.availability.textContent, '');
        editor.readOnly = true; SessionEditor.prototype.RefreshButtons.call (editor); assert.equal (content.add.disabled, true); assert.match (content.availability.textContent, /editable/);
        editor.readOnly = false; host.draft.material = 'glass'; SessionEditor.prototype.RefreshButtons.call (editor); assert.equal (content.add.disabled, true); assert.match (content.availability.textContent, /Glass/);
    });
});
