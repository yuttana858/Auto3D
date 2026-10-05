# Third-Party Notices

Auto3D retains the upstream Online3DViewer MIT license in `LICENSE.md`.

The production JavaScript dependency inventory is pinned by `package-lock.json` and enforced by `tools/check_licenses.mjs`. At the v0.21.0 hardening baseline the production dependency closure is:

| Package | Version | License |
| --- | --- | --- |
| @simonwep/pickr | 1.9.0 | MIT |
| core-js | 3.32.2 | MIT |
| fflate | 0.8.2 | MIT |
| nanopop | 2.3.0 | MIT |
| three | 0.186.1 | MIT |

The automated check intentionally fails closed when a production dependency reports a license outside the reviewed allowlist. Legal/corporate policy approval remains an organizational responsibility; this file is the engineering inventory, not legal advice.

Model files, HDRIs, fonts, decoders and other bundled assets can have separate terms. Asset-specific notices remain alongside those assets (for example `website/assets/hdri/NOTICE.md`).
