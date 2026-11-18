# Auto3D 0.89.0 — macro animation foundation

Commands & macros can run and record a supported macro as sequential object-transform and camera keyframes on an empty timeline. Advanced animation has collapsible scene, camera, action, and individual object tracks. Agent commands include `animation.macro.record`, `animation.tracks.inspect` and `animation.tracks.expand`; see agent-interface.md for the complete workflow and restrictions.

This is not a complete recording system for arbitrary demo macros. Creation, deletion, visibility, materials, arrays, embedded/procedural animation, and timing synchronization need further timeline representation and preflight work. Unsupported macro steps are rejected before mutation.

Packaging 1.15.1 / Primary Products 0.15.0 / Molded Pulp 0.3.0. Candidate; not deployed.
