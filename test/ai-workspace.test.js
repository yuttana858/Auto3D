import { FinalizeModel } from '../source/engine/model/modelfinalization.js';
import { Model } from '../source/engine/model/model.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import assert from 'node:assert/strict';
import { AIWorkspace, MatchAISceneUnits, PlaceAIModel, AIImageModels, AIAspectRatios, AIGenerationActions, AIModes } from '../source/website/aiworkspace.js';
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
 it ('Uses the chosen generation type and enables Generate only when that type has its inputs', () => {
  const { workspace } = Workspace (); const button = { disabled : false, textContent : '' };
  Object.assign (workspace, { mode : 'text3d', imageFiles : [], remoteReferences : [], imageFile : null, prompt : { value : '' }, texturePrompt : { value : '' }, generateButton : button, detailSelect : { value : 'standard:30000' }, pbrCheckbox : { checked : true }, textureResolution : { value : '2k' }, imageModel : { value : 'nano-banana' }, aspect : { value : '1:1' } });
  assert.equal (workspace.PrimaryGenerationAction (), 'text3d'); assert.throws (() => workspace.SetMode ('rig'), /Unknown generation type/);
  const check = (mode, setup, ready) => { workspace.SetMode (mode); setup (); AIWorkspace.prototype.RefreshActions.call (workspace); assert.equal (button.disabled, !ready, mode + ' ready=' + ready); assert.equal (button.textContent, AIModes[mode].button); };
  check ('text3d', () => { workspace.prompt.value = ''; }, false); check ('text3d', () => { workspace.prompt.value = 'A red bottle'; }, true);
  // An uploaded image alone never switches the type: Image to 3D needs to be chosen.
  check ('text3d', () => { workspace.prompt.value = ''; workspace.imageFiles = [{ type : 'image/png' }]; workspace.imageFile = workspace.imageFiles[0]; }, false); assert.equal (workspace.PrimaryGenerationAction (), 'text3d');
  check ('image3d', () => {}, true);
  check ('multiimage3d', () => {}, false); check ('multiimage3d', () => { workspace.remoteReferences = [{ url : 'https://assets.meshy.ai/v1.png', taskId : 'views' }]; }, true);
  workspace.imageFiles = []; workspace.imageFile = null; workspace.remoteReferences = [];
  workspace.recent[0].imageUrl = null; check ('texture', () => {}, false); check ('texture', () => { workspace.texturePrompt.value = 'brushed steel'; }, true);
  check ('textimage', () => { workspace.prompt.value = 'A mug'; }, true);
  assert.equal (workspace.UIOptions ('texture').prompt, 'brushed steel'); assert.equal (workspace.UIOptions ('texture').texturePrompt, '');
 });
 it ('Generates multi-view reference views and sends them, alone or mixed with uploads, to Multi-image to 3D', async () => {
  let { workspace, requests } = Workspace (); let finish; workspace.PollTask = () => new Promise (resolve => { finish = resolve; });
  Object.assign (workspace, { mode : 'multiimage3d', imageFiles : [], remoteReferences : [], RenderReferences () {}, SetMode (mode) { this.mode = mode; } });
  await assert.rejects (() => workspace.GenerateReferenceViews ({ prompt : ' ' }), /Describe the object/);
  const queued = await workspace.GenerateReferenceViews ({ prompt : 'a mug', imageModel : 'nano-banana-2' });
  assert.deepEqual (requests[0], ['/api/ai/text-to-image', { prompt : 'a mug', ai_model : 'nano-banana-2', generate_multi_view : true }]); assert.equal (queued.route, 'text-to-image');
  finish ({ id : 'views', imageUrls : ['https://assets.meshy.ai/0.png', 'https://assets.meshy.ai/1.png', 'https://assets.meshy.ai/2.png'] }); await new Promise (resolve => setTimeout (resolve));
  assert.equal (workspace.remoteReferences.length, 3); assert.match (workspace.status.textContent, /3 reference views ready.*4th view/);
  await workspace.Generate ({ action : 'multiimage3d' }); assert.equal (requests[1][1].input_task_id, 'views'); assert.equal (requests[1][1].image_urls, undefined);
  // An uploaded 4th view mixes data and Meshy URLs, so the views are sent as image URLs.
  workspace.imageFiles = [{ type : 'image/png', size : 10 }]; workspace.imageFile = workspace.imageFiles[0]; workspace.ReadDataURL = async () => 'data:image/png;base64,QQ==';
  await workspace.Generate ({ action : 'multiimage3d' }); assert.deepEqual (requests[2][1].image_urls, ['data:image/png;base64,QQ==', 'https://assets.meshy.ai/0.png', 'https://assets.meshy.ai/1.png', 'https://assets.meshy.ai/2.png']);
  await assert.rejects (() => workspace.GenerateReferenceViews ({ prompt : 'a mug' }), /Remove a reference/);
  await assert.rejects (() => workspace.SetReferenceFiles ([{ type : 'image/png', size : 1 }], { append : true }), /up to 4/);
 });
 it ('Deletes creations, keeps failures, refuses running tasks and clears dependent state', async () => {
  const { workspace } = Workspace (); const requests = [];
  Object.assign (workspace, { recent : [{ id : 'a', route : 'text-to-3d', status : 'SUCCEEDED', name : 'A' }, { id : 'b', route : 'text-to-image', status : 'SUCCEEDED', name : 'B' }, { id : 'c', route : 'image-to-3d', status : 'FAILED', name : 'C' }, { id : 'run', route : 'text-to-3d', status : 'IN_PROGRESS', name : 'R' }], selectedTask : 'a', checkedTasks : new Set (['a', 'b']), remoteReferences : [{ url : 'u', taskId : 'b' }], previewSequence : 0, previewMessage : {}, RenderReferences () {}, RenderRecent () {}, HideImages () {}, ScheduleWorkspaceSave () {} });
  workspace.assets.set ('a', { buffer : new ArrayBuffer (1) });
  workspace.RequestJSON = async (url, init) => { requests.push ([url, init.method]); if (url.endsWith ('/c')) { throw new Error ('Meshy refused'); } return { result : { deleted : true } }; };
  await assert.rejects (() => workspace.DeleteCreations (['run']), /finish/); await assert.rejects (() => workspace.DeleteCreations ([]), /1–48/); await assert.rejects (() => workspace.DeleteCreations (['missing']), /not found/); assert.equal (requests.length, 0);
  const result = await workspace.DeleteCreations (['a', 'b', 'c']);
  assert.deepEqual (requests, [['/api/ai/text-to-3d/a', 'DELETE'], ['/api/ai/text-to-image/b', 'DELETE'], ['/api/ai/image-to-3d/c', 'DELETE']]);
  assert.deepEqual (result.deleted, ['a', 'b']); assert.equal (result.failed[0].id, 'c');
  assert.deepEqual (workspace.recent.map (item => item.id), ['c', 'run']); assert.equal (workspace.assets.has ('a'), false); assert.equal (workspace.selectedTask, null); assert.equal (workspace.checkedTasks.size, 0); assert.deepEqual (workspace.remoteReferences, []);
  globalThis.confirm = () => false; assert.deepEqual (await workspace.ConfirmDelete (['c']), { deleted : [], cancelled : true }); delete globalThis.confirm;
 });
 it ('Validates multi-select and thumbnail size and keeps Add and New on one shared path', async () => {
  const { workspace } = Workspace (); Object.assign (workspace, { checkedTasks : new Set (), RenderRecent () {} });
  assert.deepEqual (workspace.SetChecked (['model'], true), { selected : ['model'] }); assert.throws (() => workspace.SetChecked (['missing'], true), /not found/); assert.deepEqual (workspace.ClearChecked (), { selected : [] });
  assert.throws (() => workspace.SetThumbnailSize (40), /72–240/); assert.throws (() => workspace.SetThumbnailSize (NaN)); assert.deepEqual (workspace.SetThumbnailSize (100), { size : 100 });
  const calls = []; const toast = { Update (text) { calls.push ('toast:' + text.split (' ')[0]); }, Done () {}, Fail () {} };
  Object.assign (workspace, { ShowViewerToast : () => toast, EnsureAsset : async (task, owner, progress) => { progress (50, 100); calls.push ('download'); return { id : task.id, name : 'Mug' }; }, AddAsset : async asset => { calls.push ('append:' + asset.id); return { objectCount : 1 }; } });
  workspace.website.sessionEditor = { readOnly : false, busy : false, sessions : { New : async () => { calls.push ('new-session'); } } };
  assert.deepEqual (await workspace.AddCreation ('model'), { objectCount : 1, id : 'model', newSession : false });
  assert.deepEqual (calls.splice (0), ['toast:Downloading', 'download', 'append:model']);
  await workspace.AddCreation ('model', { newSession : true }); assert.deepEqual (calls, ['toast:Downloading', 'download', 'toast:Opening', 'new-session', 'append:model']);
  workspace.recent.push ({ id : 'img', status : 'SUCCEEDED', imageUrl : 'x' }); await assert.rejects (() => workspace.AddCreation ('img'), /3D model/);
 });
 it ('Downloads a model once with byte progress', async () => {
  const { workspace } = Workspace (); const previous = globalThis.fetch; let fetched = 0;
  try {
   globalThis.fetch = async () => { fetched++; return new Response (new Blob ([new Uint8Array (10), new Uint8Array (6)]).stream (), { headers : { 'Content-Length' : '16' } }); };
   const progress = []; const asset = await workspace.EnsureAsset (workspace.recent[0], 'owner', (received, total) => progress.push ([received, total]));
   assert.equal (asset.buffer.byteLength, 16); assert.deepEqual (progress.at (-1), [16, 16]); await workspace.EnsureAsset (workspace.recent[0], 'owner'); assert.equal (fetched, 1);
  } finally { globalThis.fetch = previous; }
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
 it ('Preserves Meshy 403 details instead of reporting every refusal as a bad key', async () => {
  const previous = globalThis.fetch; globalThis.fetch = async () => Response.json ({ message : 'Content moderation blocked the input.' }, { status : 403 });
  try { const c = { data : { user : { id : 'owner' } }, params : { path : ['text-to-3d'] }, env : { MESHY_API_KEY : 'test-server-key', AUTO3D_AI_ALLOW_SHARED_KEY : 'true', AUTO3D_AI_CREDENTIALS_R2 : { async get () { return null; }, async put () { return {}; } } }, request : new Request ('https://auto3d.test/api/ai/text-to-3d', { method : 'POST', body : '{}' }) }; const response = await onRequest (c); assert.equal (response.status, 403); assert.match ((await response.json ()).message, /moderation/); } finally { globalThis.fetch = previous; }
 });
 it ('Retries transient polling failures and stops on permanent failures', async () => {
  const { workspace } = Workspace (); workspace.PollTask = AIWorkspace.prototype.PollTask; const timer = globalThis.setTimeout; let calls = 0;
  try {
   globalThis.setTimeout = callback => { callback (); return 0; };
   workspace.RequestJSON = async () => { calls++; if (calls === 1) { throw Object.assign (new Error ('busy'), { status : 429, retryAfter : '1' }); } return { result : { id : 'model', status : 'SUCCEEDED' }, response : new Response () }; };
   assert.equal ((await workspace.PollTask ('text-to-3d', 'model')).status, 'SUCCEEDED'); assert.equal (calls, 2);
   workspace.RequestJSON = async () => { calls++; throw Object.assign (new Error ('unauthorized'), { status : 401 }); };
   await assert.rejects (() => workspace.PollTask ('text-to-3d', 'model'), /unauthorized/); assert.equal (calls, 3);
  } finally { globalThis.setTimeout = timer; }
 });
 it ('Loads history concurrently and retains successful results when one route fails', async () => {
  const { workspace } = Workspace (); workspace.RenderRecent = () => {}; let started = 0, release; const gate = new Promise (resolve => { release = resolve; });
  workspace.RequestJSON = async url => { started++; if (started === 6) { release (); } await gate; if (url.includes ('retexture')) { throw new Error ('unavailable'); } return { result : [{ id : url, status : 'SUCCEEDED' }] }; };
  await workspace.RefreshRecent (); assert.equal (started, 6); assert.equal (workspace.recent.length, 6); assert.match (workspace.status.textContent, /Some creation history/);
 });
 it ('Warns against duplicate paid submissions when the connection drops', async () => {
  const { workspace } = Workspace (); const previous = globalThis.fetch; workspace.RequestJSON = AIWorkspace.prototype.RequestJSON;
  try { globalThis.fetch = async () => { throw new TypeError ('network failed'); }; await assert.rejects (() => workspace.Generate ({ action : 'text3d', prompt : 'bottle' }), /Check recent creations before retrying/); }
  finally { globalThis.fetch = previous; }
 });
 it ('Preserves the boolean multiplyDiffuseMap in archives instead of treating it as a texture object', () => {
  const doc = new SceneDocument (); const model = new Model (); model.AddMaterial (new PhysicalMaterial ()); const mesh = GenerateCuboid (new GeneratorParams (), 1, 1, 1); mesh.triangles.forEach (t => { t.mat = 0; }); model.root.AddMeshIndex (model.AddMesh (mesh)); FinalizeModel (model, {}); doc.AddImported (model, 'AI texture'); doc.model.materials[0].multiplyDiffuseMap = true;
  const saved = OpenSessionArchive (CreateSessionArchive (PackSession (doc))); assert.equal (saved.document.model.materials[0].multiplyDiffuseMap, true);
 });
 it ('Builds multi-image, multi-view and texture-guided payloads from the current Meshy contract', async () => {
  let { workspace, requests } = Workspace (); workspace.imageFiles = [{}, {}, {}]; workspace.ReferenceImages = async () => ['data:image/png;base64,A', 'data:image/png;base64,B', 'data:image/png;base64,C'];
  await workspace.Generate ({ action : 'multiimage3d', texturePrompt : 'glazed ceramic', detail : 'smart:10000', pbr : true });
  assert.ok (requests[0][0].endsWith ('/multi-image-to-3d')); assert.deepEqual (requests[0][1].image_urls.length, 3); assert.equal (requests[0][1].texture_prompt, 'glazed ceramic'); assert.equal (requests[0][1].target_polycount, 10000); assert.equal (requests[0][1].ai_model, 'latest'); assert.equal (requests[0][1].model_type, undefined);
  ({ workspace, requests } = Workspace ()); workspace.recent[0] = { id : 'views', route : 'text-to-image', status : 'SUCCEEDED', imageUrl : 'https://assets.meshy.ai/v.png' }; workspace.selectedTask = 'views';
  await workspace.Generate ({ action : 'multiimage3d' }); assert.equal (requests[0][1].input_task_id, 'views'); assert.equal (requests[0][1].image_urls, undefined);
  ({ workspace, requests } = Workspace ()); workspace.imageFiles = [{}]; await assert.rejects (() => workspace.Generate ({ action : 'multiimage3d' }), /2–4 views/); assert.deepEqual (requests, []);
  await workspace.Generate ({ action : 'textimage', prompt : 'a mug', imageModel : 'nano-banana-2-1', multiView : true, aspect : '16:9' }); assert.deepEqual (requests[0][1], { prompt : 'a mug', ai_model : 'nano-banana-2-1', generate_multi_view : true });
  await workspace.Generate ({ action : 'textimage', prompt : 'a mug', imageModel : 'gpt-image-2', aspect : '3:2', removeBackground : true }); assert.deepEqual (requests[1][1], { prompt : 'a mug', ai_model : 'gpt-image-2', aspect_ratio : '3:2', remove_background : true });
  await assert.rejects (() => workspace.Generate ({ action : 'textimage', prompt : 'a mug', imageModel : 'nano-banana', aspect : '3:2' }), /aspect/); assert.equal (requests.length, 2);
  workspace.recent[0].imageUrl = 'https://assets.meshy.ai/i.png'; await workspace.Generate ({ action : 'image3d', texturePrompt : 'brushed steel' }); assert.equal (requests[2][1].texture_prompt, 'brushed steel'); assert.equal (workspace.recent.at (-1).parentId, 'model');
 });
 it ('Validates reference image count, type and total size before reading files', () => {
  const { workspace } = Workspace (); const png = size => ({ type : 'image/png', size });
  assert.doesNotThrow (() => workspace.ValidateReferenceFiles ([png (5e6), png (5e6), png (5e6), png (5e6)]));
  assert.throws (() => workspace.ValidateReferenceFiles ([png (1), png (1), png (1), png (1), png (1)]), /up to 4/);
  assert.throws (() => workspace.ValidateReferenceFiles ([png (15e6), png (6e6)]), /20 MB/);
  assert.throws (() => workspace.ValidateReferenceFiles ([{ type : 'image/gif', size : 1 }]), /PNG, JPG or WebP/);
 });
 it ('Revises each creation type as a new task from the right source without touching the original', async () => {
  const { workspace, requests } = Workspace ();
  workspace.recent = [
   { id : 'preview', type : 'text-to-3d-preview', route : 'text-to-3d', status : 'SUCCEEDED', name : 'mug' },
   { id : 'refined', type : 'text-to-3d-refine', route : 'text-to-3d', status : 'SUCCEEDED', parentId : 'preview', modelUrl : 'https://assets.meshy.ai/r.glb' },
   { id : 'orphan', type : 'text-to-3d-refine', route : 'text-to-3d', status : 'SUCCEEDED', modelUrl : 'https://assets.meshy.ai/o.glb' },
   { id : 'image', type : 'text-to-image', route : 'text-to-image', status : 'SUCCEEDED', imageUrl : 'https://assets.meshy.ai/i.png' },
   { id : 'photo', type : 'image-to-3d', route : 'image-to-3d', status : 'SUCCEEDED', modelUrl : 'https://assets.meshy.ai/p.glb' },
   { id : 'views', type : 'multi-image-to-3d', route : 'multi-image-to-3d', status : 'SUCCEEDED', modelUrl : 'https://assets.meshy.ai/v.glb' },
   { id : 'skin', type : 'retexture', route : 'retexture', status : 'SUCCEEDED', modelUrl : 'https://assets.meshy.ai/s.glb' },
   { id : 'running', type : 'text-to-3d-preview', route : 'text-to-3d', status : 'IN_PROGRESS' }
  ];
  Object.assign (workspace, { prompt : { value : '' }, texturePrompt : { value : '' }, detailSelect : { value : 'standard:30000' }, pbrCheckbox : { checked : true }, textureResolution : { value : '2k' }, imageModel : { value : 'nano-banana' }, aspect : { value : '1:1' }, CancelRevision () {} });
  const RequestJSON = workspace.RequestJSON; workspace.RequestJSON = async (url, init) => { if (init?.method === 'POST') { return RequestJSON (url, init); } return { result : {} }; };
  await workspace.Revise ('preview', 'a taller mug'); assert.ok (requests[0][0].endsWith ('/text-to-3d')); assert.equal (requests[0][1].mode, 'preview'); assert.equal (requests[0][1].prompt, 'a taller mug');
  await workspace.Revise ('refined', 'speckled glaze'); assert.deepEqual ([requests[1][1].mode, requests[1][1].preview_task_id, requests[1][1].texture_prompt], ['refine', 'preview', 'speckled glaze']);
  await assert.rejects (() => workspace.Revise ('orphan', 'x'), /preview/);
  await workspace.Revise ('image', 'make it blue'); assert.ok (requests[2][0].endsWith ('/image-to-image')); assert.deepEqual (requests[2][1], { ai_model : 'nano-banana', input_task_id : 'image', prompt : 'make it blue' });
  workspace.imageFile = { type : 'image/png', size : 1 }; workspace.imageFiles = [workspace.imageFile, workspace.imageFile]; workspace.ReferenceImage = async () => { throw new Error ('must reuse the original images'); };
  await workspace.Revise ('photo', 'rubber'); assert.ok (requests[3][0].endsWith ('/image-to-3d')); assert.equal (requests[3][1].input_task_id, 'photo'); assert.equal (requests[3][1].texture_prompt, 'rubber');
  await workspace.Revise ('views', 'oak'); assert.ok (requests[4][0].endsWith ('/multi-image-to-3d')); assert.equal (requests[4][1].input_task_id, 'views'); assert.equal (requests[4][1].texture_prompt, 'oak');
  await workspace.Revise ('skin', 'chrome'); assert.ok (requests[5][0].endsWith ('/retexture')); assert.deepEqual ([requests[5][1].input_task_id, requests[5][1].text_style_prompt], ['skin', 'chrome']);
  await assert.rejects (() => workspace.Revise ('running', 'x'), /completed/); await assert.rejects (() => workspace.Revise ('preview', '  '), /revision prompt/);
  assert.equal (requests.length, 6); assert.ok (workspace.recent.filter (task => task.revisionOf).length >= 6); assert.equal (workspace.recent.find (task => task.id === 'preview').status, 'SUCCEEDED');
 });
 it ('Keeps a known thumbnail when a provider refresh omits it and normalizes image histories', () => {
  const workspace = Object.create (AIWorkspace.prototype); Object.assign (workspace, { recent : [{ id : 'a', thumbnail : 'data:image/png;base64,X', thumbnailFailed : true, parentId : 'p', createdAt : 1 }], assets : new Map (), RenderRecent () {}, ScheduleWorkspaceSave () {} });
  workspace.UpsertTask ({ id : 'a', status : 'SUCCEEDED', thumbnail : null, parentId : undefined }); assert.equal (workspace.recent[0].thumbnail, 'data:image/png;base64,X'); assert.equal (workspace.recent[0].parentId, 'p'); assert.equal (workspace.recent[0].thumbnailFailed, true);
  workspace.UpsertTask ({ id : 'a', thumbnail : 'https://assets.meshy.ai/new.png' }); assert.equal (workspace.recent[0].thumbnailFailed, undefined);
  const task = workspace.NormalizeMeshyTask ({ id : 'img', type : 'text-to-image', route : 'text-to-image', status : 'SUCCEEDED', image_urls : ['https://assets.meshy.ai/1.png', 'https://assets.meshy.ai/2.png'] });
  assert.deepEqual ([task.thumbnail, task.imageUrl, task.imageUrls.length, task.name], ['https://assets.meshy.ai/1.png', 'https://assets.meshy.ai/1.png', 2, 'Text to image']);
  assert.equal (workspace.NormalizeMeshyTask ({ id : 't', type : 'retexture', text_style_prompt : 'chrome', status : 'SUCCEEDED' }).texturePrompt, 'chrome');
 });
 it ('Keeps agent command enums aligned with the workspace and validates revisions and viewer controls', async () => {
  const { workspace } = Workspace (); let revised = null; workspace.Revise = async (id, prompt) => { revised = [id, prompt]; return { queued : 'r' }; }; workspace.ViewerControl = (action, value) => ({ action, value });
  const registry = CreateAgentCommands ({ sessionEditor : {}, aiWorkspace : workspace }); const schema = id => registry.Catalog ().find (item => item.id === id).inputSchema;
  const generate = schema ('ai.generate'); assert.deepEqual (generate.properties.imageModel.enum, AIImageModels); assert.deepEqual (generate.properties.aspect.enum, AIAspectRatios); assert.deepEqual (generate.properties.action.enum, AIGenerationActions);
  assert.equal ((await registry.Execute ('ai.creation.revise', { id : 'model' })).ok, false); assert.equal (revised, null);
  assert.equal ((await registry.Execute ('ai.creation.revise', { id : 'model', prompt : 'taller' })).ok, true); assert.deepEqual (revised, ['model', 'taller']);
  assert.equal ((await registry.Execute ('ai.viewer.control', { action : 'spin' })).ok, false); assert.equal ((await registry.Execute ('ai.viewer.control', { action : 'zoomIn', value : 2 })).ok, true);
 });
 it ('Proxies only allow-listed Meshy routes, preserves retry headers and rejects malformed/oversized submissions', async () => {
  const previous = globalThis.fetch; const calls = []; globalThis.fetch = async (url, init) => { calls.push ([url, init]); return new Response ('{"result":"task"}', { headers : { 'Retry-After' : '5' } }); };
  const objects = new Map (), bucket = { async get (key) { const body = objects.get (key); return body ? { size : body.length, async json () { return JSON.parse (body); } } : null; }, async put (key, body) { objects.set (key, body); return {}; } };
  const context = (path, body = '{}') => ({ data : { user : { id : 'owner' } }, params : { path }, env : { MESHY_API_KEY : 'test-server-key', AUTO3D_AI_ALLOW_SHARED_KEY : 'true', AUTO3D_AI_CREDENTIALS_R2 : bucket }, request : new Request ('https://auto3d.test/api/ai/' + path.join ('/'), { method : 'POST', body }) });
  try {
   for (const route of ['text-to-3d', 'image-to-3d', 'multi-image-to-3d', 'text-to-image', 'image-to-image', 'retexture', 'rigging', 'animations']) { const response = await onRequest (context ([route])); assert.equal (response.status, 200); assert.equal (response.headers.get ('Retry-After'), '5'); assert.ok (calls.at (-1)[0].includes ('/openapi/' + (route === 'text-to-3d' ? 'v2' : 'v1') + '/' + route)); }
   assert.equal ((await onRequest (context (['unknown']))).status, 404); assert.equal ((await onRequest (context (['rigging'], '[]'))).status, 400); assert.equal ((await onRequest (context (['rigging'], '{'))).status, 400);
   for (const route of ['multi-image-to-3d', 'image-to-image']) { const images = context ([route], JSON.stringify ({ image_urls : ['data:image/png;base64,' + 'A'.repeat (70000)] })); assert.equal ((await onRequest (images)).status, 200); }
   const large = context (['image-to-3d']); large.request.headers.set ('Content-Length', String (29 * 1024 * 1024)); assert.equal ((await onRequest (large)).status, 413);
   const personal = context (['text-to-3d']); personal.request.headers.set ('X-Auto3D-AI-Key', 'do-not-use'); assert.equal ((await onRequest (personal)).status, 400);
   const missing = context (['text-to-3d']); missing.env = {}; assert.equal ((await onRequest (missing)).status, 401); assert.equal (calls[0][1].headers.get ('Authorization'), 'Bearer test-server-key');
  } finally { globalThis.fetch = previous; }
 });
});
