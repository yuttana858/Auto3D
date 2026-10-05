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
