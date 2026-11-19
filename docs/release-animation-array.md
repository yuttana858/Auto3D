# Auto3D 0.92.0 — array reveal on the timeline

Schedule existing visible objects as a staggered drop using Animation → Keyframes → Array reveal. The active object can remain in place; other selected objects follow scene-list order. Scheduled objects are hidden from the beginning until their reveal. Existing motion, visibility and fold tracks are protected. The drop uses model units and the existing array easing; timeline seeking, playback and video use the resulting native tracks. One Undo removes the scheduled tracks.

`animation.array.schedule` is available to agents. `object.array` returns copy IDs so an ordinary macro can create an array with `animate:false` and schedule those IDs via a result reference. See agent-interface.md. This is explicit timeline authoring; automatic recording of arbitrary procedural macros remains unsupported.

An independent UI/UX review informed the hidden-before-reveal warning, active-object exclusion, selected count and blocking-state feedback. Packaging 1.15.1 / Primary Products 0.15.0 / Molded Pulp 0.3.0. Candidate; not deployed.
