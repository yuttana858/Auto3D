# Error review

Open Preferences → Error logs to review recent runtime errors, rejected promises, failed resources/requests, console warnings/errors, WebGL context loss, handled editor/command failures and shadow state snapshots. Error/warning/info filters, expandable details, local JSON download and clear are available. Shadow controls append visibility, floor opacity/depth state and shader diagnostics after rendering. Review shadow state captures an additional snapshot on demand.

The log holds up to 200 entries in this browser tab; consecutive identical messages are counted together. Account-scoped sessionStorage preserves sanitized entries across refresh. Switching accounts or signing out clears the previous account's tab log. Storage failures fall back to memory. No automatic network upload is performed. Logs cannot be read from another user's browser through the deployed website alone; download and share the JSON for agent review, or use an already-authorized connected browser.

Request headers/bodies, console object contents, cookies and session tokens are not collected. Known credential patterns, JWTs, Supabase keys, data URLs, and URL queries/fragments are redacted; textual entries are capped at 1800 characters. Logs may still include visible resource paths and error messages. UI rendering uses textContent, never error HTML.

Agent commands: diagnostics.open, diagnostics.list (optional level=all/error/warning/info), diagnostics.shadow, diagnostics.export (returns JSON text), diagnostics.download (local file), diagnostics.clear. All use the same service as Preferences; auth gates still apply and review works in read-only viewers. No command accepts arbitrary log text or JavaScript.

Checks: npm test; node test/browser/errorlogs-panel.mjs with the local dev server. Browser coverage includes log review/download, actual request/runtime/WebGL events, credential exclusion, refresh persistence, logout cleanup, and tool-strip bounds in collapsed/expanded states.
