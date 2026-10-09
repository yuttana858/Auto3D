import assert from 'node:assert/strict';
import { SessionCameras, ValidateCameraViews } from '../source/website/sessioncameras.js';
import { Camera } from '../source/engine/viewer/camera.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { PackSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
function setup () {
    let camera = new Camera (new Coord3D (4, 5, 6), new Coord3D (0, 0, 0), new Coord3D (0, 1, 0), 45);
    const viewer = { GetCamera : () => camera, SetCamera : value => { camera = value; }, GetProjectionMode : () => 1 };
    const editor = { website : { viewer }, history : new SceneHistory (), MarkDirty : () => {}, timeline : { Stop : () => {} } };
    editor.cameras = new SessionCameras (editor); return editor;
}
describe ('Named session cameras', () => {
    it ('keeps separate views, restores FOV and supports update, rename, delete and undo', async () => {
        const editor = setup (); const cameras = editor.cameras;
        const first = cameras.Create ('Overview'); cameras.SetFov (70); const second = cameras.Create ('Wide');
        cameras.Activate (first.id); assert.equal (editor.website.viewer.GetCamera ().fov, 45);
        cameras.Rename (first.id, 'Front'); cameras.Update (second.id); assert.equal (cameras.Find (second.id).state.fov, 45);
        cameras.Delete (first.id); assert.equal (cameras.Inspect ().views.length, 1);
        await editor.history.Undo (); assert.equal (cameras.Find (first.id).name, 'Front');
        await editor.history.Redo (); assert.throws (() => cameras.Find (first.id));
    });
    it ('round trips all views in a portable archive and opens older sessions without views', () => {
        const editor = setup (); editor.cameras.Create ('One'); editor.cameras.SetFov (60); editor.cameras.Create ('Two');
        const document = new SceneDocument ();
        const opened = OpenSessionArchive (CreateSessionArchive (PackSession (document, { cameraViews : editor.cameras.Inspect () })));
        assert.deepEqual (opened.view.cameraViews, editor.cameras.Inspect ());
        assert.deepEqual (ValidateCameraViews (OpenSessionArchive (CreateSessionArchive (PackSession (document))).view.cameraViews).views, []);
    });
    it ('validates before mutation and keeps malformed archives from replacing the session', () => {
        const editor = setup (); const first = editor.cameras.Create ('One'); const before = editor.cameras.Inspect ();
        assert.throws (() => editor.cameras.Create (' '.repeat (4))); assert.throws (() => editor.cameras.SetFov (NaN)); assert.throws (() => editor.cameras.SetFov (180));
        assert.deepEqual (editor.cameras.Inspect (), before);
        const duplicate = { version : 1, views : [first, first] }; assert.throws (() => ValidateCameraViews (duplicate));
        const invalid = { ...first, state : { ...first.state, fov : 180 } };
        assert.throws (() => OpenSessionArchive (CreateSessionArchive (PackSession (new SceneDocument (), { cameraViews : { version : 1, views : [invalid] } }))));
        editor.readOnly = true; assert.throws (() => editor.cameras.Create ('Two')); assert.throws (() => editor.cameras.Delete (first.id));
        editor.cameras.Activate (first.id); assert.equal (editor.website.viewer.GetCamera ().fov, 45);
    });
    it ('executes strict commands and macros through the shared camera service', async () => {
        const editor = setup (); const registry = CreateAgentCommands ({ sessionEditor : editor });
        const macro = await registry.RunMacro ({ version : 1, steps : [
            { id : 'fov', command : 'camera.fov', arguments : { fov : 60 } },
            { id : 'save', command : 'camera.create', arguments : { name : 'Wide' } },
            { id : 'rename', command : 'camera.rename', arguments : { id : { $ref : 'save.id' }, name : 'Overview' } },
            { id : 'view', command : 'camera.activate', arguments : { id : { $ref : 'save.id' } } }
        ] });
        assert.equal (macro.ok, true); assert.equal (editor.cameras.Inspect ().views[0].name, 'Overview');
        assert.equal ((await registry.Execute ('camera.fov', { fov : 150 })).ok, false);
        assert.equal ((await registry.Execute ('camera.create', { name : 'Two', token : 'bad' })).ok, false);
        editor.readOnly = true; assert.equal ((await registry.Execute ('camera.delete', { id : editor.cameras.data.views[0].id })).ok, false);
    });
});
