# Auto3D 0.47.1 / Packaging 1.10.3 — OAuth consent form origin

The consent page used `Referrer-Policy: no-referrer`. Chromium consequently sent `Origin: null` on the Allow/Deny form POST, which the required canonical-origin check rejected. The page now uses `same-origin`, preserving its own form Origin while withholding OAuth referrers from cross-origin destinations. Origin enforcement, single-use browser-bound consent, account binding and expiry checks remain intact.

A Chromium regression renders the actual consent page through the Workers runtime and submits its real form, verifying the emitted Origin and consent binding. The existing runtime tests continue to reject foreign origins and mismatched accounts. No identity, storage or secret configuration changes are needed.
