# Auto3D 0.77.0 — Supabase Vault bridge for Modal

Versions: Auto3D **0.77.0**, Packaging **1.12.0**, Primary Products **0.15.0**, Molded Pulp **0.1.0**. Review candidate integrates main `2ffecfa` and Auto pallet #139; application not deployed.

Administrators can save a complete Modal deployment or app token pair in encrypted Supabase Vault storage, inspect saved target metadata, test the app gateway and remove a pair through Preferences. The server enforces active administrator sessions, same-origin writes, account matching, separate production/preview profiles, token-purpose validation and optimistic revision checks. Credentials are never returned or accepted in agent commands; the private form clears secret fields and is omitted from app captures. Diagnostics redact Modal token patterns.

The database RPC migrations were applied and synthetic encrypted round-trip, rotation, stale-update/removal and role-grant checks passed without retaining fixture records. The paired Cloud 3D Studio 0.3.0 gateway and deployment runner are in its draft PR #1. Runtime profile settings and application deployment remain pending; automatic approval review rejected the attempted Cloudflare profile update before mutation. See [setup and validation](modal-credentials.md).


Integration repair validation: **951 application/module tests**, application/MCP lint, website/Pages builds, desktop/mobile Modal credential form checks and real Workers runtime checks passed. The integration preserves main through #136 and the Auto pallet implementation from #139. Hosted CI, live Modal authentication and the conversion connector remain in progress.
