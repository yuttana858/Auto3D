# Auto3D 0.58.2 — compact design drawer header

Primary Products 0.9.1; Packaging remains 1.10.7. Based on main after merged PR #97 (0.58.1). Not deployed.

**Header.** The design drawer header is one compact row.
- **Order:** the W, L and H inputs come first on the left, with their labels inline instead of above. The status message sits beside them, followed by the category name and Close on the right.
- **Size:** the category title is smaller, and the header padding and Close button are tighter.

**Status.** The drawer no longer shows the generic "Product action completed." text. It shows only meaningful results, such as a live resize ("Resized selected product to …") or an error. The main panel status is unchanged.

**Thumbnails.** Design thumbnails no longer draw W/L/H bracket callouts. Each card keeps its W × L × H caption. Callouts remain on the panel's profile drawing and on generated 3D products.

Validation: application lint, 805 app/module tests and the `primary-products` browser test pass. The test checks that cards have no callouts, the W/L/H inputs start at the drawer's left edge, the category name follows them, and the header is at most 40 px tall.
