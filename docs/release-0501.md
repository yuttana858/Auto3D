# Auto3D 0.50.1 / Packaging 1.10.3 / Primary Products 0.4.0

MCP authorization uses Auto3D sign-in and standard OAuth consent with Allow/Deny. Connection labels come from client metadata; registration and harness inputs are removed. The MCP connections dialog keeps window sharing, screenshot permission and revocation without Agent connection instructions or code fields. Session selection remains separate and account-bound. Pending legacy consent forms still work.

Plugin-side OAuth configuration and a real-client reconnect remain required to verify the complete installed integration.

Validation: 745 application/module tests, 49 MCP runtime tests, backend tests, application/MCP lint, dependency license checks and production audit (zero vulnerabilities) pass. Website and Pages builds pass. Chromium verifies the branded consent form, cross-origin callback, S256 code exchange, code-free connection dialog, explicit window sharing, remote read, disconnect and revocation.
