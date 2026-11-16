# Auto3D 0.75.0 — Supabase Vault bridge for Modal

Versions: Auto3D **0.75.0**, Packaging **1.10.7**, Primary Products **0.15.0**, Molded Pulp **0.1.0**. Review candidate based on main `70601cd`; application not deployed.

Administrators can save a complete Modal deployment or app token pair in encrypted Supabase Vault storage, inspect saved target metadata, test the app gateway and remove a pair through Preferences. The server enforces active administrator sessions, same-origin writes, account matching, separate production/preview profiles, token-purpose validation and optimistic revision checks. Credentials are never returned or accepted in agent commands; the private form clears secret fields and is omitted from app captures. Diagnostics redact Modal token patterns.

The database RPC migrations were applied and synthetic encrypted round-trip, rotation, stale-update/removal and role-grant checks passed without retaining fixture records. The paired Cloud 3D Studio 0.2.0 gateway and deployment runner are in its draft PR #1. Runtime profile settings and application deployment remain pending; automatic approval review rejected the attempted Cloudflare profile update before mutation. See [setup and validation](modal-credentials.md).

Validation: **914 application/module tests**, **72 MCP tests**, application/MCP/server lint, website/Pages builds, desktop/mobile Modal credential form checks and the real Workers runtime bridge test passed. The Studio counterpart passed **32 Python tests** and Ruff checks. The database's three new RPCs deny `anon` and `authenticated` and permit the existing server role. No live Modal authentication, cloud image build, CAD upload or production app deployment was performed. Hosted CI remains pending while the PR is draft.
