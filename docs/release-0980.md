# Auto3D 0.98.0 candidate: macro-to-video workflow

The Animation panel connects saved macros to the shared Advance Animation timeline and the existing video exporter. Users can choose a macro, run and record it, inspect the editable tracks, and explicitly render and download a video. The command bar accepts `run Demo macro and record` and `record macro Demo`; agents use `animation.workflow.record`. The timeline must be empty and stopped, embedded clips paused, and macro steps supported.

Video is rendered frame by frame with the existing scene and lighting, not captured from the screen. It has no audio; 4K and codec availability depend on browser and hardware. Unsupported macro steps are not silently recorded. See [agent-interface.md](agent-interface.md). Not deployed.
