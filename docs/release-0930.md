# Auto3D 0.93.0 candidate: macro timing

Recorded macro steps accept an optional animation duration and pause. The macro builder applies timing edits as they are typed and validates their range. Agents can supply `animation.duration` and `animation.pauseAfter` on version 1 macro steps; see [agent-interface.md](agent-interface.md). Timing affects recordings, not ordinary macro runs.

The timeline does not record or replace the application's lighting configuration. The existing session lighting and viewer behavior continue to apply during playback and export.

This is a stacked candidate, not deployed. Steps remain sequential; automatic recording of creation, deletion, procedural folding, clips, material and lighting changes is not supported. Array reveal, fold actions and embedded clips can be authored separately on the timeline.
