# Auto3D 0.64.3 / Packaging 1.10.7 / Primary Products 0.13.0

The landing hero keeps its close opening motor view, then pulls back in two deliberate steps. The motor's projected size becomes 50% of the opening size while molded pulp appears, then 35% while the carton appears. The original motor defines all three centered views, so folding panels cannot trigger extra zoom changes.

Both camera moves ease over 1.4 scene seconds (about one second of playback): pulp at scene time 3.8–5.2 and carton at 7.2–8.6. The box view holds through folding and cutaway. Pause, replay, stage selection, reduced motion and viewport resize use the same deterministic timeline. Large unfolded panels may still crop; the 35-second sequence, banner entrance, sign-in and module geometry remain in place.

Camera regressions check actual projected sizes and centering, smooth monotonic transitions, paused state, viewport resizing and independence from folding geometry. Desktop/mobile presentation tests check all four stages alongside the existing entrance and prompt sequence.
