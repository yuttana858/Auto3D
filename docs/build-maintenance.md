# Build Maintenance Baseline

Auto3D uses Node.js 22 for CI and deployment tooling.

As of the October 2026 build refresh, the validated build/test toolchain is:

- esbuild 0.28.2
- Rollup 4.64.0
- Mocha 11.8.0
- TypeScript 5.9.3
- ESLint 8.57.1
- eslint-plugin-unused-imports 4.4.1
- @types/node 22.20.5
- JSDoc 4.0.5
- SVGO 3.3.5

Runtime/rendering dependencies are reviewed separately from build tooling. Three.js upgrades must pass the full workspace, material, animation, import/export and session regression suite before merge.


Runtime renderer baseline for Auto3D v0.21.1:

- Three.js 0.186.1

This renderer version passed the full Auto3D hardening gate (workspace, materials, animation, import/export, session, backend, engine/module and website builds).


## CI usage policy — v0.25

To reduce GitHub Actions usage and notification noise, the full validation suite runs on pull requests (and manual dispatch) only. Superseded PR runs are cancelled automatically.

A merge to `main` runs only the Cloudflare production build/deploy workflow. This avoids repeating the full lint/test/engine/module/website validation immediately after a PR has already passed it.
