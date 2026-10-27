# Auto3D 0.40.0 · Packaging 1.9.0

Extended modules now occupy the full application viewport, sliding in from the left. A native modal shell blocks underlying pointer/focus interaction and contains keyboard events, including scene shortcuts. Minimal and Close restore each module's body/header to its original dock without recreating its controls. Reduced-motion preferences skip the slide. AI, Packaging, upload and Model data use the same shell; their content remains independently owned.

AI extended mode has an independent interactive 3D viewer in the center, creation history below, generation inputs on the right and Add to session / Save project to Library at the top. Small screens stack these regions. The preview uses the application's Three.js dependency, supports Draco/Meshopt and original PBR textures, plays embedded clips and retains a per-model uniform scale. The main scene remains unchanged until Add to session.

Meshy requests now cover Text to 3D preview/refine, Image to 3D, Text to Image, Retexture, humanoid Rigging and Animation. Each uses shared submission, task normalization and polling. Agent commands expose the same operations with strict schemas. References can be uploaded locally; a generated image can supply Image to 3D. Generation is an explicit provider-credit action. No production generation credits were used during development validation.

Library saves download all completed 3D models shown in creation history and create a portable `.auto3d` project with original GLBs, embedded material maps and uniform scales. Pending tasks and generated reference-image bytes are not archived. AI projects can reopen through the AI file picker or `ai.project.open_library`, or open as a normal Library session. Saves never rely solely on expiring provider URLs. Project append uses existing scene history/rollback. Account changes during download/archive/thumbnail preparation stop the operation.

A shared archive bug treating the boolean `multiplyDiffuseMap` as a texture object is corrected; textured GLBs now survive archive reopen/append. The animation loader permits its own embedded blob texture URLs.

Large multi-part GLBs must finish download/decode before they can be displayed. Drawable parts then populate the preview across successive frames while retaining node transforms and skins; this is not network streaming of independent GLB parts. Separate completed task models download serially during project saving. Supplier board records and Packaging geometry are unchanged.

Validation: 673 unit/module tests, focused AI and independent-module browser integrations on desktop/mobile, lint, website, standalone Packaging and Pages builds pass. Browser checks use real textured and skeletal/morph GLB fixtures with mocked Meshy/account endpoints; live provider credit spending and deployed API behavior remain to be checked after release. See `project-status.md` for final results and PR.
