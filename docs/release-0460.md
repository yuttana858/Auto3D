# Auto3D 0.46.0 / Packaging 1.10.3 — draft

The Packaging panel keeps its ID/OD selector without the redundant Dimension basis label. Fold playback frames the current pose, smoothly approaches the initial box, and no longer sizes the camera for the full unfolded sweep in advance. Cut-edge display compression is stronger on walls and minor flaps; CAD paths, collision solids and dimension calculations remain unchanged. Left-side modules offer Minimal and Close only. Extended right-side modules retain the app header and toolbar.

Additional workspace work includes axis constraints, Shift-drag duplication, in-app session tabs and copy/paste, visual view modes, a centered expanding command field, and AI project and preview improvements. AI workspace recovery is account-scoped on the current device, and public shared-library publishing remains disabled. Meshy's public API documents texture generation as refine but does not document its web app's free model retry.

This is a draft: true Z-up migration of existing Y-up models, saved scenes and Packaging geometry is not complete, and the default orbit change requires review against that mismatch before release. Do not deploy this draft as production.

Meshy requests accept only the server-configured credential. Account initialization removes legacy per-account AI connection settings from browser storage. The browser uses the same-origin proxy and cannot submit a personal Meshy key; an administrator must configure the Cloudflare `MESHY_API_KEY` secret and enable `AUTO3D_AI_ALLOW_SHARED_KEY` before deploying or AI generation will be unavailable. Login still uses Secure, HttpOnly session cookies. The in-page `window.Auto3D` command registry is not a deployed MCP server.
