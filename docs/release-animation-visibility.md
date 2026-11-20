# Auto3D 0.90.0 — object visibility and lifetime

Existing models can be shown or hidden with discrete timeline keys. In Animation → Keyframes → Object visibility, select a model and add show/hide keys at the playhead, or set a show-from/hide-at lifetime. Setting a lifetime replaces that object's visibility keys; clearing them restores ordinary editor visibility. Both operations are undoable. Visibility is a playback presentation; models remain in the session. Object tracks display the keys and a legend.

`animation.visibility.inspect`, `animation.visibility.keyframe`, `animation.visibility.lifetime` and `animation.visibility.clear` provide agent access. Macro recording supports `object.visibility` and records visibility alongside transform/camera states. Session and recovery archives retain tracks. Creation/deletion of models and other procedural or material events are not recorded; see agent-interface.md.

An independent UI/UX agent reviewed the implementation; selected-object context, local feedback, safe selection changes, clearer key counts and marker focus/legend were added. Final visual checks are documented with the PR.

Packaging 1.15.1 / Primary Products 0.15.0 / Molded Pulp 0.3.0. Candidate; not deployed.
