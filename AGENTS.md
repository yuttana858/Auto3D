# Project orientation

Read `docs/project-status.md` for the current release, development log, validation and outstanding work, then `docs/agent-project-overview.md` for architecture and data flows. Production uses Cloudflare Pages Functions, private R2, Supabase account metadata and temporary approved-account sign-in; Microsoft Entra ID remains future work. Current main includes PR #24. The FEFCO packaging release is v0.28.0; report the version and PR number for every new PR. Read `docs/pr16-reconciliation.md` before changing legacy published Library storage. Historical SQL in `database/history/pr16/` must not be replayed.

# Agent-accessible features

For every new PR, report the application version and PR number to the user. Keep the app version, package version and release notes aligned when preparing a release.

Every new user-facing action must have a stable command in `source/website/agentcommands.js` using the shared `CommandRegistry`. Include category, description, strict input schema, example, mutation flag and structured result. Keep UI actions and agent commands on shared underlying functions. Do not make agents depend on DOM selectors, arbitrary evaluation, or simulated clicks.

Keep `website/assets/commands.json` synchronized with the registry. Document any commands that open interactive dialogs instead of completing an action. Validate inputs before mutation, await completion, and respect read-only sessions. Remote uploads and publication must remain explicit user actions. Add meaningful tests for execution, validation and macro behavior when changing these paths.
