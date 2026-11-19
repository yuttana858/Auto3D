import assert from 'node:assert/strict';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { PrimaryProductModel } from '../source/website/primaryproductsadapter.js';
import { CreatePrimaryProduct } from '../modules/primary-products/src/geometry.js';
import { ProductDesign } from '../modules/primary-products/src/catalog.js';
import { DefaultEngineering, EngineeringMeasurements } from '../modules/packaging/src/engineering.js';
import { Unit } from '../source/engine/model/unit.js';

function Editor () {
    const website = { preferences : { units : 'metric' }, auth : { user : { id : 'owner' } }, accountReady : true };
    const editor = { website, document : new SceneDocument (), history : new SceneHistory (), Render : async () => {}, Status : () => {} };
    website.sessionEditor = editor; editor.packaging = new PackagingWorkspace (editor); return editor;
}
function CanEditor () {
    const e = Editor (), model = PrimaryProductModel (CreatePrimaryProduct (ProductDesign ('standard-beverage')), Unit.Millimeter);
    e.selected = e.document.AddImported (model, 'Can'); e.SelectedObjects = () => [e.selected]; return e;
}
describe ('Can collar and CAD review regressions', function () {
    this.timeout (15000);
    it ('remaps Auto edge dimensions to fillet tangencies, retaining other paths and Undo', async () => {
        const e = Editor (), p = e.packaging;
        const rectangle = p.AddPath ([[0, 0], [100, 0], [100, 60], [0, 60]], 'cut', true, 'mm').pathId;
        const line = p.AddPath ([[150, 0], [200, 0]], 'score', false, 'mm').pathId;
        e.document.packaging.engineering = DefaultEngineering (e.document.packaging);
        const before = structuredClone (e.document.packaging), unrelated = before.engineering.dimensions.filter (d => d.pathId === line);
        p.RoundCorners ({ ids : [rectangle], radius : 10, units : 'mm' });
        const measured = EngineeringMeasurements (e.document.packaging);
        assert.deepEqual (measured.dimensions.filter (d => d.pathId === rectangle).map (d => Number (d.scoreMm.toFixed (6))), [80, 40, 80, 40]);
        assert.deepEqual (measured.state.dimensions.filter (d => d.pathId === line), unrelated);
        await e.history.Undo (); assert.deepEqual (e.document.packaging, before);
        await e.history.Redo (); assert.equal (e.document.packaging.paths[0].points.length, 36);
    });
    it ('refuses removed constrained endpoints and remaps constraints at untouched vertices', () => {
        const e = Editor (), p = e.packaging, id = p.AddPath ([[0, 0], [100, 0], [100, 60], [0, 60]], 'cut', true, 'mm').pathId;
        e.document.packaging.engineering = DefaultEngineering (e.document.packaging);
        const dim = e.document.packaging.engineering.dimensions[1]; dim.mode = 'parametric'; dim.targetMm = 60;
        const before = structuredClone (e.document.packaging), count = e.history.undo.length;
        assert.throws (() => p.RoundCorners ({ ids : [id], radius : 10, units : 'mm' }), /constrained measurement endpoint/);
        assert.deepEqual (e.document.packaging, before); assert.equal (e.history.undo.length, count);
        p.RoundCorners ({ ids : [id], corners : [0], radius : 10, units : 'mm' });
        const retained = EngineeringMeasurements (e.document.packaging).dimensions.find (d => d.id === dim.id);
        assert.equal (retained.mode, 'parametric'); assert.equal (retained.scoreMm, 60); assert.equal (retained.targetMet, true); assert.notEqual (retained.start, dim.start);
    });
    it ('fits the default beverage can and refuses an explicitly excessive tuck', async () => {
        const e = CanEditor (), collar = e.packaging.canCollar, inspect = collar.Inspect ();
        assert.equal (inspect.available, true, inspect.reason); assert.ok (inspect.collar.neckClearanceMm >= .0254 - 1e-7);
        assert.equal (inspect.collar.automaticTuck, true);
        assert.equal (collar.Inspect ({ tuckMm : 8 }).available, false);
        const original = e.selected, before = { ...original.userData };
        const result = await collar.Add (); assert.ok (result.objectId); assert.equal (e.document.objects.length, 2);
        await e.history.Undo (); assert.deepEqual (e.document.objects, [original]); assert.deepEqual (original.userData, before);
    });
    it ('rolls back a collar if account readiness is lost during rendering', async () => {
        const e = CanEditor (), original = e.selected, before = { ...original.userData };
        e.Render = async () => { e.website.accountReady = false; };
        await assert.rejects (() => e.packaging.canCollar.Add (), /session changed/);
        assert.deepEqual (e.document.objects, [original]); assert.deepEqual (original.userData, before); assert.equal (e.history.undo.length, 0); assert.equal (e.busy, false);
    });
});
