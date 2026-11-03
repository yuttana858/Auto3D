# Auto3D 0.47.2 / Packaging 1.10.3 — OAuth callback navigation

After Allow, the server created the authorization grant and returned a redirect, but Chromium blocked the callback navigation because the consent document used `form-action 'self'`. The page remained visible with a consumed consent transaction; clicking Allow again produced the generic authorization error.

The consent page now permits its own origin and the callback origin already validated by the OAuth provider. It never takes CSP destinations from raw query values or uses a wildcard. The canonical POST Origin check, same-origin referrer policy, PKCE, account binding, expiry and single-use consent remain enforced. A used/expired permission request now has an actionable restart message.

The browser regression now covers the complete flow using the actual OAuth provider, Workers runtime, Durable Object, KV, browser-managed Secure/HttpOnly cookies, hosted client metadata, real cross-origin loopback callback navigation and S256 code exchange. This replaces the earlier form-render-only fixture. It is a disposable integration test, not a claim that a real ChatGPT connection has been completed.

No credential, identity, database, broker or Library configuration changes are required. Restart the ChatGPT connection with a fresh permission page after deployment.
