# Auto3D 0.85.0 / Packaging 1.15.0 / Primary Products 0.15.0 / Molded Pulp 0.2.0

This release adds an Animation panel and video export of the animation sequence. It is stacked on 0.84.0 (Auto Pack on the Packaging generator).

## Export review (before this release)

| Export | Where | Notes |
| --- | --- | --- |
| Session GLB/glTF | Export → Export session | Includes embedded glTF clips. Timeline keyframes are not baked. |
| OBJ, STL, PLY, OFF, glTF/GLB, 3DM, BIM | Export → Other mesh formats (`exportdialog.js`) | Mesh only. |
| Packaging dielines | `packaging.export` | SVG, EPS and DXF. |
| Snapshot | Toolbar camera | Viewport PNG. |
| High-res render | Rendering panel and render queue | Screen/HD/4K/16K tiled PNG with alpha. |
| **Video** | — | **Not available.** It is added in this release. |

## Animation panel

A new module icon (**Animation and video**) opens a docked right panel with four sections:

- **Playback:** Play/Pause, Reset and a playhead scrub.
- **Sequence:** duration, range start and end, tween and loop.
- **Keyframes:** scene, selected object, camera and fold action, with a keyframe summary. **Open timeline editor** opens the bottom Advance animation track editor.
- **Export video.**

The controls call the same `SessionTimeline` functions as the `animation.*` commands and the Advance panel, and both panels stay in sync.
- `SessionTimeline.Subscribe` lets additional views follow the playhead.
- `AnimationUI` refreshes the panel.
- `ui.module.toggle { module : 'animation' }` opens and closes the panel.

## Video export

`source/website/videoexport.js` exports frame by frame, never as a real-time recording, so frames are not dropped on slow machines.

**Frames and timing**
- For each frame time in the range at 24, 25, 30 or 60 fps, the exporter calls `timeline.Seek (t, false, true)`.
  - This applies object and camera keyframes and fold actions.
  - It also applies the same automatic fold camera framing as playback, through the new `framing` argument of `Seek`.
- Embedded glTF clips follow the video clock.
- The first frame shows the range start and the last shows the range end. For example, 2 s at 24 fps gives 49 frames.

**Rendering**
- Each frame is rendered into an offscreen MSAA render target at the output size.
- Editor helpers are hidden, through `HideRenderHelpers`, which is now shared with `RenderPNG`.

**Encoding**
- Frames are encoded with WebCodecs and muxed with `mp4-muxer` or `webm-muxer` (both MIT).
- **Auto** prefers MP4 (H.264) and falls back to WebM (VP9, then VP8) when the browser cannot encode H.264.
- Bitrate is about 0.1 bit per pixel per frame, between 1 and 60 Mbit/s. A keyframe is inserted every 2 s.
- Sizes: Viewport (device resolution, capped to 4K area, even dimensions), 720p, 1080p and 4K.

**Isolation and limits**
- During export the scene is isolated the same way as in the render queue: inert UI, busy flag, timeline and clips stopped, navigation off.
- Afterwards the playhead, poses, clips and viewer are restored.
- Cancel stops the export at the next frame.
- At most 36,000 frames.

**Privacy**
- Exporting requires sign-in, the same as capture.
- The video stays in the browser until you choose **Download video**. Nothing is uploaded.

**Commands**
- `animation.video.export { size, fps, format, start, end }` waits for completion and returns the metadata.
- `animation.video.inspect` and `animation.video.cancel` can be used during an export (they skip the command queue and the busy check).
- `animation.video.download`.

**Known limits**
- Automatic fold framing is computed for the viewport aspect ratio. A preset with a different aspect ratio keeps the vertical field of view, so the sides are cropped or extended. Add camera keyframes for exact framing.
- Audio is not included.

## Validation

- Unit tests: `test/video-export.test.js` covers frame times, sizes, option validation, codec order and the WebM fallback. The command catalog contract also passes.
- New browser test `test/browser/animation-video.mjs` (in the CI suite):
  - adds keyframes from the panel;
  - exports a 720p, 24 fps, 49-frame video (H.264 MP4 in Chromium) and checks the downloaded container;
  - checks that a WebM export decodes and plays (1280 × 720, about 1.04 s);
  - cancels a running export and checks the playhead and pose are restored;
  - closes the panel with its icon.
- ffprobe on the exported MP4: h264, 1280 × 720, 24 fps, 49 frames, 2.04 s. Frames show the scene without editor helpers.
