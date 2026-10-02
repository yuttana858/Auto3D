# Browser 3D Viewer Review

Research notes for selecting an open-source viewer suitable for corporate use.

## Online3DViewer

- **Project:** [kovacsv/Online3DViewer](https://github.com/kovacsv/Online3DViewer)
- **Reviewed:** 2026-10-02
- **Recommendation:** Promising candidate for a self-hosted browser viewer, especially when broad CAD and mesh format support matters. The project is permissively licensed under MIT, subject to normal notice preservation and third-party dependency review.

### License and corporate use

The repository's [LICENSE.md](https://github.com/kovacsv/Online3DViewer/blob/master/LICENSE.md) identifies the project as MIT, copyright Viktor Kovacs (2023). MIT permits commercial use, modification, redistribution, sublicensing, and inclusion in proprietary products. Redistributed copies or substantial portions must retain the copyright and license notice. The license is provided without warranty.

This is a favorable corporate license. Keep the upstream license with redistributed software and add it to the product's third-party notices. The repository also uses external libraries (including three.js, pickr, fflate, Draco, rhino3dm, web-ifc, and occt-import-js); review the exact dependency versions and their licenses and notices before bundling. This review does not treat the top-level MIT license as covering those dependencies.

### Product fit

The project consists of two parts: an embeddable engine/library and the source for the hosted 3dviewer.net website. Its developer documentation describes the engine as usable on other websites. This makes it possible to self-host the viewer and integrate it into an existing product rather than relying on the public demo site.

The current README and user manual list import support for 3dm, 3ds, 3mf, amf, bim, brep, dae, fbx, fcstd, gltf/glb, ifc, iges, step, stl, obj, off, ply, and wrl. Export is available for a smaller set, including 3dm, bim, gltf/glb, obj, off, stl, and ply. Some formats depend on separately listed parsers/libraries; verify the specific files and features the product needs.

The hosted viewer manual says local files are processed in the browser and are not uploaded to a server. That is useful for privacy-sensitive workflows, but confirm this behavior in the version we deploy and review telemetry, external requests, and the embedded integration separately. The online service also supports URL loading, which requires CORS permission from the model host.

### Advantages

- MIT license is straightforward for commercial embedding and redistribution.
- Full website source and a separately documented embeddable engine are available.
- Broad support for CAD, BIM, mesh, and glTF formats compared with glTF-only viewers.
- Local-file viewing can avoid sending model content to a third-party service.
- Includes model tree, viewing controls, and some model export workflows in the hosted application.

### Due diligence / risks

- Inventory and approve licenses for all production and development dependencies, including transitive dependencies, and preserve required notices.
- Test representative files for every required format, including large models, textures/materials, assemblies, and malformed inputs; format names alone do not guarantee fidelity.
- Review dependency maintenance, security advisories, and update cadence at the time of adoption. The repository is active and substantial, but this initial review is not a security audit or support commitment assessment.
- Decide whether to embed only the engine or self-host the full website. Review build, hosting, CSP, worker/WASM asset delivery, and upgrade process for the chosen path.
- Validate privacy claims against the exact self-hosted build and inspect network behavior before using confidential models.
- Model files have separate intellectual-property and license terms; the viewer's MIT license does not grant rights to models loaded into it.

### Assessment

**Shortlist for a prototype.** Online3DViewer appears to meet the open-source and corporate-friendly licensing goal and has unusually broad format coverage. Start with a self-hosted proof of concept using the embeddable engine, then complete dependency-license, security, privacy, and format-fidelity checks before production approval.

## Sources

- [GitHub repository and README](https://github.com/kovacsv/Online3DViewer)
- [MIT license file](https://github.com/kovacsv/Online3DViewer/blob/master/LICENSE.md)
- [Online viewer user manual: formats, loading, privacy, embedding](https://3dviewer.net/info/)
- [Engine developer documentation](https://kovacsv.github.io/Online3DViewer/)
