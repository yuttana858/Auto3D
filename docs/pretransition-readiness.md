# Auto3D v0.21.0 Pre-Transition Readiness

This release is the engineering handoff baseline before GIS supplies Microsoft Entra ID and Azure resources.

## Completed engineering controls

- Private source repository.
- Cloudflare Pages replacement hosting with automated deployment from protected source.
- Same-origin browser Library API; no direct Supabase configuration or calls in browser code.
- Shared publishing disabled until corporate identity is connected.
- Provider-neutral Node Library API with Entra JWT/app-role validation ready for deployment.
- Server-side persistence adapter boundary for later Azure PostgreSQL/Blob migration.
- Supabase browser publisher permissions removed.
- `.auto3d` versioned schema with v1 → v2 migration policy and tests.
- Unsaved-session dirty state, navigation warning and IndexedDB recovery checkpoint.
- CI gates: install, lint, production dependency license allowlist, high-severity production npm audit, application tests, backend tests, engine bundle, engine module/type build and website build.
- Production dependency/license inventory in `THIRD_PARTY_NOTICES.md`.
- Supabase security advisor clean at the hardening baseline.
- Read-only share links preserved.
- Device library and portable file workflows preserved.

## Format-fidelity baseline

Automated importer/exporter tests remain part of the upstream-derived suite, with dedicated coverage for glTF, OBJ, OFF, PLY, STL, 3DS and ZAE paths plus session/workspace regressions. Formats relying on larger WASM/external importer stacks should be validated with corporate representative files during UAT rather than treated as equivalent solely because the extension is supported.

## GIS transition blockers (external)

These are intentionally not implemented with placeholder credentials:

- Microsoft Entra application registration / tenant/client identifiers.
- Corporate app-role or group assignments for Auto3D.Publisher and Auto3D.Admin.
- Azure runtime, Key Vault, PostgreSQL/Blob resources and monitoring.
- Corporate retention/classification values and final security/privacy approval.

No engineering workaround should bypass these controls. Until GIS completes them, shared browsing is read-only.

## Release decision

v0.21.0 is suitable as the frozen pre-transition build when CI and Cloudflare production deployment are green. Entra-enabled shared publishing is a subsequent controlled integration, not a prerequisite for completing this build.
