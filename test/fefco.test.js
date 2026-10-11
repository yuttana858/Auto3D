import assert from 'node:assert/strict';
import { FefcoCatalog } from '../modules/packaging/src/catalog.js';
import { FefcoProfile, ValidateFefco } from '../modules/packaging/src/fefco.js';
import { CreateFefcoModel } from '../source/website/packagingadapter.js';
import { PackagingContours } from '../source/website/packagingcore.js';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { CreateSessionArchive, PackSession, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { CreateRecoveryArchive } from '../source/website/sessionrecoverypack.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { IsTwoManifold } from '../source/engine/model/modelutils.js';
import { CalculateVolume } from '../source/engine/model/quantities.js';
import { Unit } from '../source/engine/model/unit.js';
import { ParseCommandText } from '../source/website/commandtext.js';

function Editor () { const website = { preferences : { units : 'metric' }, auth : { user : { id : 'test' } }, accountReady : true }; const editor = { website, document : new SceneDocument (), history : new SceneHistory (), Render : async () => {}, Status : () => {} }; editor.packaging = new PackagingWorkspace (editor); website.sessionEditor = editor; return editor; }
function Bounds (model) { const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity]; model.EnumerateVertices (p => [p.x, p.y, p.z].forEach ((value, axis) => { min[axis] = Math.min (min[axis], value); max[axis] = Math.max (max[axis], value); })); return { min, max }; }
describe ('FEFCO folded packaging', async () => {
    it ('Identifies priority RSC/HSC and distinguishes implemented styles from planned families', async () => { const catalog = FefcoCatalog (); assert.equal (catalog.styles.find (item => item.acronym === 'HSC').code, '0200'); assert.equal (catalog.styles.find (item => item.acronym === 'RSC').code, '0201'); assert.equal (catalog.styles.length, 4); assert.deepEqual (catalog.families.filter (item => item.available).map (item => item.id), ['02']); });
    it ('Builds watertight physical panels and connected editable blanks for every style', async () => {
        for (const code of ['0200', '0201', '0202', '0203']) {
            const model = await CreateFefcoModel ({ code }); let count = 0;
            model.EnumerateMeshInstances (mesh => { count++; assert.ok (IsTwoManifold (mesh), mesh.GetName ()); assert.ok (Math.abs (CalculateVolume (mesh)) > 0); for (const triangle of mesh.GetMesh ().triangles) { assert.ok (triangle.HasNormals ()); assert.ok (triangle.HasTextureUVs ()); } });
            assert.equal (count, code === '0200' ? 9 : 13); assert.equal (PackagingContours (FefcoProfile ({ code })).length, 1);
            assert.equal (model.MaterialCount (), 2); for (const material of model.materials) { assert.equal (material.metalness, 0); assert.ok (material.diffuseMap.IsValid ()); assert.deepEqual ([...new Uint8Array (material.diffuseMap.buffer).slice (0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]); }
        }
    }).timeout (15000);
    it ('Omits HSC top flaps and positions RSC closed outer flaps at the center seam', async () => {
        const hsc = await CreateFefcoModel ({ code : '0200' }); assert.equal (hsc.meshes.filter (mesh => mesh.GetName ().startsWith ('Top')).length, 0);
        const rsc = await CreateFefcoModel ({ closure : 'closed' }); const left = rsc.meshes.find (mesh => mesh.GetName () === 'Top left outer flap'); const right = rsc.meshes.find (mesh => mesh.GetName () === 'Top right outer flap');
        const top = Math.min (...rsc.meshes.filter (m => m.GetName ().startsWith ('Top')).flatMap (m => m.vertices.map (p => p.y)));
        const base = Math.max (...rsc.meshes.filter (m => m.GetName ().startsWith ('Base')).flatMap (m => m.vertices.map (p => p.y)));
        assert.ok (Math.abs (top - base - 250) < 1e-6); assert.ok (Math.abs (Bounds (hsc).min[1]) < 1e-6);
        assert.ok (Math.abs (Math.max (...left.vertices.map (p => p.x))) < 1.1); assert.ok (Math.abs (Math.min (...right.vertices.map (p => p.x))) < 1.1);
        const open = Bounds (await CreateFefcoModel ({ closure : 'open' })); const closed = Bounds (rsc); assert.ok (open.max[1] > closed.max[1] + 100); assert.ok (open.max[0] > closed.max[0]);
        const overlap = await CreateFefcoModel ({ code : '0202', closure : 'closed', overlap : 40 }); const outer = overlap.meshes.find (mesh => mesh.GetName () === 'Top left outer flap'); assert.ok (Math.abs (Math.max (...outer.vertices.map (p => p.x)) - 20) < 1.1);
        const full = await CreateFefcoModel ({ code : '0203', closure : 'closed' }); assert.ok (Math.abs (Math.max (...full.meshes.find (mesh => mesh.GetName () === 'Top left outer flap').vertices.map (p => p.x)) - 150) < 1.1);
    });
    it ('Converts all panel coordinates into known scene units without guessing unknown units', async () => { const mm = Bounds (await CreateFefcoModel ({})); const inches = Bounds (await CreateFefcoModel ({}, Unit.Inch)); for (let axis = 0; axis < 3; axis++) { assert.ok (Math.abs (inches.max[axis] * 25.4 - mm.max[axis]) < 0.0001); } await assert.rejects (() => CreateFefcoModel ({}, Unit.Unknown), /known/); });
    it ('Rejects invalid dimensions, calipers, overlap, styles and unknown fields before mutation', async () => {
        for (const input of [{ code : '0401' }, { width : NaN }, { length : 100, width : 300 }, { thickness : 16 }, { width : 20, thickness : 3 }, { code : '0202', overlap : 0 }, { code : '0202', overlap : 300 }, { closure : 'anything' }, { extra : 1 }]) { assert.throws (() => ValidateFefco (input)); }
        const editor = Editor (); const registry = CreateAgentCommands (editor.website); assert.equal ((await registry.Execute ('packaging.fefco.generate', { width : 20000 })).ok, false); assert.equal (editor.document.objects.length, 0); assert.equal (editor.document.packaging, null);
        editor.readOnly = true; assert.equal ((await registry.Execute ('packaging.fefco.configure', { code : '0200' })).ok, false); assert.equal ((await registry.Execute ('packaging.fefco.generate')).ok, false); editor.readOnly = false; editor.website.auth.user = null; assert.equal ((await registry.Execute ('packaging.fefco.generate')).ok, false);
    });
    it ('Generates through commands/macros with atomic profile undo/redo and portable textures/parameters', async () => {
        const editor = Editor (); const registry = CreateAgentCommands (editor.website); const previous = FefcoProfile ({ code : '0200' }); editor.document.packaging = previous;
        const result = await registry.RunMacro ({ version : 1, steps : [{ id : 'setup', command : 'packaging.fefco.configure', arguments : { code : '0201', closure : 'closed', length : 500 } }, { id : 'box', command : 'packaging.fefco.generate', arguments : {} }] }); assert.equal (result.ok, true, JSON.stringify (result)); assert.equal (editor.document.objects.length, 1);
        const object = editor.selected; assert.equal (JSON.parse (object.userData._auto3dFefco).length, 500); assert.equal (editor.document.packaging.paths.length, 13);
        await editor.history.Undo (); assert.equal (editor.document.objects.length, 0); assert.deepEqual (editor.document.packaging, previous); await editor.history.Redo (); assert.equal (editor.selected.id, object.id);
        for (const archive of [CreateSessionArchive (PackSession (editor.document)), CreateRecoveryArchive (RecoverySnapshot (editor.document, {}))]) { const saved = OpenSessionArchive (archive).document; assert.deepEqual (saved.objects[0].packagingProfile, editor.document.packaging); assert.equal (JSON.parse (saved.objects[0].userData._auto3dFefco).length, 500); assert.equal (saved.model.materials.find (m => m.name === 'Natural kraft liner').diffuseMap.buffer.byteLength, editor.document.model.materials.find (m => m.name === 'Natural kraft liner').diffuseMap.buffer.byteLength); }
        editor.packaging.ConfigureFefco ({ length : 600 }); editor.packaging.LoadSelected (); assert.equal (editor.packaging.FefcoInspect ().length, 500);
        const typed = await registry.Execute ('commands.text', { text : 'generate hsc 500x300x250 mm' }); assert.equal (typed.ok, true); assert.equal (JSON.parse (editor.selected.userData._auto3dFefco).code, '0200');
    });
    it ('Rolls back a failed render and always clears processing state', async () => { const editor = Editor (); const previous = FefcoProfile ({ code : '0200' }); editor.document.packaging = previous; let count = 0; editor.Render = async () => { if (!count++) { throw new Error ('render failed'); } }; await assert.rejects (() => editor.packaging.GenerateFefco (), /render failed/); assert.equal (editor.document.objects.length, 0); assert.deepEqual (editor.document.packaging, previous); assert.equal (editor.busy, false); assert.equal (editor.history.undo.length, 0); });
    it ('Bounds typed box phrases and dispatches the same generator', async () => { assert.deepEqual (ParseCommandText ('generate rsc 400x300x250 mm').macro.steps[0].arguments, { code : '0201', length : 400, width : 300, height : 250 }); assert.equal (ParseCommandText ('create hsc 400x300x250').macro.steps[0].command, 'packaging.fefco.generate'); assert.throws (() => ParseCommandText ('generate rsc 100x300x250'), /Length|length/); });
});
