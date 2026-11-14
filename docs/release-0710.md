# Auto3D 0.71.0 — AI creations: delete, multi-select, Add/New, thumbnail size, download feedback

Primary Products remains 0.15.0, Packaging remains 1.10.7 and Molded Pulp remains 0.1.0. Based on main after #127 (0.70.0).

## Change

- **Delete.** Each card in Latest creations has a delete button (×). Deleting asks for confirmation, then removes the creation at Meshy and from the list. The proxy now accepts `DELETE /api/ai/<route>/<id>`. With the shared organization key, an account can delete only its own creations (others return 404 before Meshy is called), and deleted tasks leave the account's ownership list. A task Meshy no longer has counts as deleted. Running tasks cannot be deleted.
- **Multi-select.** Each card has a checkbox. While creations are checked, the Latest creations bar shows the count, **Select all**, **Delete selected** and **Clear**.
- **Add / New on hover.** Completed 3D models show **Add** (add to the current session) and **New** (open in a new session tab) over the thumbnail. On touch screens the buttons stay visible.
- **Download feedback.** Adding a model shows an animated message over the main viewer: download progress (percent when the size is known), then *Added "name" to the session*, or the error. Import and Add to session show the same message.
- **Thumbnail size.** The extended view has a **Thumbnails** slider (72–240 px card width, remembered on this device). Below 120 px the cards drop the meta line and Preview button to fit more.
- **Latest creations bar** is about half its previous height and stays in view while the cards scroll.
- Multi-image to 3D models made from generated reference views are named after the views' prompt.
- Scrolling to a newly queued creation rounds outward to whole pixels, so the card always ends fully in view (the browser's nearest-edge scroll could stop a fraction of a pixel short).

## Agent commands

New:
- `ai.creations.delete { ids }`: explicit and permanent; the UI confirms first.
- `ai.creations.select { ids, checked? }`.
- `ai.creations.clear_selection`.
- `ai.creation.import { id, target : current | new }`.
- `ai.creations.thumbnail_size { size }`.

`ai.workspace.inspect` reports `checked` and `thumbnailSize`.

## Validation

- **Live check of 0.69.0 against Meshy**, using the deployed code path (real Pages Function code, shared-key path, real Meshy API):
  - *Generate reference views from prompt* filled 3 reference slots in 15 s (3 credits).
  - Multi-image to 3D from those views succeeded in 120 s (30 credits).
  - No page errors.
- **Unit tests:**
  - the delete route: ownership with the shared key, forgetting the task, Meshy 404, provider errors;
  - client deletion: partial failures, running tasks refused, selection, preview and reference cleanup, confirmation cancel;
  - multi-select and thumbnail-size validation;
  - Add and New sharing one path, including the new session;
  - single-download progress.
- **New browser test `ai-creations.mjs`** (added to the CI suite):
  - hover Add with the main-viewer message and New in a new tab;
  - checkbox selection, cancelled and confirmed multi-delete, single delete;
  - the 96 and 220 px thumbnail sizes;
  - a Latest creations bar of 30 px or less.
