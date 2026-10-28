# Auto3D 0.44.0 / Packaging 1.10.2

Fold/unfold camera framing now follows the current pose, keeping the compact
box closer while leaving enough room for the larger unfolded shape. It still
eases from the current view and respects camera keyframes and manual takeover.
The manual fold slider stops any in-flight camera tween and does not change the
camera, so close-up inspection stays in place. Manual timeline seeking also
suppresses automatic fold framing; authored camera keyframes retain their
existing behavior. Focus object uses the selected object's visible world-space
bounds, including its current fold preview.

Increases the light/dark contrast of exposed corrugated media, including
multiwall layers. Removes the selected-box heading, repeated object description,
dimension summary, measurement-layer shortcut and repeated explanatory text
from Packaging Gen. Selected-box dimensions, tolerance and board controls
remain available; CAD Measurement remains available in Packaging Designer.
