# Auto3D 0.70.1 — AI and Library usability

- Enabled buttons and legacy toolbar controls get a common hover outline while preserving their existing active styles.
- Adding an AI model displays a spinner and accessible busy status through archive preparation and scene rendering. The same operation is used by the UI and agent command; failures release the control and report an error.
- The duplicate AI project save button is removed. The standard Save dialog offers AI project when completed 3D creations are available, saving the same project archive and assets through the existing preparation path.
- Personal and device Library items have explicit delete controls and report individual deletion errors. Published shared Library remains read-only; no ownership permissions or storage schema changed.

Versions: Auto3D 0.70.1, Packaging 1.10.7, Primary Products 0.15.0, Molded Pulp 0.1.0. Browser checks cover account deletion failure/retry, AI loading, session readiness, saving the AI project, and mobile layout. Lint and website builds passed. This is not deployed.
