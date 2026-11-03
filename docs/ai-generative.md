# AI Generative workspace

Auto3D 0.40.0 uses a same-origin Meshy proxy under `/api/ai/*`. The independent AI workspace supports minimal docked mode and a full-viewport extended modal: interactive model preview in the center, previous creations along the bottom, inputs on the right and Add to session at the top left. Background buttons, navigation and scene keyboard shortcuts cannot receive modal interactions. Closing/minimizing preserves the project for the current account/session.

## Meshy capabilities reviewed 2026-10-27

| Workflow | Auto3D behavior | Official API |
| --- | --- | --- |
| Text to 3D | Preview, optional PBR refine, GLB output, detail budget | [Text to 3D](https://docs.meshy.ai/en/api/text-to-3d) |
| Image to 3D | PNG/JPEG/WebP reference or selected generated image; textured GLB | [Image to 3D](https://docs.meshy.ai/en/api/image-to-3d) |
| Text to Image | Image model and aspect ratio; reference preview for Image to 3D | [Text to Image](https://docs.meshy.ai/en/api/text-to-image) |
| Retexture | Selected completed model, text or image style, PBR and texture resolution, original UVs | [Retexture](https://docs.meshy.ai/en/api/retexture) |
| Rigging | Selected textured humanoid, character height in meters | [Rigging](https://docs.meshy.ai/en/api/rigging) |
| Animation | Completed rig plus an animation action ID; embedded clip preview | [Animation](https://docs.meshy.ai/en/api/animation) |

Meshy also documents multi-image generation, remesh, conversion, UV unwrap and Text to Motion; these additional APIs are not wired in this release. Character rigging/animation is distinct from Packaging fold/unfold or the scene timeline. Supported details vary by the provider's current model/plan; errors remain visible. Calls can consume Meshy credits. No generation occurs merely by opening the workspace, changing fields or previewing a model.

## Connection and requests

Preferences → AI connections → Manage Meshy key opens a private masked entry dialog. Save key encrypts a personal credential on the server for the signed-in account. Test saved connection checks Meshy's balance endpoint without submitting a generation task. Remove key deletes Auto3D's copy; it does not revoke the key at Meshy or cancel existing provider tasks. Saved keys cannot be retrieved or revealed. Entry is interactive only: agents can open the dialog but cannot pass credentials through commands or macros.

The browser sends a key only on the explicit same-origin HTTPS save request. It is never kept in localStorage, sessionStorage, IndexedDB, preferences, recovery archives, AI projects or command arguments/results. Account changes close the dialog and clear entry; the entire dialog is excluded from workspace capture. Auto3D's server necessarily decrypts the credential in memory to call Meshy. A compromised application runtime or same-origin script could access credentials; encryption at rest is not protection from either. See [secure key setup](meshy-api-keys.md) for operational boundaries.

The proxy prefers the account's personal key. If none exists, a deployment key is used only with `AUTO3D_AI_ALLOW_SHARED_KEY=true`. An unreadable personal key or provider rejection does not silently switch to the deployment key. Browser `X-Auto3D-AI-Key` headers remain rejected. `MESHY_API_BASE_URL` is an HTTPS-only server-side override; credentialed requests refuse redirects.

Routes: GET balance; POST/GET text-to-3d, image-to-3d, text-to-image, retexture, rigging and animations; GET each task by ID. Text to 3D maps to Meshy v2, the others to v1. Allow-listed routes do not expose arbitrary upstream URLs. JSON request bodies are bounded to 28 MiB (including base64 references), upstream metadata to 4 MiB; GLB downloads stream through `/model?url=...`, restricted to HTTPS assets.meshy.ai. Private API middleware enforces account identity and same-origin writes.

Submission returns a queued task ID immediately. The shared poller respects bounded Retry-After intervals and stops on account changes, success, failure, cancellation or timeout. Refresh loads provider history without submitting tasks. Provider files may expire; refreshing history does not renew them.

## Preview, scale and persistence

Select Preview on a completed creation. The independent viewer supports orbit and zoom, original texture maps and embedded animation clips. Uniform scale applies to that AI model and is carried into Add to session and Library save. AI previews do not mutate the main scene. After decoding a multi-part GLB, drawable parts appear across successive frames; the file is decoded once and node/skin relationships remain intact. This is visual population, not partial network decoding.

Save project to Library explicitly downloads every completed 3D creation currently listed, including ones not previewed. It saves original GLBs plus canonical imported geometry, embedded material maps, transforms, task names and types inside the existing portable `.auto3d` archive format. Pending tasks and generated image bytes are not saved. A failed model download stops saving instead of producing a silently incomplete project. A reopened AI project can be saved again; signed URLs are not required to reopen its downloaded models. Provider actions on an old task may still fail after Meshy expires that task.

Open AI project accepts an AI `.auto3d` file. `ai.project.open_library` opens an owned Library archive in the AI workspace without replacing the main session. Normal Library Open/Add also works with these project archives. Add to session appends the selected preview with textures and scale and uses existing one-step Undo/rollback. All downloads, saves and handoffs check account identity; account initialization clears the previous account's AI project.

## Agent commands

`ui.ai`, `ui.module.mode`, `ai.workspace.inspect`, `ai.creations.refresh`, `ai.creation.preview`, `ai.creation.scale`, `ai.creation.add`, `ai.creation.refine`, `ai.reference.open`, `ai.generate`, `ai.project.save`, `ai.project.open_library`, `ai.project.open_file`. The file command opens an interactive picker; generation and project saving are explicit writes. Generation fields use the same service as the UI; reference upload remains interactive.

Validation uses mocked provider responses and actual textured/animated GLBs. No paid live generation was submitted in development.

Personal key commands: `ai.connection.open` (interactive), `ai.connection.inspect` (status only), `ai.connection.test` (balance), and `ai.connection.remove` (explicit account mutation).
