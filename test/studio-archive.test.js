import assert from 'node:assert/strict';
import { CreatePrimitiveDefinition, CombineStudioDefinitions, SetStudioTip, StudioIdentityMatrix } from '../modules/3dstudio/src/definition.js';
import { SceneDocument } from '../source/website/scenedocument.js';
import { PackSession, ReadSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { Model } from '../source/engine/model/model.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import { GenerateCuboid, GeneratorParams } from '../source/engine/model/generator.js';
import { FinalizeModel } from '../source/engine/model/modelfinalization.js';
import { Unit } from '../source/engine/model/unit.js';

function Session (definition)
{
    const document = new SceneDocument (), model = new Model (); model.SetUnit (Unit.Millimeter);
    model.AddMaterial (new PhysicalMaterial ()); model.AddMeshToRootNode (GenerateCuboid (new GeneratorParams ().SetMaterial (0), 20, 30, 10)); FinalizeModel (model, {});
    const object = document.AddImported (model, 'Editable studio solid'); object.userData._auto3dStudio = JSON.stringify (definition);
    return PackSession (document);
}

describe ('3Dstudio saved construction history', () => {
    it ('round trips long retained history and its earlier displayed tip without truncation', () => {
        let definition = CreatePrimitiveDefinition ('box');
        for (let i = 0; i < 6; i++) { definition = CombineStudioDefinitions (definition, CreatePrimitiveDefinition ('sphere'), StudioIdentityMatrix, 'union'); }
        definition = SetStudioTip (definition, definition.nodes[0].id);
        assert.ok (JSON.stringify (definition).length > 2000);
        const saved = OpenSessionArchive (CreateSessionArchive (Session (definition))).document.objects[0];
        assert.deepEqual (JSON.parse (saved.userData._auto3dStudio), definition);
        assert.notEqual (definition.rootId, definition.tipId);
    });
    it ('rejects invalid inactive history and unknown schema before opening the session', () => {
        const definition = CombineStudioDefinitions (CreatePrimitiveDefinition ('box'), CreatePrimitiveDefinition ('sphere'), StudioIdentityMatrix, 'subtract');
        const earlier = SetStudioTip (definition, definition.nodes[0].id);
        earlier.nodes.at (-1).left = earlier.nodes.at (-1).id;
        assert.throws (() => ReadSession (Session (earlier)), /cycle/i);
        assert.throws (() => ReadSession (Session ({ ...definition, schemaVersion : 99 })), /version/i);
    });
    it ('rejects oversize authoring JSON without silently slicing it', () => {
        const session = Session (CreatePrimitiveDefinition ());
        session.objects[0].userData._auto3dStudio = ' '.repeat (262145);
        assert.throws (() => ReadSession (session), /too large/i);
        session.objects[0].userData._auto3dStudio = 'é'.repeat (140000);
        assert.throws (() => ReadSession (session), /too large/i);
    });
});
