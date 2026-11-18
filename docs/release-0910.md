# Auto3D 0.91.0 — embedded clips on the timeline

Select a model with a paused embedded clip, open Animation → Keyframes → Embedded clip, move the playhead, choose the clip, timeline duration, speed and looping, then add it. Its object track shows a clip span. Clips on the same object cannot overlap. Before the first action the paused baseline is shown; after an action the final sampled frame is held. Timeline seeking, playback and video export use the same scheduled time. Remove actions in the timeline editor or with `animation.clip.delete`; undo and session/recovery archives preserve them.

Agents use `animation.clip.add`, `animation.clip.delete` and `animation.timeline.inspect`. An independent UI/UX agent reviewed the control labels, disabled states and timeline span. Objects without scheduled clip actions retain their existing independent clip and legacy export behavior. Auto-recording of procedural macro steps, arrays and model creation/deletion remain future work.

Packaging 1.15.1 / Primary Products 0.15.0 / Molded Pulp 0.3.0. Candidate; not deployed.
