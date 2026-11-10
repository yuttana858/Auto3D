import assert from 'node:assert/strict';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { CreateSessionArchive, OpenSessionArchive, PackSession } from '../source/website/sessionarchive.js';
function Editor () { const website = { preferences : { units : 'metric' }, auth : { user : { id : 'test' } }, accountReady : true }; const editor = { website, document : new SceneDocument (), history : new SceneHistory (), Render : async () => {}, Status : () => {} }; editor.packaging = new PackagingWorkspace (editor); website.sessionEditor = editor; return editor; }
describe ('CAD Apply and manufacturing line tools', function () {
    this.timeout (15000);
    it ('Applies custom board geometry to the same object and preserves animation, materials, archive and Undo', async () => {
        const e = Editor (); const p = e.packaging;
        const { pathId } = p.AddPath ([[0, 0], [100, 0], [100, 50], [0, 50]], 'cut', true, 'mm'); await p.Extrude (); const source = e.selected; e.document.model.materials.forEach (material => { material.color.r = 123; });
        source.position = [10, 20, 30]; source.userData.custom = 'keep';
        p.EditPath (pathId, { points : [[0, 0], [120.125, 0], [120.125, 50], [0, 50]] }, 'mm'); const draft = structuredClone (e.document.packaging);
        assert.notDeepEqual (source.packagingProfile, draft); const result = await p.ApplyCAD (); assert.equal (result.updated, true); assert.equal (result.state, 'flat'); assert.equal (e.document.objects.length, 1); assert.equal (e.selected.id, source.id); assert.deepEqual (e.selected.position, source.position); assert.equal (e.selected.userData.custom, 'keep'); assert.deepEqual (e.selected.packagingProfile, draft); assert.equal (e.document.CompactModel ([e.selected], true).materials.find (material => material.boardSurfaceRole === 'liner').color.r, 123);
        const reopened = OpenSessionArchive (CreateSessionArchive (PackSession (e.document))).document; assert.deepEqual (reopened.objects[0].packagingProfile, draft);
        await e.history.Undo (); assert.equal (e.selected, source); assert.deepEqual (e.document.packaging, draft); await e.history.Redo (); assert.deepEqual (e.selected.packagingProfile, draft);
    });
    it ('Keeps generated folding for manufacturing metadata, rejects unsupported edited folds and applies flat explicitly', async () => {
        const e = Editor (); const p = e.packaging; await p.GenerateFefco ({ length : 100, width : 80, height : 60 }); const id = e.selected.id;
        const score = e.document.packaging.paths.find (path => path.type === 'score'); p.SelectPath (score.id); p.SetCreaseProcess ({ kind : 'perforation', cutMm : 3, tieMm : 1 });
        await p.ApplyCAD (); assert.equal (e.selected.id, id); assert.equal (e.selected.userData._auto3dPackagingState, 'folded'); assert.match (p.Export ('svg').text, /PERFORATION/); assert.match (p.Export ('svg').text, /data-cut-mm="3"/); assert.match (p.Export ('dxf').text, /cut=3mm tie=1mm/);
        const cut = e.document.packaging.paths.find (path => path.type === 'cut'); const points = structuredClone (cut.points); points[0][0] -= 1; p.EditPath (cut.id, { points }, 'mm'); const source = e.selected;
        await assert.rejects (() => p.ApplyCAD (), /new fold rig/); assert.equal (e.selected, source); await p.ApplyCAD ('flat'); assert.equal (e.selected.id, id); assert.equal (e.selected.userData._auto3dPackagingState, 'flat'); assert.equal (e.selected.userData._auto3dFefco, undefined); assert.deepEqual (e.selected.packagingProfile, e.document.packaging);
    });
    it ('Uses additive selection and bulk assignment with strict agent schemas and one history step', async () => {
        const e = Editor (), p = e.packaging, r = CreateAgentCommands (e.website);
        const a = p.AddPath ([[0, 0], [10, 0]], 'score', false, 'mm').pathId, b = p.AddPath ([[0, 10], [10, 10]], 'score', false, 'mm').pathId;
        await r.Execute ('packaging.path.select', { id : a }); await r.Execute ('packaging.path.select', { id : b, additive : true }); assert.deepEqual (p.Inspect ().selectedPathIds, [a, b]);
        const before = e.history.undo.length; assert.equal ((await r.Execute ('packaging.paths.assign', { type : 'cut' })).ok, true); assert.equal (e.history.undo.length, before + 1); assert.ok (e.document.packaging.paths.every (path => path.type === 'cut')); await e.history.Undo (); assert.ok (e.document.packaging.paths.every (path => path.type === 'score'));
        assert.equal ((await r.Execute ('packaging.crease.configure', { kind : 'perforation', cutMm : 0, tieMm : 1 })).ok, false); assert.equal ((await r.Execute ('packaging.crease.configure', { kind : 'perforation', cutMm : 3 })).ok, false);
        assert.equal ((await r.Execute ('packaging.tool', { tool : 'pen' })).ok, true); p.AddDraftPoint ([1, 2], 'mm'); assert.equal ((await r.Execute ('packaging.tool', { tool : 'select' })).ok, false);
    });
    it ('Preserves independently chosen perforation cut and gap lengths in CAD exports and undo', async () => {
        const e = Editor (), p = e.packaging;
        const a = p.AddPath ([[0, 0], [50, 0]], 'score', false, 'mm').pathId;
        const b = p.AddPath ([[0, 10], [50, 10]], 'score', false, 'mm').pathId;
        p.SelectPath (a); p.SelectPath (b, true);
        const process = { kind : 'perforation', cutMm : 25.4 / 16, tieMm : 25.4 / 32 };
        p.SetCreaseProcess (process);
        for (const path of e.document.packaging.paths) { assert.deepEqual (path.process, process); }
        assert.match (p.Export ('svg').text, /data-cut-mm="1\.5875" data-tie-mm="0\.79375"/);
        assert.match (p.Export ('dxf').text, /cut=1\.5875mm tie=0\.79375mm/);
        await e.history.Undo (); assert.ok (e.document.packaging.paths.every (path => !path.process));
    });
    it ('Switches and mirrors the CAD face without mutating canonical geometry', async () => {
        const e = Editor (), p = e.packaging, registry = CreateAgentCommands (e.website); p.AddPath ([[10, 0], [30, 0]], 'score', false, 'mm'); const original = structuredClone (e.document.packaging); const initialView = { ...p.view };
        const result = await registry.Execute ('packaging.cad.face', { face : 'outside' }); assert.equal (result.ok, true); assert.equal (p.Inspect ().cadFace, 'outside'); assert.equal (p.view.x, -initialView.x - initialView.width); assert.deepEqual (e.document.packaging, original);
        p.SetCADFace ('inside'); assert.deepEqual (p.view, initialView); assert.throws (() => p.SetCADFace ('invalid'), /inside or outside/); assert.deepEqual (e.document.packaging, original);
    });
    it ('Rebuilds the selected model for flute direction and rejects unapplied CAD edits', async () => {
        const e = Editor (), p = e.packaging; await p.GenerateFefco ({ length : 100, width : 80, height : 60 }); const source = e.selected; const id = source.id;
        await p.UpdateBoardDirection (0); assert.equal (e.selected.id, id); assert.notEqual (e.selected, source); assert.equal (p.EngineeringInspect ().material.fluteDirectionDegrees, 0); assert.equal (e.selected.packagingProfile.engineering.materials.find (m => m.id === e.selected.packagingProfile.engineering.activeMaterialId).fluteDirectionDegrees, 0);
        await e.history.Undo (); assert.equal (e.selected, source); assert.equal (p.EngineeringInspect ().material.fluteDirectionDegrees, 90); await e.history.Redo ();
        p.SetName ('unapplied edit'); const current = e.selected; await assert.rejects (() => p.UpdateBoardDirection (45), /pending edits/); assert.equal (e.selected, current);
    });
    it ('Does not restore stale selection into a different session during asynchronous generation', async () => {
        const e = Editor (); await e.packaging.GenerateFefco ({ length : 100, width : 80, height : 60 }); e.packaging.SetName ('changed'); const old = e.document; const pending = e.packaging.ApplyCAD (); e.document = new SceneDocument (); e.selected = null; await assert.rejects (() => pending, /workspace or account changed/); assert.equal (e.selected, null); assert.equal (e.document.objects.length, 0); assert.equal (old.objects.length, 1); assert.equal (e.busy, false);
    });
    it ('Rolls back failed renders and rejects read-only, scaled or unfinished edits', async () => {
        const e = Editor (), p = e.packaging; await p.GenerateFefco ({ length : 100, width : 80, height : 60 }); const source = e.selected;
        p.SetName ('changed'); let calls = 0; e.Render = async () => { if (++calls === 1) { throw new Error ('render failed'); } };
        await assert.rejects (() => p.ApplyCAD (), /render failed/); assert.equal (e.selected, source); assert.equal (e.document.objects.length, 1); assert.equal (e.busy, false);
        e.readOnly = true; await assert.rejects (() => p.ApplyCAD (), /editable/); e.readOnly = false; e.selected.scale[0] = 2; await assert.rejects (() => p.ApplyCAD (), /scaling/); e.selected.scale[0] = 1; p.AddDraftPoint ([1, 2]); await assert.rejects (() => p.ApplyCAD (), /Finish/);
    });
});
