# Auto3D 0.71.1 — Messenger daily history

Ships in the integrated Auto3D 0.74.0 release (PR #134); this note keeps its prepared version number for reference.

Messenger has a History button for the current AI or member conversation. Saved messages appear grouped by the viewer’s local date, with older messages loaded in pages. Messages stay in the existing account-scoped store; no daily copy, deletion, separate retention policy, or scheduled job is introduced. Only conversation members can read a group’s history; leaving removes access. Agent command `ui.messenger.history` opens or closes the view.

Primary Products 0.15.0 / Packaging 1.10.7 / Molded Pulp 0.1.0. Candidate; not deployed.
