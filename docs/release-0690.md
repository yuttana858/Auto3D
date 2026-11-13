# Auto3D 0.69.0 — mode-first AI Create panel

Primary Products remains 0.15.0, Packaging remains 1.10.7 and Molded Pulp remains 0.1.0. Based on main after #123 (0.68.0).

## Change

- **Choose the generation type first.** The Create panel opens with five type buttons: **Text to 3D**, **Image to 3D**, **Multi-image to 3D**, **Text to image** and **Texture**. Below them it shows only the inputs that type uses, and the Generate button says what it will make.

| Type | Inputs | Button |
| --- | --- | --- |
| Text to 3D | Prompt; texture prompt (used when you texture the preview); 3D detail; PBR and texture resolution | Generate 3D preview |
| Image to 3D | One reference image (or the selected generated image); supporting text; 3D detail; PBR and texture resolution | Generate 3D model |
| Multi-image to 3D | Optional prompt and image model to generate reference views; up to 4 reference views from uploads and generated views; supporting text; 3D detail; PBR and texture resolution | Generate 3D model |
| Text to image | Prompt; image model; aspect ratio; remove background | Generate image |
| Texture | Selected 3D model; texture prompt or style image; PBR and texture resolution | Generate texture |

- **Uploading no longer switches the type.** Before, an uploaded image silently switched generation to Image to 3D or Multi-image to 3D.
- **Revise** keeps working from any type: it shows the prompt and a Submit revision button.
- **Model scale** moves to a *Selected model scale* row at the bottom of the panel.

## Reference views replace the "4-view image" checkbox

The Text to image **4-view image** checkbox is removed. Meshy's multi-view option returns *"one URL per view, usually three"* (front, side, back). It does not return four. On symmetrical objects such as mugs, those views can look like copies.

Multi-view is now always used for reference views, in **Multi-image to 3D**:
- **Generate reference views from prompt** runs Meshy's multi-view Text to image and fills the reference slots.
- You can add uploads beside them, up to **4 reference views** in total, so a 4th view can be uploaded. Each slot shows a thumbnail with remove (×) and **Clear** controls, and the views also open in the AI image viewer.
- **How views are sent to Meshy:** views from one generated task go by task ID. Uploads, or uploads mixed with generated views, go as image URLs (uploads as data URIs, generated views as Meshy asset URLs).

Text to image is now always a single image, with the aspect ratio and remove-background options.

## Agent commands

New:
- `ai.mode.set { mode }` selects the generation type.
- `ai.reference.generate_views { prompt, imageModel? }` is a paid submission.
- `ai.reference.clear` removes all references.

`ai.workspace.inspect` reports `mode` and the total reference count. `ai.generate` still accepts `multiView` for compatibility. `website/assets/commands.json` and the MCP catalog are regenerated.

## Validation

- 877 unit tests, lint and 66 MCP tests pass. New tests cover:
  - Generate enabling only when the chosen type has its inputs;
  - that an upload does not change the type;
  - generating views, then sending them by task ID, or mixed with an upload as image URLs;
  - the 4-reference limit.
- The browser test `ai-extended.mjs` passes. It now checks that each type shows only its fields, that the 4-view checkbox is gone, and the generate, show and clear flow for reference views.
