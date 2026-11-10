# Auto3D 0.57.0 — parametric product design drawer

Primary Products 0.8.0; Packaging remains 1.10.6. Based on main after merged PR #94 (0.56.1). Not deployed.

**Design drawer.** The bottom design drawer is 30% shorter (at most 31.5% of the viewport instead of 45%). Design cards are equal-size buttons in a grid of at most ten per row (never narrower than 116 px). Each card shows its name and overall size as W × L × H, with the description in its tooltip. Clicking a card now selects that design and generates it as one undoable scene object (`primary.designs.generate`). Previously it only loaded the draft. A card still refuses, with the reason in the drawer, when the current label art cannot fit the new product.

**Callout brackets.** Every design thumbnail and the main profile drawing show bracket dimension callouts for W, L and H. Round products use their diameter for both width and length. Pouches and clamshells use width and front-to-back depth.

**Parametric, live dimensions.** The dimension fields are now Width, Length and Height (W × L × H) in the panel and in the drawer header, and accept manual input in mm or inches.
- Pressing Enter in any of them updates the draft. If a generated product of the same family is selected, it is rebuilt live with the new dimensions in one Undo step, keeping its identity, placement and materials.
- Tab or blur updates only the draft.
- `primary.dimensions.set` (`widthMm`, `lengthMm`, `heightMm`, optional `apply`) is the same shared function for agents. For round products, width and length must match because they are one diameter.

**Catalog.** The catalog grows from 24 to 30 illustrative designs: pint utility can, mini beverage can, coffee pillow pack, bar wrapper, slim retail shell and produce shell. Dimensions remain illustrative; verify against supplier drawings.

**Browser CI.** `ai-extended` joins the CI browser job (65 tests). Its flakiness came from `page.waitForFunction` with an async predicate: Playwright treats the returned Promise as truthy and resolves at once. So the test continued from AI tasks still pending, and a fixed 1 s sleep guessed when the debounced IndexedDB save finished. It now polls task state and the persisted workspace. It passed 5/5 serially and 17/17 under heavy CPU load. The same no-op wait existed in eight other tests (accounts, board-database, cad-apply, fold-actions, packaging-cleanup, packaging-measurements, packaging-presets, viewport-preferences); those now poll in the page with a 120 s limit. No assertion was loosened, and no product bug was found.

**Limits.** Callouts are drawn on the thumbnails and the 2D profile reference, not as 3D scene annotations. Scene dimension brackets (`dimensions.add`) remain available for straight model edges.

Validation: application lint, the nine browser tests above, Primary Products unit tests (new W × L × H mapping coverage) and the `primary-products` browser regression pass. The browser test covers a ten-column grid at 2400 px, equal card sizes, drawer height, callouts, card generation, Enter resize with Undo/Redo, Tab draft-only, `primary.dimensions.set` and `primary.designs.generate`.
