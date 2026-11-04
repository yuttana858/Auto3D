# Auto3D 0.48.0 / Packaging 1.10.3 / Primary Products 0.1.0

Adds Primary Products below Packaging in the outlined generation-module rail. Its compact right panel and full-viewport extended workspace include bottle/can cards, dimensions, draft surface settings and label zones, with an illustrative profile. The shared panel controller supplies opt-in entry/exit motion, cancellation of superseded transitions and reduced-motion support. Closing/minimizing preserves the draft; account changes clear it.

This release is the UI shell from the approved bottles-and-cans-first plan. It does not generate models or accept artwork yet; Add to session is disabled and the UI states that generation is coming next. Scene objects, camera, files and account storage are unchanged by panel interactions.

The module is independently built, lazily loaded and covered by deployment asset hashes. `ui.primary_products`, `primary.inspect`, `primary.configure`, `primary.reset` and shared `ui.module.mode` commands use the same guarded services as the UI. Packaging remains 1.10.3. See primary-products-ui.md and primary-products-build-plan.md.
