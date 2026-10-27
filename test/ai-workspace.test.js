import { FinalizeModel } from '../source/engine/model/modelfinalization.js';
import { Model } from '../source/engine/model/model.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import assert from 'node:assert/strict';
import { AIWorkspace } from '../source/website/aiworkspace.js';
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
  const context = (path, body = '{}') => ({ params : { path }, env : {}, request : new Request ('https://auto3d.test/api/ai/' + path.join ('/'), { method : 'POST', headers : { 'X-Auto3D-AI-Key' : 'test-key' }, body }) });
  try {
   for (const route of ['text-to-3d', 'image-to-3d', 'text-to-image', 'retexture', 'rigging', 'animations']) { const response = await onRequest (context ([route])); assert.equal (response.status, 200); assert.equal (response.headers.get ('Retry-After'), '5'); assert.ok (calls.at (-1)[0].includes ('/openapi/' + (route === 'text-to-3d' ? 'v2' : 'v1') + '/' + route)); }
   assert.equal ((await onRequest (context (['unknown']))).status, 404); assert.equal ((await onRequest (context (['rigging'], '[]'))).status, 400); assert.equal ((await onRequest (context (['rigging'], '{'))).status, 400);
   const large = context (['image-to-3d']); large.request.headers.set ('Content-Length', String (29 * 1024 * 1024)); assert.equal ((await onRequest (large)).status, 413);
  } finally { globalThis.fetch = previous; }
 });
});
