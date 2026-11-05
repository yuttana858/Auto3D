# Auto3D rebuild handoff bundle

Download [Auto3D-Rebuild-Handoff.zip](Auto3D-Rebuild-Handoff.zip) using GitHub's **Download raw file** control. Sign in with authorized private-repository access.

Start with `Auto3D-Rebuild-Handoff/README.md` after extraction. The 162-file archive includes the consolidated handoff, source index, documentation/schema references, 250-command catalog, assessment evidence/logs, previous-response appendix and ten-screen UI/UX catalog.

## User-supplied visual evidence

Read [UI-UX-Screenshot-Catalog.md](UI-UX-Screenshot-Catalog.md) directly on GitHub. Ten screenshots were subsequently provided in chat: empty workspace, collapsed docks, Packaging setup, generated selected box, Account Library, Share/QR dialog, AI workspace, HDRI lighting, Welcome and Preferences. Each entry distinguishes visible Verified state, Inferred interpretation, Proposed migration acceptance and Unknown behavior.

Original image binaries are not exposed to workspace tools, so this ZIP contains the textual visual catalog, not PNG/JPEG copies. Sources are identified by stable screenshot IDs and chat message/image order; originals remain in the conversation. No screenshot was recreated or claimed as automated browser capture. Share code/link/QR payload, account display identity and user asset names are omitted from the catalog. Any future embedded originals need clearly labeled redaction of access-bearing regions.

The initial no-screenshots statements in historical evidence describe the original assessment and are superseded for evidence availability by this addendum. SC-10 visibly reports Auto3D 0.47.6/build `0ffd76defb75157f3c701b2360e8939d14ebdf6e`, Standard (in) and Auto viewport quality; this is user-supplied UI evidence, not independent deployment or runtime acceptance. User reports MCP authorization unavailable; root cause remains unconfirmed.

## Baselines and integrity

- Assessment source: `716ed51b48f88caeb5b147e1d4b6cc206c35358e`.
- Remote main observed during assessment: `8697574620d7d11a1e3532dfdacd0d20e42b293b`.
- Original upload base: `0ffd76defb75157f3c701b2360e8939d14ebdf6e`. PR #70 merged after assessment; draft references in historical evidence remain historical.
- Auto3D 0.47.6 / Packaging 1.10.3 unchanged. Documentation only.
- ZIP: 634,196 bytes; 162 files.
- SHA-256: `c307ed605f03dd2237a418a80c375d85fce4d9fae37e75a67c22204b7b712ce4`.

ZIP CRC and all manifest checks passed; uploaded blob matches local bytes. Assessment: 720 application tests, 22 focused tests and lint passed. Backend HTTP/MCP runtime checks were environment-blocked. Screenshots add visual evidence only; no live browser, paid provider, physical-device or permission-enforcement tests were performed. Historical SQL is reference evidence, not an executable bootstrap; PR16 SQL must not replay.
