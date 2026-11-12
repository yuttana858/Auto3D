# Auto3D 0.62.0 — Meshy workflows, revisions and AI viewer

Packaging remains 1.10.7; Primary Products remains 0.12.0. Based on main after merged PR #103 (0.61.0). Not deployed.

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

## Shared organization key

An administrator can now save one **shared Meshy key** for everyone: Preferences → AI connections → Manage Meshy key → *Shared key for all accounts*. The section is shown only to administrators (the Supabase `auto3d_admin_emails` list), and the server re-checks administrator access on every save or removal (`/api/ai/shared-credential`).

- **Storage.** Encrypted with AES-256-GCM in the private credentials R2 bucket under `meshy/shared/v1/organization`, outside every account's namespace and bound to that path. It is never returned to any browser, command, log or archive.
- **Use.** The Cloudflare Pages Function chooses, per request: the account's personal key, then the shared key, then the optional `MESHY_API_KEY` deployment secret when `AUTO3D_AI_ALLOW_SHARED_KEY=true`. An unreadable shared record fails closed.
- **Limits.** Shared-key use is limited to 20 generations per account per hour, and each account sees only its own shared-key creations.
- **Commands.** `ai.shared_connection.inspect` (status) and `ai.shared_connection.remove` (administrator). Saving is interactive only.

Group keys (one key per group of users) are future work. They would add a group credential between the personal and shared keys in `MeshyCredential` (`functions/_lib/aicredentials.js`), stored the same way and resolved from Supabase group membership.

## Validation

See the pull request for unit, browser and live Meshy results.

## Not included

Remesh, format conversion, resize, UV unwrap, 3D-print and relief APIs; Meshy's free geometry retry (not in its public API); placing 2D images in the main 3D scene.
