import assert from 'node:assert/strict';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { CreateSessionArchive, OpenSessionArchive, PackSession } from '../source/website/sessionarchive.js';
import { onRequestGet } from '../functions/api/knowledge/paper-packaging.js';
function Editor () { const website = { preferences : { units : 'metric' }, auth : { user : { id : 'test' } }, accountReady : true }; const editor = { website, document : new SceneDocument (), history : new SceneHistory (), Render : async () => {}, Status : () => {} }; editor.packaging = new PackagingWorkspace (editor); website.sessionEditor = editor; return editor; }
describe ('Packaging Measurement layer integration', () => {
    it ('Rebuilds exact CAD for per-axis manual and parametric targets, preserving identity, archive and Undo', async () => {
        const e = Editor (); await e.packaging.GenerateFefco ({ thickness : 4 }); const id = e.selected.id; const r = CreateAgentCommands (e.website);
        const call = async (id, args) => { const result = await r.Execute (id, args); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
        await call ('packaging.measurements.update', { id : 'length', mode : 'parametric', basis : 'inside', targetMm : 400.123456789, toleranceMm : 1.5 });
        await call ('packaging.measurements.update', { id : 'width', mode : 'manual', basis : 'score', targetMm : 301.125 });
        const oldWidth = e.packaging.EngineeringInspect ().dimensions[1].scoreMm;
        await call ('packaging.materials.update', { caliperMm : 5, caliperToleranceMm : 0.2, processToleranceMm : 0.25 });
        const report = await call ('packaging.measurements.inspect'); assert.equal (report.dimensions[0].valueMm, 400.123456789); assert.equal (report.dimensions[0].scoreMm, 405.123456789); assert.equal (report.dimensions[0].toleranceMm, 1.95); assert.equal (report.dimensions[1].scoreMm, oldWidth); assert.equal (e.selected.id, id);
        assert.equal (JSON.parse (e.selected.userData._auto3dFefco).length, 405.123456789); assert.deepEqual (e.document.packaging, e.selected.packagingProfile);
        const reopened = OpenSessionArchive (CreateSessionArchive (PackSession (e.document))).document; assert.deepEqual (reopened.packaging.engineering, report.state); assert.deepEqual (reopened.objects[0].packagingProfile.engineering, report.state);
        await e.history.Undo (); assert.equal (e.packaging.EngineeringInspect ().material.caliperMm, 4); await e.history.Redo (); assert.equal (e.packaging.EngineeringInspect ().dimensions[0].valueMm, 400.123456789);
        await call ('packaging.materials.duplicate', { id : 'supplier-b' }); await call ('packaging.materials.update', { name : 'Supplier B' }); await call ('packaging.materials.activate', { id : 'board-custom' }); assert.equal (e.packaging.EngineeringInspect ().state.materials.length, 2);
        const macro = await r.RunMacro ({ version : 1, steps : [{ id : 'visible', command : 'packaging.measurements.visible', arguments : { visible : false } }, { id : 'report', command : 'packaging.measurements.inspect', arguments : {} }] }); assert.equal (macro.ok, true); assert.equal (e.packaging.EngineeringInspect ().state.visible, false);
    });
    it ('Rejects bad inputs, scaling and readonly mutations before changing any geometry or records', async () => {
        const e = Editor (); await e.packaging.GenerateFefco (); const registry = CreateAgentCommands (e.website); const before = JSON.stringify (e.document.packaging); const history = e.history.undo.length;
        for (const [id, args] of [['packaging.materials.update', { caliperMm : -1 }], ['packaging.materials.update', { insideFactors : [1, 2] }], ['packaging.measurements.update', { id : 'missing', mode : 'parametric', targetMm : 400 }], ['packaging.measurements.update', { id : 'length', targetMm : 1, mode : 'parametric' }], ['packaging.materials.update', { arbitrary : true }], ['packaging.measurements.update', { id : 'length', mode : 'manual', basis : 'outside', targetMm : 450 }]]) { assert.equal ((await registry.Execute (id, args)).ok, false); }
        e.selected.scale = [2, 1, 1]; assert.equal ((await registry.Execute ('packaging.measurements.visible', { visible : false })).ok, false); e.selected.scale = [1, 1, 1]; e.readOnly = true; assert.equal ((await registry.Execute ('packaging.materials.update', { caliperMm : 4 })).ok, false); assert.equal ((await registry.Execute ('packaging.measurements.inspect')).ok, true); assert.equal (JSON.stringify (e.document.packaging), before); assert.equal (e.history.undo.length, history);
    });
    it ('Updates selected custom board geometry and keeps low/high-caliper CAD profiles measurable', async () => {
        const e = Editor (); e.packaging.AddPath ([[0, 0], [100, 0], [100, 50], [0, 50]], 'cut', true, 'mm'); await e.packaging.Extrude (); const id = e.selected.id;
        const report = await e.packaging.UpdateEngineering ({ dimension : { id : e.document.packaging.paths[0].id + ':0', mode : 'manual', targetMm : 120.125 } }); assert.equal (report.dimensions[0].scoreMm, 120.125); assert.equal (e.selected.id, id); assert.deepEqual (e.selected.packagingProfile, e.document.packaging); assert.equal (e.selected.userData._auto3dFefco, undefined);
        for (const thickness of [0.1, 100]) { const p = { ...e.document.packaging, thickness }; delete p.engineering; e.document.packaging = p; assert.equal (e.packaging.EngineeringInspect ().material.caliperMm, thickness); }
    });
    it ('Restores source and CAD after a failed scene render', async () => {
        const e = Editor (); await e.packaging.GenerateFefco (); const source = e.selected; const before = structuredClone (e.document.packaging); let calls = 0; e.Render = async () => { if (++calls === 1) { throw new Error ('render failed'); } };
        await assert.rejects (() => e.packaging.UpdateEngineering ({ dimension : { id : 'length', mode : 'manual', targetMm : 450 } }), /render failed/); assert.equal (e.selected, source); assert.deepEqual (e.document.packaging, before); assert.equal (e.busy, false); assert.equal (e.document.objects.length, 1);
    });
    it ('Makes engineering guidance, formulas and scoped standards searchable through the existing API', async () => {
        const section = await (await onRequestGet ({ request : new Request ('https://example.test/api/knowledge/paper-packaging?section=dimensionalEngineering') })).json (); assert.equal (section.data.formulas[2].id, 'fefco-101'); assert.match (section.data.rscToleranceReference.scope, /Non-normative/);
        const results = await (await onRequestGet ({ request : new Request ('https://example.test/api/knowledge/paper-packaging?q=crease+tolerance+inside+loss') })).json (); assert.ok (results.results.some (r => r.type === 'dimensional-engineering' || r.type === 'dimensional-formula'));
    });
});
