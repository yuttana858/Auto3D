# Auto3D rebuild handoff bundle

Download [Auto3D-Rebuild-Handoff.zip](Auto3D-Rebuild-Handoff.zip) using GitHub's **Download raw file** control. This repository is private; sign in with an authorized account.

The archive contains 161 files: consolidated architecture/product/migration handoff, repository documentation and schema references, the full 250-command catalog, assessment metadata, validation logs, and the requested previous-response appendix. Start with `Auto3D-Rebuild-Handoff/README.md` after extraction.

- Assessment source: `716ed51b48f88caeb5b147e1d4b6cc206c35358e`.
- Remote main observed during assessment: `8697574620d7d11a1e3532dfdacd0d20e42b293b`.
- Upload branch base: `0ffd76defb75157f3c701b2360e8939d14ebdf6e`. PR #70 has since merged; its draft status in the archive is historical assessment evidence, not current status.
- Application: Auto3D 0.47.6. Packaging: 1.10.3. Documentation upload only; no release bump.
- ZIP size: 624,691 bytes.
- SHA-256: `c9ed86c0f8f61e9440589c7584b5eb84e78b241987b60d66e0806410ce27bec1`.

## Screenshot evidence

No actual interface screenshot was supplied or captured in the assessment, and no captured interface images are included in the ZIP. The supplied Companion Page snapshot contained `page_id: null` and `document_view: null`. Screenshot references and browser-test descriptions were reviewed; they do not establish direct visual verification.

## Interpretation and validation

Evidence labels distinguish Verified, Inferred, Proposed, and Unknown conclusions. Historical documentation can conflict with current implementation. SQL is reference evidence, not an executable bootstrap; historical PR16 SQL must not be replayed. The archive includes no credential values or production model contents.

ZIP CRC and every manifest SHA-256 passed. Assessment application tests: 720 passing; focused tests: 22 passing; lint passed. Backend HTTP and MCP runtime checks were blocked by localhost socket restrictions. No production deployment, real-client MCP, paid-generation, or physical-device acceptance is claimed.
