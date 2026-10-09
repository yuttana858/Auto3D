import assert from 'node:assert/strict';
import { NewPackagingDesign, ValidatePackaging, PackagingContours, CreatePackagingModel, ExportPackagingSVG, ExportPackagingDXF } from '../source/website/packagingcore.js';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { PackSession, ReadSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { CreateRecoveryArchive } from '../source/website/sessionrecoverypack.js';
import { CalculateVolume } from '../source/engine/model/quantities.js';
import { IsTwoManifold } from '../source/engine/model/modelutils.js';
import { Unit } from '../source/engine/model/unit.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
const path = (id, points, type = 'cut', closed = true) => ({ id, points, type, closed });
const design = () => ({ ...NewPackagingDesign (), paths : [path ('outer', [[0, 0], [100, 0], [100, 60], [0, 60]]), path ('crease', [[50, 0], [50, 60]], 'score', false)] });
function editor () { const website = { preferences : { units : 'metric' }, auth : { user : { id : 'test' } }, accountReady : true }; const editor = { website, document : new SceneDocument (), history : new SceneHistory (), Render : async () => {}, Status : () => {}, Download : () => {} }; editor.packaging = new PackagingWorkspace (editor); website.sessionEditor = editor; return editor; }
describe ('Packaging profiles', () => {
    it ('Creates watertight board thickness along Y and converts canonical mm into declared scene units', () => {
        for (const [unit, factor] of [[Unit.Millimeter, 1], [Unit.Inch, 25.4], [Unit.Meter, 1000]]) {
            const model = CreatePackagingModel (design (), unit);
            let volume = 0; model.EnumerateMeshInstances ((mesh) => { assert.ok (IsTwoManifold (mesh)); volume += Math.abs (CalculateVolume (mesh)); });
            assert.ok (Math.abs (volume - 18000 / factor ** 3) < 0.001); let minY = Infinity; let maxY = -Infinity; model.EnumerateVertices ((p) => { minY = Math.min (minY, p.y); maxY = Math.max (maxY, p.y); }); assert.equal (maxY - minY, 3 / factor);
        }
    });
    it ('Extrudes holes and disjoint blanks with even/odd containment', () => {
        const data = design (); data.paths.push (path ('hole', [[10, 10], [20, 10], [20, 20], [10, 20]]), path ('second', [[150, 0], [160, 0], [160, 10], [150, 10]]));
        assert.equal (PackagingContours (data).length, 2); let volume = 0; CreatePackagingModel (data).EnumerateMeshInstances ((mesh) => { assert.ok (IsTwoManifold (mesh)); volume += Math.abs (CalculateVolume (mesh)); }); assert.ok (Math.abs (volume - 18000) < 0.01);
    });
    it ('Rejects malformed geometry before extrusion and preserves the input', () => {
        const data = design (); data.paths[0].points = [[0, 0], [100, 60], [100, 0], [0, 60]]; assert.throws (() => CreatePackagingModel (data), /cross/);
        data.paths[0].closed = false; assert.throws (() => CreatePackagingModel (data), /closed/);
        const overlap = design (); overlap.paths.push (path ('touch', [[0, 0], [10, 0], [10, 10], [0, 10]])); assert.throws (() => CreatePackagingModel (overlap), /intersect|touch/);
        assert.throws (() => ValidatePackaging ({ ...design (), thickness : NaN })); const repeated = design (); repeated.paths[0].points[1] = [0, 0]; assert.throws (() => ValidatePackaging (repeated), /distinct/);
        assert.throws (() => CreatePackagingModel (design (), Unit.Unknown), /known/);
    });
    it ('Exports physical millimeter vectors in separate cut/score layers with closure preserved', () => {
        const svg = ExportPackagingSVG (design ()); assert.match (svg, /width="100mm" height="60mm"/); assert.match (svg, /id="CUT"/); assert.match (svg, /id="SCORE"/); assert.match (svg, /stroke-dasharray/); assert.match (svg, /L0 60 Z/);
        const dxf = ExportPackagingDXF (design ()); assert.match (dxf, /\$INSUNITS\r\n70\r\n4/); assert.match (dxf, /8\r\nCUT/); assert.match (dxf, /8\r\nSCORE/); assert.match (dxf, /90\r\n4\r\n70\r\n1/); assert.match (dxf, /90\r\n2\r\n70\r\n0/);
    });
    it ('Round-trips editable design and board profile through session, model and worker archives', () => {
        const doc = new SceneDocument (); doc.packaging = design (); const board = doc.AddImported (CreatePackagingModel (doc.packaging), 'Board'); board.packagingProfile = doc.packaging;
        for (const archive of [CreateSessionArchive (PackSession (doc)), CreateRecoveryArchive (RecoverySnapshot (doc, {}))]) { const saved = OpenSessionArchive (archive).document; assert.deepEqual (saved.packaging, design ()); assert.deepEqual (saved.objects[0].packagingProfile, design ()); }
        const portable = ReadSession (PackSession (doc, {}, [board], 'model')).document; assert.equal (portable.packaging, null); assert.deepEqual (portable.objects[0].packagingProfile, design ());
        const empty = new SceneDocument (); empty.packaging = design (); assert.deepEqual (ReadSession (PackSession (empty)).document.packaging, design ());
    });
    it ('Shares UI/command mutations, handles inches, undo and strict invalid schemas', async () => {
        const e = editor (); const commands = CreateAgentCommands (e.website); e.website.preferences.units = 'standard';
        const added = await commands.Execute ('packaging.path.add', { points : [[0, 0], [4, 0], [4, 2], [0, 2]], type : 'cut', closed : true }); assert.equal (added.ok, true); assert.equal (e.document.packaging.paths[0].points[1][0], 101.6);
        const board = await commands.Execute ('packaging.board', { thickness : 0.125 }); assert.equal (board.ok, true); assert.equal (e.document.packaging.thickness, 3.175);
        await e.history.Undo (); assert.equal (e.document.packaging.thickness, 3); await e.history.Redo (); assert.equal (e.document.packaging.thickness, 3.175);
        const before = JSON.stringify (e.document.packaging); assert.equal ((await commands.Execute ('packaging.path.add', { points : [[1, 2, 3]], type : 'cut', closed : true })).ok, false); assert.equal (JSON.stringify (e.document.packaging), before);
        e.readOnly = true; assert.equal ((await commands.Execute ('packaging.board', { thickness : 2 })).ok, false); assert.equal (JSON.stringify (e.document.packaging), before);
    });
    it ('Supports macro result references, atomic invalid edits and staged draft commands', async () => {
        const e = editor (); const registry = CreateAgentCommands (e.website);
        const macro = await registry.RunMacro ({ version : 1, steps : [{ id : 'outline', command : 'packaging.path.add', arguments : { points : [[0, 0], [100, 0], [100, 60], [0, 60]], type : 'cut', closed : true, units : 'mm' } }, { id : 'edit', command : 'packaging.path.edit', arguments : { id : { $ref : 'outline.pathId' }, points : [[0, 0], [120, 0], [120, 60], [0, 60]], units : 'mm' } }, { id : 'board', command : 'packaging.board', arguments : { thickness : 3.2, units : 'mm' } }, { id : 'solid', command : 'packaging.extrude', arguments : {} }] }); assert.equal (macro.ok, true, JSON.stringify (macro)); assert.equal (e.document.objects.length, 1);
        const before = JSON.stringify (e.document.packaging); assert.equal ((await registry.Execute ('packaging.path.edit', { id : e.document.packaging.paths[0].id, points : [[0, 0], [0, 0]], closed : false })).ok, false); assert.equal (JSON.stringify (e.document.packaging), before);
        assert.equal ((await registry.Execute ('packaging.draft.point', { point : [1, 2], units : 'mm' })).ok, true); assert.equal ((await registry.Execute ('packaging.draft.point', { point : [3, 4], units : 'mm' })).ok, true); assert.equal ((await registry.Execute ('packaging.draft.finish', { type : 'score', closed : false })).ok, true); assert.equal (e.document.packaging.paths[1].type, 'score'); assert.equal (e.packaging.draft.length, 0);
    });
    it ('Adds an undoable board with the original profile and restores it on redo', async () => { const e = editor (); e.document.packaging = design (); const result = await e.packaging.Extrude (); assert.equal (e.document.objects.length, 1); assert.equal (result.thicknessMM, 3); assert.deepEqual (e.document.objects[0].packagingProfile, design ()); await e.history.Undo (); assert.equal (e.document.objects.length, 0); await e.history.Redo (); assert.equal (e.document.objects[0].id, result.objectId); });
});
