# Project orientation

Read `docs/project-status.md` for the current release, development log, validation and outstanding work, then `docs/agent-project-overview.md` for architecture and data flows. Production uses Cloudflare Pages Functions, private R2, Supabase account metadata and temporary approved-account sign-in; Microsoft Entra ID remains future work. Main includes merged PR #92 (Auto3D 0.54.1 / Packaging 1.10.5 / Primary Products 0.5.0). PR #93 is merged into #91, which incorporates current main and combines bottle profile controls, primitive-editing research and the researched design catalog. The integrated release is Auto3D 0.56.0 / Primary Products 0.7.0 / Packaging 1.10.5. Main also includes PR #94 (Auto3D 0.56.1 / Packaging 1.10.6, browser regression repair). Main also includes PR #95 (Auto3D 0.57.0 / Primary Products 0.8.0, parametric product design drawer). Main also includes PR #96 (Auto3D 0.57.1 / Packaging 1.10.7 / Primary Products 0.8.1). Main also includes PR #98 (Auto3D 0.58.0) and PR #97 (0.58.1). Main includes merged #99 (0.58.2 / Primary Products 0.9.1). The next increment is Auto3D 0.59.0 / Primary Products 0.10.0 / Packaging 1.10.7, with unified clamshell browsing, advanced label editing and clear physical materials. PR #97 (Auto3D 0.58.1 / Packaging 1.10.7 / Primary Products 0.9.0) advertises the MCP write scope so OAuth clients can request the full command catalog, and adds a closable command bar. PR #101 (Auto3D 0.59.1 / Packaging 1.10.7 / Primary Products 0.10.0) lets the consent page grant full access and screenshots even when a client requests read-only access. Main also includes PR #102 (Auto3D 0.60.0 / Primary Products 0.11.0 / Packaging 1.10.7, stand-up pouches). The pouch options candidate (flat-bottom, zipper, spout) is Auto3D 0.61.0 / Primary Products 0.12.0 / Packaging 1.10.7. The realism candidate stacked on #103 is Auto3D 0.62.0 / Primary Products 0.13.0 / Packaging 1.10.7; see docs/release-0620.md. CAD label integration is paused at user request. Main includes PR #105, deployed 2026-11-12: Auto3D 0.64.0 / Primary Products 0.13.0 / Packaging 1.10.7 (multi-image to 3D, revisions, texture prompts, AI image viewer, administrator-saved shared Meshy key). PR #109 (Auto3D 0.65.1 / Packaging 1.10.7 / Primary Products 0.14.0) combines #110 (0.65.0 live product profile editor and CI consolidation) and #113 (0.64.0 deployment record), and lets agents read command bar messages and reply above the box (`ui.command_bar.inspect` / `ui.command_bar.respond`), adds `selection.clear`, and applies the screenshot opt-in immediately. Report the app version, every module version and the PR number for every new PR. Read `docs/pr16-reconciliation.md` before changing legacy published Library storage. Historical SQL in `database/history/pr16/` must not be replayed.

The agentic landing/sign-in release is Auto3D 0.63.0 / Packaging 1.10.7 / Primary Products 0.13.0, based on main after #106. See docs/release-0630.md.

The landing camera refinement is Auto3D 0.63.1 / Packaging 1.10.7 / Primary Products 0.13.0, based on main after #107. See docs/release-0631.md.

The live product profile editor candidate is Auto3D 0.65.0 / Packaging 1.10.7 / Primary Products 0.14.0, includes main through #112. See docs/release-0650.md.

The fixed motor-scale hero release is Auto3D 0.64.2 / Packaging 1.10.7 / Primary Products 0.13.0, based on main after #111. See docs/release-0642.md.

The staged hero pullbacks release is Auto3D 0.64.3 / Packaging 1.10.7 / Primary Products 0.13.0, based on main after #112. See docs/release-0643.md.

# Agent-accessible features

For every new PR, report the application version and PR number to the user. Keep the app version, package version and release notes aligned when preparing a release.

Every new user-facing action must have a stable command in `source/website/agentcommands.js` using the shared `CommandRegistry`. Include category, description, strict input schema, example, mutation flag and structured result. Keep UI actions and agent commands on shared underlying functions. Do not make agents depend on DOM selectors, arbitrary evaluation, or simulated clicks.

Keep `website/assets/commands.json` synchronized with the registry. Document any commands that open interactive dialogs instead of completing an action. Validate inputs before mutation, await completion, and respect read-only sessions. Remote uploads and publication must remain explicit user actions. Add meaningful tests for execution, validation and macro behavior when changing these paths.

# MCP and agent errors

Agent-facing failures use the coded errors in `mcp/common.js` (`AgentError`, `PublicError`). Throw a coded error for anything an agent can act on; uncoded errors are reported as generic `unavailable`. The browser bridge returns command failures as results and must not disconnect for them. Keep request records short-lived, and test new broker state for growth limits.

# Packaging module boundary

FEFCO generators, extrusion, textures, catalog UI and module styles belong in modules/packaging. Its neutral API and independent tests/build/preview must work without imports from source/engine or source/website. Auto3D integrates through source/website/packagingadapter.js and PackagingWorkspace. Load geometry/UI on demand; archive-safe pure profile validation may be shared at startup. Preserve this boundary when adding packaging features and report both app and module versions in release PRs. The Primary Products module (`modules/primary-products`, integrated through `primaryproductsadapter.js` and `PrimaryProductsWorkspace`) follows the same boundary.

# Module panels and design consistency

Extended mode uses the shared full-viewport native modal, blocking background interaction/scene shortcuts and restoring module DOM on minimize/close. Top-level docked modules register with `ModulePanels` and use its minimal, extended and closed controls. Do not add new feature tabs or content to AIWorkspace. AI content/styles belong to `aiworkspace.js` and `css/aiworkspace.css`. Packaging generation/panel content and styles belong inside `modules/packaging`; `packagingpanel.js` is only the host adapter for lazy loading and scene actions. Other modules keep their own content and use the shared shell instead of copying layout logic. Keep legacy command aliases working when moving UI.

Use shared `--workspace-menu-font-size`, `--workspace-help-font-size`, `--workspace-meta-font-size` and `--workspace-title-font-size` tokens for left/right docked menus. Keep the mobile rail available and preserve scene state when resizing or closing a module. See `docs/module-panels.md`.

# Board catalog

Account catalog defaults, CSV parsing/validation, selector UI and editor styling live in `modules/packaging`. Host storage lives in `source/website/boarddatabase.js` and the authenticated Pages route; do not put it in AI. Keep allowance factors design-specific, preserve saved material snapshots when catalog records change, validate before mutation, and keep revision-based conflict checks. Never silently fall back to a local-only save if the account API fails. See `docs/board-database.md` and the applied `20261027185638_account_board_catalog` migration.

The next stacked candidate in draft PR #110 is Auto3D 0.66.0 / Primary Products 0.15.0 / Packaging 1.10.7: wall controls, glass optics, static bottle contents and editable label sources. See docs/release-0660.md.

# Actions spending and stacked work

Keep active development PRs in draft and stack related increments into the current integration PR where practical. Draft conversion cancels superseded CI; draft pushes skip runner jobs. Validate locally and record the exact commit/results. Mark ready once the batch is complete and Actions quota is available; ready PR pushes run the full gate, so return to draft before further iterative work. Never treat quota failures or skipped checks as passing. CI already covers MCP; dispatch the separate isolated pilot workflow only when its downloadable artifact is needed. See docs/actions-cost-control.md. Do not change spending limits, bypass branch protection, or deploy as part of CI cost optimization.
