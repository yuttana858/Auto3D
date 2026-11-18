# Auto3D 0.73.0 — AI and Library usability

Ships in the integrated Auto3D 0.74.0 release (PR #134); this note keeps its prepared version number for reference.

- Enabled buttons and legacy toolbar controls get a common hover outline while preserving their existing active styles.
- Adding an AI model displays a spinner and accessible busy status on Add to session through archive preparation and scene rendering. This now lives in the shared add path from 0.71.0/0.72.0, so the busy state and the "Model ready in session." status appear alongside the main-viewer message for Add to session, the thumbnail Add/New buttons, Add selected and the agent commands. Failures release the control and report an error.
- The duplicate AI project save button is removed. The standard Save dialog offers AI project when completed 3D creations are available, saving the same project archive and assets through the existing preparation path.
- Personal and device Library items have explicit delete controls and report individual deletion errors. Published shared Library remains read-only; no ownership permissions or storage schema changed.

Versions: Auto3D 0.73.0, Packaging 1.10.7, Primary Products 0.15.0, Molded Pulp 0.1.0. First prepared as 0.70.1 and renumbered after main reached 0.72.0 (#133). Browser checks cover account deletion failure/retry, AI loading, session readiness, saving the AI project, and mobile layout. Lint and website builds passed. This is not deployed.
