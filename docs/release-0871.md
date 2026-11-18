# Auto3D 0.87.1 / Packaging 1.15.0 / Primary Products 0.15.0 / Molded Pulp 0.2.0

The 0.87.0 live appearance gate found a missing capability in the credential bridge's explicit response allowlist. Native 0.5.0 converted the public calibration and returned appearance reports, but `appearanceApiVersion` was dropped before `JobCapabilities`, so the public API advertised `appearanceProtocol: null` and the stricter verification operator correctly failed. Pass through only the exact supported integer version 1. Unknown/string versions and arbitrary provider fields remain excluded.

A regression now exercises the full saved-runtime connection → sanitized bridge DTO → public conversion capabilities for missing, supported, unknown and malformed versions, with a workerd assertion for the bridge itself. No worker image, geometry, credentials, SQL migration or browser workflow changes.

Production 0.87.0 deployed successfully in run 44345035739. The real retained STEP's private server diagnostic on native 0.5.0 validated its CAD/colored STEP and found **16 source colors**, zero transparent styles and no render material assignments. Bitmap/UV availability remains unknown to the reader. The diagnostic used the original upload, did not publish a model, reset conversion attempts or extend retention, and no customer CAD was downloaded. The older ready conversion remains unchanged. ODUM's separate Parasolid face-construction failure remains open; see the 0.5.0 operations notes.

Local patch checks: 43 focused CAD/Modal tests, the real workerd bridge test, lint, website and Pages builds passed. The 0.87.0 full regression evidence still applies to unchanged browser/geometry behavior; CI validation and smoke are required for this patch. 0.87.1 deployment/live-gate evidence follows release.
