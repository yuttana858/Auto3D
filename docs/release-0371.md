# Auto3D 0.37.1 / Packaging 1.7.1

[PR #38](https://github.com/yuttana858/Auto3D/pull/38), a stability patch based on merged PR #37; Packaging API v1 retained. This patch is not merged or deployed.

Toggling Enable board surface previously rebuilt the entire scene and repeated fold-preview preparation/clearance audits, causing avoidable stalls in arrays and posed boxes. Enable/bow/fold-softness/cut-compression now refresh the selected object's GPU buffers in place, preserving its current fold pose, camera, textures, other scene objects and authoritative dimensions. Undo/Redo uses the same locked path; failed updates restore the previous profile/display. Disabling restores rigid geometry. Paper grain remains independent and uses the existing material refresh path.

Crease buffers are consistently sorted by material, reducing replacement-buffer draw groups to at most three per crease. Preview material lookup uses original document indices so materials remain consistent after import or array creation.

Validation: 626 unit/module tests, 11 backend tests and lint pass; both engine builds, website, independent module and Pages builds pass. Focused tests cover repeat toggles, disposal, pose retention, locking, history and rollback. Chromium exercises six toggles on a four-box array with an intermediate fold pose and checks exact placements/CAD, camera, history and WebGL context. No general FPS guarantee or confirmed diagnosis of an unprovided crash log is claimed.

White-viewer follow-up: identical static boxes share GPU surface buffers, while individual edits detach safely. The lighting/shadow inspector adds resource counts. Pixel checks of the actual surface panel pass with ordinary and reflected/shadowed lighting, including grain refresh and an intermediate fold pose. The reported production white screen remains unreproduced; the exact scene/version/error log is still needed.

A 20-box Chromium resource check holds at 63 geometries and 32 textures during repeated selected-box edits, with no context loss. These fixture counts are evidence of bounded allocation, not device-independent budgets.
