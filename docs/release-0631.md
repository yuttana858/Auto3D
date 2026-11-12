# Auto3D 0.63.1 / Packaging 1.10.7 / Primary Products 0.13.0

The landing animation now fills more of its window and keeps the visible product-and-packaging assembly in the middle. The camera fits actual rendered surface vertices instead of the empty corners of each part's bounding box, with a 94% resting fit. This brings the formed-pulp stage about 28% closer than 0.63.0. Future hidden parts, ground and shadows remain excluded.

Pulp sheets and the flat carton blank grow into view while fading in, so the camera pulls back continuously with the expanding outline. Inward zoom is critically damped as the structure folds, and the visible outline stays centered throughout both directions. The camera always leaves room for the current geometry, avoiding cropped flaps during transitions. Pause and document visibility freeze motion; explicit stage selection, resize and reduced-motion stills fit immediately. The 35-second sequence, compact banner entrance, presentation prompts and existing account system remain in place.

Validation covers current surface/morph/drawn-line bounds, centered projection, tighter framing, camera pause/reset, and zoom convergence at 30/60/120 fps. Desktop and mobile browser review covers the complete folding sequence and the existing animated presentation controls. This is presentation geometry only; module manufacturing geometry is unchanged.
