# Auto3D 0.65.0 / Packaging 1.10.7 / Primary Products 0.14.0

**Edit model** replaces the product thumbnail’s “Illustrative profile” caption. It opens a split workspace: editable profile on the left, the existing interactive 3D canvas on the right. Opening a draft without a selected primary product creates that product once. Closing restores the full viewer and previous docked panels. Narrow screens stack the two views.

Front and top profiles project the actual generated component geometry. Bottle callouts expose overall height, width/depth, neck diameter, shoulder height, neck height, cap height and rectangular corner radius. Cross-section switches between round, oval and rounded rectangle. Other product families expose overall H/W/D.

Press Enter in a dimension field to rebuild the selected model immediately. Fields follow account display units; commands use mm. Cross-section selection updates immediately. Each successful edit creates one Undo step, retains object identity/placement, custom surfaces and label artwork, and updates the saved product definition. Labels retain their physical size and offsets; edits that leave insufficient label space fail before mutation. Object transform scaling remains separate from product-space dimensions and is identified in the editor.

The workspace follows selected products and Undo/Redo, disables edits during rendering/read-only sessions, and closes on a different session/account or non-product selection. The original canvas and its navigation/selection/transform controls remain in place. CAD layer integration remains paused.

Agent/MCP commands: `primary.profile.open`, `primary.profile.close`, `primary.profile.inspect`, `primary.profile.update`. The update command works without opening UI; the open command can create one product and therefore requires write access. Catalogs are generated from the shared strict registry.

Validation covers actual-geometry projections for every family, cross-section and unit changes, validation/rollback, materials/artwork/archive preservation, Undo/Redo, strict commands and macros, plus desktop/mobile browser interaction and original-canvas navigation.
