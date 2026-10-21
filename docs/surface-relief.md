# Corrugated surfaces and die impressions

Open **Materials → Advance material editor**, choose the liner material, and click its **Bump**, **Normal** or **Base color** thumbnail. The texture window shows UV coordinates, rotation and tiling, plus **Corrugated surface · Emboss / deboss**. Set paper grain, flute visibility, flute lines per UV tile and direction. **Apply surface relief** builds a 512 × 512 bump map and activates Bump relief automatically. Normal and color maps remain available. Height/displacement is removed from the visible cards and controls; legacy texture data remains readable in archives and agent APIs.

To simulate a printed die impression, choose a PNG, JPEG or WebP mask up to 8 MB, choose **Emboss · raised** or **Deboss · recessed**, and select light or dark artwork areas. Alpha multiplies the impression, so transparent regions remain unaffected. Rectangular masks are centered without aspect distortion. Set impression strength, size as a fraction of the UV tile, and horizontal/vertical center positions (0–1). A size/position that crosses a tile edge clips there. Use Off to disable the impression while retaining its mask; select Off and Remove saved impression mask to discard it.

Grain, flute visibility and impression strength range from 0 to 1. Overall Surface relief strength (0–2, in the renderer's model units) controls the composite bump shading. A value of zero produces no visible bump. These are appearance controls, not tooling depths, emboss manufacturing allowances or flute-strength ratings. Direction follows UV coordinates rather than global box axes. Spacing is a visual count per material UV tile; it is not automatically inferred from the engineering material's flute pitch. Existing texture scale, offset and rotation are preserved. Editing the Bump texture placement moves the whole composite; the mask controls move artwork within that tile separately.

All panels sharing a material receive the same repeated texture. This is not a per-panel print-registration system. The mask's vertical position increases downward in image space. High-contrast masks with antialiased edges work best for logos. Color artwork and relief masks are independent: embossing a logo does not add ink or foil. Use ordinary color/reflectivity controls for those appearances.

The renderer computes light changes from the height map. Mesh vertices, normals, board caliper, CAD points, collision solids and authoritative Measurement-layer results remain unchanged. Bump shading does not change silhouettes or simulate actual crushed board, print pressure or strength loss. Subdivided displacement geometry is not part of this feature.

Applying is one reversible operation. Settings, original impression image, generated bump map and inactive normal map persist in `.auto3d` archives and recovery snapshots. Read-only, busy, account-change and failed-render guards follow the existing material editing workflow. Portable `.auto3d` is the editable format; standard glTF has no core bump-map property. Auto3D GLB/glTF exports retain the bump map in `extras.swAuto3D.bumpTexture`, which other viewers may ignore.

## Command

`material.surface.relief` uses the same service as Apply. `index` comes from `material.list`. Optional settings merge with the material's saved settings; supplying only `index` applies the default corrugated preset to an unconfigured material. `maskDataUri` accepts a base64 PNG/JPEG/WebP and replaces the stored mask. `clearMask: true` removes it and switches impressions Off unless an explicit impression mode is supplied; replacement and removal cannot be combined. Invalid input is rejected before material mutation.

```js
await Auto3D.execute('material.surface.relief', {
  index: 0, grain: 0.35, flute: 0.25, cycles: 10,
  direction: 'vertical', strength: 0.3
});
// After supplying an artwork mask through the UI or maskDataUri:
await Auto3D.execute('material.surface.relief', {
  index: 0, impression: 'deboss', impressionStrength: 0.7,
  maskScale: 0.6, maskU: 0.5, maskV: 0.5
});
```

The pure generator and settings validation belong to the independent Packaging module. Host code handles image decoding, material assignment, UV generation when absent, history and persistence. Generated heights use a neutral value of 128 plus bounded grain, flute and signed mask contributions; alpha and luminance determine impression coverage. Settings never enter engineering allowance or tolerance calculations.

## Spot varnish

Click **Gloss / roughness** or **Reflective** to open its texture window, then expand **Gloss / reflective · Spot varnish mask**. Upload a high-contrast mask, choose light/dark areas and set varnish gloss/reflectivity and placement. Applying blends a roughness and a reflectivity map over the original finish. Transparent/unselected areas retain sampled original map values; ink and bump/normal textures remain independent. Existing roughness placement defines the composite tile, and the source specular map is resampled into that coordinate system. Images are rasterized at 512 × 512; this is a preview finish, not a coating-thickness simulation.

Uncheck Enable spot varnish and apply to restore the saved original finish maps. The mask and parameters remain available for re-enabling. Reapplying uses the saved originals, avoiding cumulative loss of detail. Gloss 1 drives covered roughness-map pixels to zero; material roughness/specular intensity still multiply those maps. Varnish is represented by roughness and specular response, not a separate physically calibrated clearcoat layer. All panels sharing the material receive it.

The mask, original finish maps, generated maps and settings persist in `.auto3d` files. Commands: `material.surface.varnish`, `material.texture.inspect`, `material.texture.mapping`, `material.texture.preview`. UV mapping changes share the same service as the preview controls, support Undo/Redo, and never alter image bytes or CAD. Setting bump/normal UV placement manually disables its automatic board-flute link so subsequent material changes do not overwrite authored placement.
