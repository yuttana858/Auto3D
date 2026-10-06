# Auto3D native keyframe animation

Auto3D now has two complementary animation systems:

1. **Embedded animation** — animation clips imported from GLB/glTF and evaluated with Three.js `AnimationMixer`.
2. **Auto3D Timeline** — native keyframes for scene-object transforms and viewer camera states.

The two systems are intentionally independent. A model can run an embedded skeletal/morph animation while its Auto3D scene object is simultaneously moved, rotated, or scaled by the native timeline.

## Native timeline model

Session-level timeline state:

```json
{
  "version": 1,
  "duration": 5,
  "time": 0,
  "loop": false,
  "interpolation": "smooth",
  "cameraKeyframes": []
}
```

Each scene object can contain an independent `keyframes` array:

```json
{
  "id": "keyframe-id",
  "time": 1.5,
  "interpolation": "smooth",
  "position": [0, 10, 0],
  "rotation": [0, 90, 0],
  "scale": [1, 1, 1]
}
```

A keyframe at the same object/time replaces the previous one. Object tracks are evaluated independently.

## Tweening

Three interpolation modes are available:

- **Smooth** — smoothstep timing between keys.
- **Linear** — constant interpolation ratio.
- **Step** — holds the previous key until the next key.

Position and scale interpolate numerically.

Rotation is converted to quaternions and evaluated using spherical linear interpolation (SLERP). This avoids long-path Euler rotation artifacts such as 350° → 10° rotating backward through 340°.

## Camera state

Every saved Auto3D camera state contains enough data to reconstruct the view exactly:

- eye position
- center / target position
- up vector
- field of view
- projection mode

It also stores derived editing/agent metadata:

- Euler rotation
- quaternion
- camera-to-target distance
- azimuth
- elevation

`eye / center / up / FOV` remain authoritative for restoring the view.

Current azimuth/elevation metadata uses the application's conventional Y-up spherical frame. Exact camera restoration does not depend on those derived fields.

Camera keyframes use the same Smooth / Linear / Step interpolation model. Eye and center are interpolated independently, up vectors are normalized after interpolation, and FOV is interpolated. Perspective/orthographic projection changes are discrete rather than continuously interpolated.

## Saving

The Auto3D archive schema is version 5.

Every `.auto3d` archive created through the session/library save path stores:

- current camera state
- timeline state
- camera keyframes
- per-object transform keyframes
- existing embedded animation assets/playback settings
- lighting/background/view settings already supported by Auto3D

Schema-v4 archives migrate automatically to v5 with empty native timeline/keyframe arrays.

Native timeline metadata is currently an Auto3D-session feature. Generic GLB/glTF export still exports embedded source animation clips; native Auto3D object/camera tracks are not yet emitted as glTF animation/camera tracks.

## Editor controls

The Animation section contains:

- duration
- interpolation / tween mode
- loop
- Keyframe object
- Keyframe camera
- Play/Pause
- Reset
- timeline scrubber
- ordered keyframe list
- per-key delete control

Embedded GLB/glTF controls remain below the native timeline.

Shared/read-only viewers may play and scrub timeline content but cannot change duration/interpolation/loop or create/delete keyframes.

## Agent commands

Connected Auto3D agents can use:

- `animation.timeline.inspect`
- `animation.timeline.seek`
- `animation.keyframe.object`
- `animation.keyframe.camera`

This is intended to support generative workflows such as packaging assembly/folding demonstrations.

## Packaging use case

A future corrugated generator can model a carton as panels/assemblies and create a timeline such as:

- 0.0 s — flat blank
- 0.8 s — main body panels begin folding
- 1.6 s — manufacturer joint closes
- 2.4 s — bottom flaps close
- 3.2 s — product/package presentation pose
- 4.0 s — camera moves to final inspection view

Smooth object and camera tweening can then create an erection/folding presentation without baking a skeletal rig into the source CAD.

For articulated folding, the next animation layer should support **pivot/hierarchy keyframes** so individual carton panels rotate about crease axes rather than treating the entire imported object as one transform.
