# Auto3D 0.78.0 — Image to 3D drop zone and Auto Pack for arrays

Auto3D 0.78.0 / Packaging 1.12.0 / Primary Products 0.15.0 / Molded Pulp 0.1.0. Based on main after #138 (0.77.0). The module versions are unchanged: this release only changes host code. Not deployed.

## Auto Pack packs a selected array or group

**The problem:** clicking any model in an array selects the whole array. Auto Pack required exactly one selected object, so it showed no product and the **Auto Pack** button stayed disabled.

**The fix:**
- **One product.** Auto Pack now treats the selection as one product: the selected object plus the rest of its group or array, up to 500 objects. The RSC is fitted around their **combined world bounds**, with the same 0.0254 mm clearance per face, and the panel names it *Array group of … · N products*.
- **Saved members.** The carton's saved metadata adds `productIds`, which lists every member. Older cartons with a single `productId` still replay.
- **Guards cover every member.** Moving, removing or animating any member blocks Fold/Unfold replay and asks you to generate Auto Pack again, as it did for a single product.
- **Plain FEFCO boxes can be packed** (for example shippers inside a master case). Only fitted Auto Pack cartons and pallets are refused in the selection.
- **Agents:** `packaging.auto.inspect` and `packaging.auto.generate` return `objectIds` and `productIds`, and their descriptions mention groups.

## AI Generative: Image to 3D drop zone and automatic preview

- **Drop zone.** Choosing **Image to 3D**, or Multi-image to 3D, turns the AI viewer into an upload target until a reference image is chosen. It reads *Drop an image here · or click to browse · Ctrl+V to paste*. Clicking it, or pressing Enter or Space on it, opens the image picker.
- **Drag and drop.** An image file dropped anywhere on the viewer becomes the reference; in Multi-image to 3D it is added as another view. The viewer is outlined while a file is dragged over it.
- **Ctrl+V paste.** While the AI panel is open in those types, pasting an image from the clipboard sets the reference, named *pasted image.png*.
  - Pasting text into the prompt fields still pastes text.
  - Pastes are ignored in the other generation types.
- **After a reference is set,** the viewer shows the image. **Clear** brings the drop zone back.
- **Automatic preview.** When a generation submitted from this window finishes, it opens in the viewer by itself: the model for 3D types, the image for image types. This doesn't happen if a newer submission has taken over the progress display. The progress line now reads *Complete · opened in the viewer*.
- **Agents:**
  - `ai.reference.add_image { dataUrl, name? }` follows the same path as drop and paste, with a base64 PNG, JPEG or WebP. It switches to Image to 3D if needed and does not submit anything.
  - `ai.workspace.inspect` reports `dropZone`.

## Validation

- lint and lint_mcp pass.
- **952** unit tests pass. These include a new Auto Pack array test, which checks:
  - combined bounds of three products;
  - `productIds` in the saved carton;
  - the saved-fit label;
  - replay blocked after moving one member;
  - the carton refused inside the selection.
- **72** MCP tests and **73** Packaging module tests pass.
- Website and Pages builds pass.
- **Browser tests:**
  - **`packaging-auto-pack`** is extended: it creates a 3 × 1 × 1 array, selects one member and checks that Auto Pack sees all 3 products with the button enabled.
  - **New `ai-image-dropzone`** (added to CI) checks:
    - the drop zone appears only for Image to 3D;
    - paste is ignored in Text to 3D;
    - Ctrl+V paste sets the reference;
    - Clear brings the drop zone back;
    - drag and drop works;
    - the agent data URL works and non-images are rejected;
    - the generated model opens in the viewer without pressing Preview.
  - `ai-progress` (updated for the new completion text), `ai-creations`, `ai-extended` and `ai-credentials` pass.
