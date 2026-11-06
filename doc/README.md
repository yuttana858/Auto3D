# Auto3D complete rebuild handoff

Download [Auto3D-Rebuild-Handoff.zip](Auto3D-Rebuild-Handoff.zip) using **Download raw file**. The repository is private; sign in with authorized access.

The complete archive contains 173 files: consolidated architecture/product/migration handoff, repository documentation and schema references, a 250-command catalog, source/evidence indexes, validation logs, the previous-response appendix, and UI/UX documentation with image files.

## Screenshot files are now included

Eight uploaded screens are represented in `Auto3D-Rebuild-Handoff/screenshots/`:

- SC-01 empty workspace.
- SC-02 collapsed docks.
- SC-03 Packaging setup.
- SC-04 selected generated box.
- SC-05 Account Library.
- SC-06 Share dialog: **labeled AI-assisted redacted reference**, with access code, URL and entire QR hidden. It is a derivative, not pixel-exact original evidence; the unredacted original is excluded.
- SC-07 AI workspace.
- SC-08 HDRI lighting.

Seven original uploaded PNGs are unchanged. SC-06 was redacted after automatic approval review rejected publishing its access-bearing original. Other originals retain visible account/library labels; no new public access was created.

Open `screenshots/gallery.html` after extraction to browse the images. `screenshots/index.json` records filenames, dimensions, sizes, hashes and modification status. The detailed [UI/UX catalog](UI-UX-Screenshot-Catalog.md) maps ten screens to visible state, components, migration acceptance and unknown behavior. Its relative image links resolve inside the extracted ZIP.

SC-09 Welcome and SC-10 Preferences remain documented from earlier chat images; their image files were **not in the uploaded screenshot.zip** and are not fabricated or included. Earlier no-image statements are historical and superseded by this upload.

## Integrity and baselines

- ZIP size: 3,817,402 bytes; 173 files; eight image files.
- SHA-256: `5797d1d127271f62ca042db2d06f24a7a150576ca0d4189fb8de31914f7d9b10`.
- ZIP CRC, every manifest checksum and seven original-image hashes verified. SC-06 has its own derivative checksum.
- Source assessment: `716ed51b48f88caeb5b147e1d4b6cc206c35358e`.
- Remote main observed during assessment: `8697574620d7d11a1e3532dfdacd0d20e42b293b`.
- Original upload base: `0ffd76defb75157f3c701b2360e8939d14ebdf6e`; PR #70 merged after the original assessment.
- Auto3D 0.47.6 / Packaging 1.10.3 unchanged. Documentation only; no application deployment.

Assessment-time tests: 720 app/module tests, 22 focused tests and lint passed. Backend HTTP/MCP runtime checks were environment-blocked. User-supplied screenshots verify visible states only; no new browser, permission-enforcement, paid-provider or physical-device tests are claimed. Preferences visibly reports build `0ffd76d`; that is not independent served-bundle verification. User reports MCP authorization unavailable; root cause remains unconfirmed.

SQL is reference evidence, not an executable bootstrap; historical PR16 SQL must not be replayed. No environment secrets, API keys or raw production model files are included.
