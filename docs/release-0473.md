# Auto3D 0.47.3 / Packaging 1.10.3

Users can save, replace, test and remove a personal Meshy API key through Preferences → AI connections → Manage Meshy key. Keys are encrypted with account-bound AES-256-GCM in a separate private R2 bucket and are never returned to the browser after saving. Input is masked, cleared after submission/close/account switch, excluded from captures and kept out of browser persistence, project archives and agent arguments/results.

The authenticated proxy prefers the personal key and fails closed if its record is unreadable; administrator-key fallback remains explicit. Credentialed upstream requests require HTTPS and refuse redirects. Proxy storage failures are caught without logging exception objects. Status/test/removal and interactive entry have strict shared agent commands; agents cannot submit a key through a command or macro.

Based on production 0.47.2 (`075f74d`), retaining existing OAuth/MCP changes. Packaging is unchanged at 1.10.3. Separate production/preview R2 bindings and encryption secrets are configured. See meshy-api-keys.md for setup, deletion and rotation procedures. Live Meshy acceptance requires the user's own key; no paid generation is needed to test the connection.
