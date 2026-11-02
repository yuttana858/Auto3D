# Auto3D MCP client compatibility

Auto3D's connector uses one remote MCP Streamable HTTP endpoint and per-user OAuth grants. It does not depend on a particular assistant vendor. The connector is **not live yet**: examples below are a setup plan, not a working URL. Do not place Auto3D passwords, OAuth tokens, provider keys, or shared secrets in these configurations.

## Planned clients

- **ChatGPT:** connect as a custom MCP app after the service is deployed and OAuth discovery has passed an end-to-end test. Scope and screenshot behavior must be checked with the actual client.
- **Claude:** use a custom remote MCP connector with the endpoint and OAuth. Claude's hosted connector connects from Anthropic's infrastructure, so a public, authenticated endpoint is required. Claude Code and API integrations can have different setup and credential handling; verify each separately. See [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) and the [Claude API MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector).
- **VS Code with GitHub Copilot:** use a remote HTTP MCP server and its browser-based OAuth flow. A minimal configuration after deployment is shown below. VS Code's OAuth options and organizational settings may affect the experience; see the [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).
- **GitHub Copilot cloud agent or code review:** GitHub documents that remote MCP servers using OAuth are not currently supported for servers configured through repository settings or custom agent profiles. Do not substitute a long-lived shared credential without a separate, reviewed design. Other Copilot surfaces have different capabilities. See [GitHub's MCP documentation](https://docs.github.com/en/copilot/concepts/customizations/mcp).
- **Other MCP clients:** verify support for Streamable HTTP, OAuth authorization-server and protected-resource discovery, PKCE, and one of client ID metadata documents or dynamic registration. The server's `401` challenge advertises the minimum `auto3d.read` scope. The authorization server also accepts `offline_access` for clients that request it; refresh tokens remain server-managed by the client and are never entered into Auto3D or chat. Screenshot tools require the additional `auto3d.capture` grant; clients that cannot request that scope may connect read-only without screenshots.

```json
{
  "servers": {
    "Auto3D": {
      "type": "http",
      "url": "https://YOUR-AUTO3D-HOST/mcp"
    }
  }
}
```

The URL is a placeholder. Configure a real URL only after deployment and verification. Each client authorizes as the user's Auto3D account and chooses a specific open window and session; credentials and pairing cannot be shared across users. The account dialog's grant listing and revoke controls are implemented locally but not deployed. Revocation is backed by the provider's KV storage; distributed propagation must be evaluated before promising immediate global revocation.

## Verification status

The MCP SDK's Streamable HTTP client has passed local handshake, tool discovery, session-list, session-selection and scene-inspection tests using two host identities. This tests the protocol integration, **not the actual Claude or Copilot products**. The real provider also passes local PKCE, token-refresh and grant-revocation tests with simulated storage. Actual client OAuth, scope escalation, screenshots, multiple windows, token refresh, grant revocation, and a deployed Cloudflare runtime still require pilot testing. Support for Copilot cloud surfaces is subject to GitHub's authentication limitations above.

## Local progress

A short-lived browser connection can renew using the same server-verified Supabase session fingerprint, window instance and connection ID. OAuth grants can be listed and explicitly revoked in the account dialog. `offline_access` is accepted for clients that request it, and a real-provider local test exercises token refresh. These changes are local; staging has not yet been updated, and browser-session and OAuth renewal still require real-runtime and actual-client verification. A successful renewal does not automatically select or retarget a different session.
