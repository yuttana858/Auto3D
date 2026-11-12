# AI Generative workspace

Auto3D 0.40.0 introduced, and 0.62.0 extends, a same-origin Meshy proxy under `/api/ai/*`. The independent AI workspace supports minimal docked mode and a full-viewport extended modal: interactive model preview in the center, previous creations along the bottom, inputs on the right and Add to session at the top left. Background buttons, navigation and scene keyboard shortcuts cannot receive modal interactions. Closing/minimizing preserves the project for the current account/session.

## Meshy capabilities reviewed 2026-11-12

Checked against Meshy's published OpenAPI contract (`docs.meshy.ai/openapi.json`) on 2026-11-12.

| Workflow | Auto3D behavior | Official API |
| --- | --- | --- |
| Text to 3D | Preview with detail budget, then **Texture** (refine) with PBR, resolution and an optional texture prompt; GLB output | [Text to 3D](https://docs.meshy.ai/en/api/text-to-3d) |
| Image to 3D | PNG/JPEG/WebP reference or selected generated image; textured GLB; optional texture prompt | [Image to 3D](https://docs.meshy.ai/en/api/image-to-3d) |
| Multi-image to 3D | 2–4 uploaded views of one object (20 MB total) or a selected generated image task (for example a 4-view image); textured GLB; optional texture prompt | [Multi-Image to 3D](https://docs.meshy.ai/en/api/multi-image-to-3d) |
| Text to Image | Ten current image models; aspect ratios filtered per model (3:2 and 2:3 only on GPT Image); optional 4-view image or background removal | [Text to Image](https://docs.meshy.ai/en/api/text-to-image) |
| Image revision | Revise a generated image with an edit prompt (Image to Image from the original task) | [Image to Image](https://docs.meshy.ai/en/api/image-to-image) |
| Retexture | Selected completed model, text or image style, PBR and texture resolution, original UVs | [Retexture](https://docs.meshy.ai/en/api/retexture) |
| Rigging | Selected textured humanoid, character height in meters | [Rigging](https://docs.meshy.ai/en/api/rigging) |
| Animation | Completed rig plus an animation action ID; embedded clip preview | [Animation](https://docs.meshy.ai/en/api/animation) |

**Assisted prompts are not available through the API.** Meshy retired its Prompt Helper; prompt writing help now lives in the Meshy web app's 3D Agent, which has no public API. Auto3D does not imitate it.

Meshy also documents remesh, conversion, resize, UV unwrap, 3D-print and relief APIs; these are not wired. Multi-image to 3D has no Smart Topology model, so Smart detail presets use the standard pipeline at the same face budget there. Supported details vary by the provider's current model/plan; errors remain visible. Calls consume Meshy credits. No generation occurs merely by opening the workspace, changing fields, choosing reference images or previewing.

## Revisions

**Revise** on a completed creation puts its prompt in the prompt box; edit it and choose **Submit revision**. Every revision is a new paid task shown beside the original, marked *Revision* in history; the original is never modified.

| Revised creation | What is resubmitted |
| --- | --- |
| Text to 3D preview | A new preview from the edited prompt |
| Textured Text to 3D model | A new texture pass (refine) on its preview, with the edited texture prompt. Models whose preview is not in history cannot be revised this way. |
| Generated image | Image to Image from the original image with the edit prompt |
| Image / multi-image model | A new model from the same input images (`input_task_id`), with the prompt as texture guidance |
| Texture (retexture) | A new retexture of that model with the edited style prompt |

Meshy's free geometry retry in its web app is not in the public API.

## Viewer

The AI viewer shows 3D models and 2D images in the same area.

- **3D:** neutral studio image-based lighting (room environment), ACES filmic tone mapping and sRGB output, with a soft key and fill light. This is the same approach Meshy uses for PBR previews; Meshy does not publish its exact lighting rig, so this is consistent rather than pixel-identical. Drag orbits, right-drag or Shift/Ctrl+drag pans, the wheel or a pinch zooms toward the cursor.
- **2D:** generated images, 4-view images and selected reference images. Wheel or pinch zooms toward the pointer, drag pans, double-click fits, and a strip switches between views.
- **Buttons:** −, Fit and + work in both modes (`ai.viewer.control`).

History thumbnails are Meshy's signed thumbnail URLs. They expire; an expired or failed thumbnail shows a labelled placeholder instead of a broken image, and **Refresh** renews it. A model's rendered preview is kept as its thumbnail when Meshy provides none.

## Connection and requests

Preferences → AI connections → Manage Meshy key opens a private masked entry dialog. Save key encrypts a personal credential on the server for the signed-in account. Test saved connection checks Meshy's balance endpoint without submitting a generation task. Remove key deletes Auto3D's copy; it does not revoke the key at Meshy or cancel existing provider tasks. Saved keys cannot be retrieved or revealed. Entry is interactive only: agents can open the dialog but cannot pass credentials through commands or macros.

The browser sends a key only on the explicit same-origin HTTPS save request. It is never kept in localStorage, sessionStorage, IndexedDB, preferences, recovery archives, AI projects or command arguments/results. Account changes close the dialog and clear entry; the entire dialog is excluded from workspace capture. Auto3D's server necessarily decrypts the credential in memory to call Meshy. A compromised application runtime or same-origin script could access credentials; encryption at rest is not protection from either. See [secure key setup](meshy-api-keys.md) for operational boundaries.

The proxy prefers the account's personal key, then the administrator-saved shared organization key (encrypted in the same private bucket, see [release-0620.md](release-0620.md#shared-organization-key)), then a deployment key only with `AUTO3D_AI_ALLOW_SHARED_KEY=true`. Shared keys are limited to 20 generations per account per hour and each account sees only its own shared-key tasks. An unreadable personal key or provider rejection does not silently switch to the deployment key. Browser `X-Auto3D-AI-Key` headers remain rejected. `MESHY_API_BASE_URL` is an HTTPS-only server-side override; credentialed requests refuse redirects.

Routes: GET balance; POST/GET text-to-3d, image-to-3d, multi-image-to-3d, text-to-image, image-to-image, retexture, rigging and animations; GET each task by ID. Text to 3D maps to Meshy v2, the others to v1. Allow-listed routes do not expose arbitrary upstream URLs. JSON request bodies are bounded to 28 MiB (including base64 references), upstream metadata to 4 MiB; GLB downloads stream through `/model?url=...`, restricted to HTTPS assets.meshy.ai. Private API middleware enforces account identity and same-origin writes.

Submission returns a queued task ID immediately. The shared poller respects bounded Retry-After intervals and stops on account changes, success, failure, cancellation or timeout. Refresh loads provider history (Text to 3D, Image and Multi-image to 3D, images, image revisions and textures; up to 24) without submitting tasks. Provider files may expire; refreshing history does not renew them.

## Preview, scale and persistence

Select Preview on a completed creation. The independent viewer supports orbit and zoom, original texture maps and embedded animation clips. Uniform scale applies to that AI model and is carried into Add to session and Library save. AI previews do not mutate the main scene. After decoding a multi-part GLB, drawable parts appear across successive frames; the file is decoded once and node/skin relationships remain intact. This is visual population, not partial network decoding.

Save project to Library explicitly downloads every completed 3D creation currently listed, including ones not previewed. It saves original GLBs plus canonical imported geometry, embedded material maps, transforms, task names and types inside the existing portable `.auto3d` archive format. Pending tasks and generated image bytes are not saved. A failed model download stops saving instead of producing a silently incomplete project. A reopened AI project can be saved again; signed URLs are not required to reopen its downloaded models. Provider actions on an old task may still fail after Meshy expires that task.

Open AI project accepts an AI `.auto3d` file. `ai.project.open_library` opens an owned Library archive in the AI workspace without replacing the main session. Normal Library Open/Add also works with these project archives. Add to session appends the selected preview with textures and scale and uses existing one-step Undo/rollback. All downloads, saves and handoffs check account identity; account initialization clears the previous account's AI project.

## Agent commands

`ui.ai`, `ui.module.mode`, `ai.workspace.inspect`, `ai.creations.refresh`, `ai.creation.preview`, `ai.creation.scale`, `ai.creation.add`, `ai.creation.refine` and `ai.creation.generate_texture` (optional `texturePrompt`), `ai.creation.revise`, `ai.viewer.control`, `ai.reference.open`, `ai.generate` (actions include `multiimage3d`; `texturePrompt`, `multiView`, `removeBackground`), `ai.project.save`, `ai.project.open_library`, `ai.project.open_file`. The file command opens an interactive picker; generation and project saving are explicit writes. Generation fields use the same service as the UI; reference upload remains interactive.

Automated validation uses mocked provider responses and actual textured/animated GLBs. Release 0.62.0 was also verified live against Meshy; see [release-0620.md](release-0620.md).

Personal key commands: `ai.connection.open` (interactive), `ai.connection.inspect` (status only), `ai.connection.test` (balance), and `ai.connection.remove` (explicit account mutation).
