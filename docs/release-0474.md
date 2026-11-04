# Auto3D 0.47.4 / Packaging 1.10.3 — Meshy diagnostics

The animated 3D welcome screen is restored at startup and waits for a click or keyboard activation before the sign-in flow begins. A saved account may still be restored after that interaction. The scene is disposed when the welcome closes to release its WebGL resources.

Meshy connection testing now distinguishes a missing saved key, a key rejected by Meshy, and unavailable secure storage. A user can test an entered key with Meshy's balance endpoint without storing or decrypting it, then save it through the existing encrypted account storage. The direct test sends the key only from the signed-in browser to Auto3D and onward to Meshy over HTTPS; it does not return the provider response or persist the key. No secret is logged by the new endpoint.

The previous generic connection failure does not identify the production root cause. Deploy only after review and CI, then test using an explicitly authorized account without recording the key. An unavailable encryption secret or private bucket requires a configuration repair; a valid binding name alone does not prove that the secret has the required format. Never rotate the storage encryption secret as a troubleshooting shortcut because existing saved keys may become unreadable.
