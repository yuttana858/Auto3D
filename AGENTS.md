# Project orientation

Read `docs/agent-project-overview.md` for the architecture, Library data flows, development checks, and active `feat/multi-user-auth-foundation` / PR #16 work. Current direction: Cloudflare R2, PostgreSQL metadata, temporary per-user sign-in, then Microsoft Entra ID. Verify the temporary auth design and latest feature-branch state before development.

# Agent-accessible features

Every new user-facing action must have a stable command in `source/website/agentcommands.js` using the shared `CommandRegistry`. Include category, description, strict input schema, example, mutation flag and structured result. Keep UI actions and agent commands on shared underlying functions. Do not make agents depend on DOM selectors, arbitrary evaluation, or simulated clicks.

Keep `website/assets/commands.json` synchronized with the registry. Document any commands that open interactive dialogs instead of completing an action. Validate inputs before mutation, await completion, and respect read-only sessions. Remote uploads and publication must remain explicit user actions. Add meaningful tests for execution, validation and macro behavior when changing these paths.
