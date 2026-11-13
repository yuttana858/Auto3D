# Auto3D 0.66.1 / Packaging 1.10.7 / Primary Products 0.15.0

After the complete packaging and material study, the landing animation fades out for one second, holds an empty window for two seconds, then restarts the introduction. The full loop is 44 seconds. The camera, geometry, artwork, material callouts and existing sign-in flow retain their preceding behavior.

The scene heading and entire rendering overlay share one timeline-driven opacity value, so the box, leaders and prompt fade together. Pause freezes the fade or blank hold; replay and stage selection restore the visible view. Reduced motion and unavailable-WebGL fallback use the completed review position, avoiding a blank initial still. The sign-in area and playback controls remain available throughout.

Sequence checks cover the fade midpoint, exact two-second hold, restart and visible stage positions. Desktop/mobile browser checks cover rendered opacity, pause during fading, an empty hold with sign-in visible, automatic loop restart and the existing printed-material review. Production verification checks the deployed fade hook in both JavaScript and CSS.
