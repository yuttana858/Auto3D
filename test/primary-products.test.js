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
    it ('exposes shape edits through strict commands/macros and rejects artwork conflicts atomically', async () => {
        const panel=Object.assign(Object.create(PrimaryProductsPanel.prototype),{website:{auth:{user:{id:'test'}},sessionEditor:{}},draft:DefaultProductDraft(),Refresh(){}}), commands=CreateAgentCommands({sessionEditor:{},primaryProductsPanel:panel});
        const shape={neckDiameterMm:24,shoulderHeightMm:30,neckHeightMm:20,capHeightMm:20};
        const macro=await commands.RunMacro({version:1,steps:[{id:'shape',command:'primary.configure',arguments:{bottleShape:shape}},{id:'read',command:'primary.inspect',arguments:{}}]}); assert.equal(macro.ok,true); assert.deepEqual(macro.completed[1].result.bottleShape,shape);
        assert.equal((await commands.Execute('primary.configure',{bottleShape:{...shape,extra:1}})).ok,false);
        panel.artwork={entries:[],Inspect:()=>[{resourceId:'a'.repeat(64),name:'Label',mime:'image/png',zone:'front',widthMm:40,heightMm:90}]}; const before=structuredClone(panel.draft);
        const failed=await commands.Execute('primary.configure',{bottleShape:{...shape,shoulderHeightMm:110}}); assert.equal(failed.ok,false); assert.match(failed.error.message,/fit/); assert.deepEqual(panel.draft,before);
    });
    it ('selects catalog drafts through macros, preserves fitting art and rejects conflicting or locked edits', async () => {
        const entries = [{ resourceId : 'a'.repeat (64), name : 'Label', mime : 'image/png', zone : 'front', widthMm : 30, heightMm : 50 }];
        const panel = Object.assign (Object.create (PrimaryProductsPanel.prototype), { website : { auth : { user : { id : 'test' } }, sessionEditor : {} }, draft : DefaultProductDraft (), artwork : { entries, Inspect : () => entries }, Refresh () {} });
        const commands = CreateAgentCommands ({ sessionEditor : {}, primaryProductsPanel : panel });
        assert.equal ((await commands.Execute ('primary.designs.list', { category : 'clamshell-food' })).result.length, 4);
        assert.equal ((await commands.Execute ('primary.designs.list', { category : 'unknown' })).ok, false);
        const macro = await commands.RunMacro ({ version : 1, steps : [{ id : 'choose', command : 'primary.designs.select', arguments : { id : 'household-round' } }, { id : 'read', command : 'primary.inspect', arguments : {} }] });
        assert.equal (macro.ok, true); assert.deepEqual (macro.completed[1].result.artwork, entries);
        const before = structuredClone (panel.draft);
        for (const id of ['sample-round', 'food-deli', 'missing']) { assert.equal ((await commands.Execute ('primary.designs.select', { id })).ok, false); assert.deepEqual (panel.draft, before); }
        panel.website.sessionEditor.readOnly = true; assert.equal ((await commands.Execute ('primary.designs.select', { id : 'round-care' })).ok, false); assert.deepEqual (panel.draft, before);
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
        editor.readOnly = false; host.draft.material = 'glass'; SessionEditor.prototype.RefreshButtons.call (editor); assert.equal (content.add.disabled, false); assert.equal (content.availability.textContent, '');
    });
});
