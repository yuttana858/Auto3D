import { FinalizeModel } from '../source/engine/model/modelfinalization.js';
import { Model } from '../source/engine/model/model.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import assert from 'node:assert/strict';
import { AIWorkspace, MatchAISceneUnits, PlaceAIModel } from '../source/website/aiworkspace.js';
import { ReleasePreviewDrag } from '../source/website/aipreview.js';
import * as THREE from 'three';
import { Unit } from '../source/engine/model/unit.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { onRequest } from '../functions/api/ai/[[path]].js';
import { SceneDocument } from '../source/website/scenedocument.js';
import { PackSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { GenerateCuboid, GeneratorParams } from '../source/engine/model/generator.js';

function Workspace ()
{
 const workspace = Object.create (AIWorkspace.prototype); const requests = [];
 Object.assign (workspace, { website : { auth : { user : { id : 'owner' } }, sessionEditor : { readOnly : false } }, settings : { provider : 'meshy', baseUrl : '/api/ai' }, selectedTask : 'model', recent : [{ id : 'model', modelUrl : 'https://assets.meshy.ai/model.glb', status : 'SUCCEEDED', route : 'text-to-3d' }], assets : new Map (), status : {}, RefreshActions : () => {}, UpsertTask : task => workspace.recent.push (task), PollTask : async () => {}, ReferenceImage : async () => null, RequestJSON : async (url, init) => { requests.push ([url, JSON.parse (init.body)]); return { result : { result : 'queued' } }; } }); return { workspace, requests };
}
describe ('Extended AI workspace services', () => {
 it ('Removes a legacy personal AI key and never sends it from the browser', () => {
  const oldSession = globalThis.sessionStorage, oldLocal = globalThis.localStorage; const removed = [];
  try { globalThis.sessionStorage = { removeItem : key => removed.push ('session:' + key) }; globalThis.localStorage = { removeItem : key => removed.push ('local:' + key) }; const workspace = Object.create (AIWorkspace.prototype); workspace.storageKey = 'ai-owner'; workspace.website = { auth : { user : { id : 'owner' } } }; workspace.settings = workspace.LoadSettings (); assert.deepEqual (workspace.settings, { provider : 'meshy', baseUrl : '/api/ai' }); assert.deepEqual (removed, ['session:ai-owner', 'local:ai-owner']); assert.deepEqual (workspace.Headers (true), { 'X-Auto3D-Account' : 'owner', 'Content-Type' : 'application/json' }); }
  finally { globalThis.sessionStorage = oldSession; globalThis.localStorage = oldLocal; }
 });
 it ('Restores a cached AI workspace only for the matching signed-in account', async () => {
  const storage = { accountId : 'owner', async Get () { return { tasks : [{ id : 'model', status : 'SUCCEEDED' }], assets : [{ id : 'model', buffer : new ArrayBuffer (4), scale : 2 }], selected : 'model', projectName : 'Concept' }; } };
  const workspace = Object.create (AIWorkspace.prototype); Object.assign (workspace, { website : { auth : { user : { id : 'owner' } }, sessionEditor : { library : { deviceStorage : storage } } }, cacheGeneration : 1, assets : new Map (), recent : [], projectName : {}, status : {}, RenderRecent () {}, async SelectTask (id) { this.selectedTask = id; } });
  await workspace.RestoreCachedWorkspace ('owner', 1); assert.equal (workspace.selectedTask, 'model'); assert.equal (workspace.assets.get ('model').scale, 2); assert.equal (workspace.projectName.value, 'Concept');
  workspace.recent = []; workspace.assets.clear (); workspace.website.auth.user.id = 'other'; await workspace.RestoreCachedWorkspace ('owner', 1); assert.equal (workspace.assets.size, 0);
 });
 it ('Preserves real size when a meter-based AI model joins a millimeter session', () => {
  const object = { scale : [2, 2, 2], unit : Unit.Meter }, model = { unit : Unit.Meter, GetUnit () { return this.unit; }, SetUnit (unit) { this.unit = unit; } }, saved = { document : { model, objects : [object], ApplyTransform () {} } };
  MatchAISceneUnits (saved, { objects : [{}], model : { GetUnit : () => Unit.Millimeter } }); assert.deepEqual (object.scale, [2000, 2000, 2000]); assert.equal (object.unit, Unit.Millimeter); assert.equal (model.unit, Unit.Millimeter);
 });
 it ('Places an overlapping added model beside the existing box', () => {
  const box = { visible : true, threeObject : new THREE.Mesh (new THREE.BoxGeometry (100, 100, 100)) }, added = { visible : true, position : [0, 0, 0], threeObject : new THREE.Mesh (new THREE.BoxGeometry (10, 10, 10)) }; let fit = 0;
  const editor = { document : { objects : [box, added], ApplyTransform () {} }, ApplyTransform (object) { object.threeObject.position.fromArray (object.position); object.threeObject.updateMatrixWorld (true); }, website : { FitModelToWindow () { fit++; } } };
  PlaceAIModel (editor, [added]); assert.ok (added.position[0] > 55); assert.equal (fit, 1); assert.equal (new THREE.Box3 ().setFromObject (box.threeObject).intersectsBox (new THREE.Box3 ().setFromObject (added.threeObject)), false);
 });
 it ('Clears a stuck preview drag after capture is lost', () => {
  const removed = [], element = { style : {}, ownerDocument : { removeEventListener (type) { removed.push (type); } }, hasPointerCapture () { return false; } }; const controls = { domElement : element, _pointers : [7], _pointerPositions : { 7 : {} }, state : 1 };
  ReleasePreviewDrag (controls, 7); assert.deepEqual (controls._pointers, []); assert.equal (controls.state, -1); assert.deepEqual (removed, ['pointermove', 'pointerup']);
 });
 it ('Builds documented provider payloads and returns a queued task without waiting for generation', async () => {
  for (const action of ['text3d', 'textimage', 'image3d', 'texture', 'rigging', 'animations']) {
   const { workspace, requests } = Workspace (); if (action === 'image3d') { workspace.recent[0].imageUrl = 'https://assets.meshy.ai/image.png'; } if (action === 'animations') { workspace.recent[0].route = 'rigging'; }
   const result = await workspace.Generate ({ action, prompt : 'A red bottle', pbr : false, textureResolution : '4k' }); assert.equal (result.queued, 'queued'); const [route, body] = requests[0]; assert.ok (route.endsWith (result.route));
   if (action === 'texture') { assert.equal (body.input_task_id, 'model'); assert.equal (body.text_style_prompt, 'A red bottle'); assert.equal (body.enable_pbr, false); }
   if (action === 'animations') { assert.deepEqual (body, { rig_task_id : 'model', action_id : 92 }); }
   if (action === 'image3d') { assert.equal (body.input_task_id, 'model'); assert.equal (body.target_polycount, 30000); }
  }
 });
 it ('Rejects unavailable references, invalid rigs, read-only work and strict command extras before submission', async () => {
  const { workspace, requests } = Workspace (); for (const options of [{ action : 'image3d' }, { action : 'animations' }, { action : 'text3d' }, { action : 'rigging', height : -1 }, { action : 'texture', prompt : 'x'.repeat (801) }]) { await assert.rejects (() => workspace.Generate (options)); } assert.deepEqual (requests, []);
  workspace.website.sessionEditor.readOnly = true; await assert.rejects (() => workspace.Generate ({ action : 'text3d', prompt : 'x' }), /editable/);
  const registry = CreateAgentCommands ({ sessionEditor : {}, aiWorkspace : workspace }); assert.equal ((await registry.Execute ('ai.generate', { action : 'text3d', prompt : 'x', apiKey : 'forbidden' })).ok, false); assert.equal ((await registry.Execute ('ai.creation.scale', { scale : 0 })).ok, false);
 });
 it ('Rejects a late provider response after account switch without queueing its task', async () => {
  const { workspace } = Workspace (); const previous = globalThis.fetch;
  try { globalThis.fetch = async () => { workspace.website.auth.user.id = 'other'; return new Response ('{"result":"late"}'); }; workspace.RequestJSON = AIWorkspace.prototype.RequestJSON; await assert.rejects (() => workspace.Generate ({ action : 'text3d', prompt : 'x' }), /Account changed/); assert.equal (workspace.recent.length, 1); } finally { globalThis.fetch = previous; }
 });
 it ('Preserves the boolean multiplyDiffuseMap in archives instead of treating it as a texture object', () => {
  const doc = new SceneDocument (); const model = new Model (); model.AddMaterial (new PhysicalMaterial ()); const mesh = GenerateCuboid (new GeneratorParams (), 1, 1, 1); mesh.triangles.forEach (t => { t.mat = 0; }); model.root.AddMeshIndex (model.AddMesh (mesh)); FinalizeModel (model, {}); doc.AddImported (model, 'AI texture'); doc.model.materials[0].multiplyDiffuseMap = true;
  const saved = OpenSessionArchive (CreateSessionArchive (PackSession (doc))); assert.equal (saved.document.model.materials[0].multiplyDiffuseMap, true);
 });
 it ('Proxies only allow-listed Meshy routes, preserves retry headers and rejects malformed/oversized submissions', async () => {
  const previous = globalThis.fetch; const calls = []; globalThis.fetch = async (url, init) => { calls.push ([url, init]); return new Response ('{"result":"task"}', { headers : { 'Retry-After' : '5' } }); };
  const context = (path, body = '{}') => ({ params : { path }, env : { MESHY_API_KEY : 'test-server-key', AUTO3D_AI_ALLOW_SHARED_KEY : 'true' }, request : new Request ('https://auto3d.test/api/ai/' + path.join ('/'), { method : 'POST', body }) });
  try {
   for (const route of ['text-to-3d', 'image-to-3d', 'text-to-image', 'retexture', 'rigging', 'animations']) { const response = await onRequest (context ([route])); assert.equal (response.status, 200); assert.equal (response.headers.get ('Retry-After'), '5'); assert.ok (calls.at (-1)[0].includes ('/openapi/' + (route === 'text-to-3d' ? 'v2' : 'v1') + '/' + route)); }
   assert.equal ((await onRequest (context (['unknown']))).status, 404); assert.equal ((await onRequest (context (['rigging'], '[]'))).status, 400); assert.equal ((await onRequest (context (['rigging'], '{'))).status, 400);
   const large = context (['image-to-3d']); large.request.headers.set ('Content-Length', String (29 * 1024 * 1024)); assert.equal ((await onRequest (large)).status, 413);
   const personal = context (['text-to-3d']); personal.request.headers.set ('X-Auto3D-AI-Key', 'do-not-use'); assert.equal ((await onRequest (personal)).status, 400);
   const missing = context (['text-to-3d']); missing.env = {}; assert.equal ((await onRequest (missing)).status, 401); assert.equal (calls[0][1].headers.get ('Authorization'), 'Bearer test-server-key');
  } finally { globalThis.fetch = previous; }
 });
});
