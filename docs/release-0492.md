# Auto3D 0.49.2 / Packaging 1.10.3 / Primary Products 0.3.0

Agent OAuth approval uses the existing Auto3D sign-in and no longer requires a window code. After authorization, the agent can pair or select a window for live control; existing session and permission checks remain in effect. Forms already open from the previous release can still submit their window code during approval.

This change reduces connection friction; the cause of the reported connector failure remains unconfirmed and requires a real-client test after deployment.
