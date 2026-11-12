# Auto3D 0.61.0 — Meshy workflows, revisions and AI viewer

Packaging remains 1.10.7; Primary Products remains 0.11.0. Based on main after merged PR #102 (0.60.0). Not deployed.

## Change

- **Multi-image to 3D.** Upload 2–4 views of one object (PNG/JPEG/WebP, 20 MB total), or select a generated image (for example a multi-view image), and build a textured model through Meshy's `multi-image-to-3d` API. The proxy allow-lists the route; history includes these tasks.
- **Text to image** offers Meshy's ten current image models, filters aspect ratios per model (3:2 and 2:3 only on GPT Image models), and adds **multi-view image** and **Remove background** options.
- **Create textures.** A **Texture prompt** field guides the Texture (refine) pass on Text to 3D previews and the textures of Image and Multi-image to 3D models. Retexture is unchanged.
- **Revisions.** **Revise** on a completed creation loads its prompt; **Submit revision** resubmits it as a new task beside the original. Previews regenerate, textured models re-texture their preview, images are edited with Image to Image, image/multi-image models rebuild from the same input images, and textures re-texture the model. See [AI Generative](ai-generative.md#revisions).
- **AI viewer.** 3D previews use neutral studio image-based lighting with ACES filmic tone mapping (the approach Meshy uses; its exact rig is not published). Pan joins orbit and zoom, zoom follows the cursor, and −/Fit/+ buttons work in both modes. A new 2D viewer shows generated images, multi-view sets and chosen reference images with zoom-to-pointer, pan, double-click fit and a view strip.
- **Thumbnails.** Expired or failed Meshy thumbnail links show a labelled placeholder instead of a broken image; Refresh renews them and keeps locally rendered thumbnails.
- **Import into Auto3D** remains **Import** on a completed model card, or Add to session for the previewed model.

## Assisted prompts

Not available. Meshy retired its Prompt Helper; prompt help is now only in the Meshy web app's 3D Agent, which has no public API.

## Agent commands

New: `ai.creation.revise { id, prompt }` (paid resubmission) and `ai.viewer.control { action : fit | zoomIn | zoomOut | select, value }`. `ai.generate` adds the `multiimage3d` action and `texturePrompt`, `multiView` and `removeBackground` fields, plus the new image models and aspect ratios. `ai.creation.refine` and `ai.creation.generate_texture` accept an optional `texturePrompt`. `ai.reference.open` now selects 1–4 images. `website/assets/commands.json` and the MCP catalog are regenerated.

## Who can generate

Every signed-in account can generate with the deployment's shared Meshy key when it has no personal key, provided the Pages environment has the `MESHY_API_KEY` secret and `AUTO3D_AI_ALLOW_SHARED_KEY=true`. The shared key is limited to 20 generations per account per hour, and each account sees only its own shared-key tasks. A personal key saved in Preferences still takes precedence.

Group keys (one Meshy key for a group of users) are future work. The intended design adds a group credential between the personal and deployment keys in `MeshyCredential` (`functions/_lib/aicredentials.js`), stored encrypted like personal keys and resolved from Supabase group membership, with task ownership scoped to the group.

## Validation

See the pull request for unit, browser and live Meshy results.

## Not included

Remesh, format conversion, resize, UV unwrap, 3D-print and relief APIs; Meshy's free geometry retry (not in its public API); placing 2D images in the main 3D scene.
