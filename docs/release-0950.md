# Auto3D 0.95.0 candidate: procedural macro recording

Recorded macros can schedule box fold actions (`packaging.fefco.animate` or `animation.action.add`) and paused imported clips (`animation.clip.add`) in sequence on the existing timeline. Their start time comes from the step order; duration uses the step animation override or command duration. Fold preparation performs the existing clearance checks. Recorded actions share undo, seeking and export behavior with authored timeline actions. See [agent-interface.md](agent-interface.md).

The existing lighting configuration remains in effect. This stacked candidate is not deployed. Steps remain sequential and automatic recording of creation, deletion, material changes and procedural arrays remains unsupported.
