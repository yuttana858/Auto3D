# Auto3D 0.45.0 / Packaging 1.10.2

The browser console identified repeated model-detail preview creation as a
source of WebGL context exhaustion: disposing a Three.js renderer alone does
not immediately release its browser graphics context. Temporary model, AI,
welcome and polygon previews now explicitly release their own contexts during
cleanup. The shared main viewer is never released by preview cleanup. A failed
model-preview setup also cleans up the partially initialized renderer.

Diagnostics continue to record unexpected WebGL context loss, but exclude
intentional releases of temporary preview canvases. A lost main viewer still
requires recovery; this change prevents the observed preview-context buildup
and does not claim to resolve unrelated GPU failures. Account-session 401
responses are a separate authentication issue and are unchanged.
