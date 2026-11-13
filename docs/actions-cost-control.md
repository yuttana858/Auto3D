# Actions spending and stacked releases

## Development and release process

1. Keep the active integration PR in **Draft**. Add related commits to that branch, or keep dependent PRs draft and consolidate them before release. PR #116 is the current integration batch; #110 reached main through #109. Draft pushes allocate no CI runner jobs; small skipped workflow records may still appear.
2. Run relevant checks locally after each change. For a release batch, run the full local validation below and record the commit, commands, results and any unexecuted checks in the PR. Do not rerun unchanged checks without a reason.
3. When the batch is stable and Actions quota is available, mark the integration PR **Ready for review** once. This runs complete validation and all three browser shards. A later push to a ready PR also reruns the gate; return it to draft before iterative work. Converting to draft cancels an in-flight CI run through the existing concurrency group.
4. Require results for the final commit before merging. A quota error, skipped job or old green commit is not a test pass. Required-check rules remain unchanged. Merge one batch to avoid triggering a production deployment for every intermediate feature.
5. Production still deploys automatically after a code merge to main, with its existing security and validation gates. Only changes confined to docs/, root README.md and AGENTS.md skip deployment. Manual deployment remains available but requires its own authorization. Exhausted Actions quota can also block deployment.

## Where the savings come from

Previously, a typical ready PR ran validation, three browser jobs, and a separate MCP pilot verification job. The pilot repeated lint, licenses, unit/MCP tests, website builds and consent testing. CI now owns those checks, including isolated pilot packaging/license validation and the previously pilot-only MCP access browser regression. The pilot artifact workflow is manual-only; artifacts expire after one day.

Browser shards now depend on successful validation. A validation failure therefore avoids starting three expensive software-rendering jobs. Each browser shard stops on its first failed test, and matrix fail-fast cancels sibling shards; a successful run still executes the complete test list. Existing superseded-run cancellation, npm download caching, Linux runners and timeouts remain in place. Three shards reduce elapsed time, not total billed minutes; reducing test coverage is not the savings mechanism.

Successful ready batches now use four automatic jobs instead of five when the old MCP workflow would have matched. Draft development uses none. Actual monetary savings depend on run duration, included quota and account pricing; no dollar estimate or billing setting change is implied.

## Local validation

Run from the repository root with dependencies installed:

```sh
npm run lint
npm run lint_mcp
npm run check_licenses
npm run audit_prod
npm test
npm run test_mcp
git diff --exit-code mcp/command-catalog.js website/assets/commands.json
npm --prefix backend test
npm run build_engine
npm run build_engine_module
npm run build_website
node tools/build_pages.mjs
node tools/build_mcp_pilot.mjs
node tools/check_mcp_licenses.mjs build/mcp-pilot/MCP-LICENSES.txt
```

The complete gate also verifies the audience SQL security fixtures against disposable PostgreSQL 17 and runs every browser test in test/browser/ci-suite.txt. Follow the commands and services in .github/workflows/ci.yml; do not run security fixtures against production. Browser testing needs Chromium, dev/production/Pages builds, MCP workers and the development and packaging preview servers. Generate isolated assets before mcp-access. Targeted local browser tests are useful during development, but do not imply the entire suite has run.

To produce a downloadable isolated pilot only, explicitly dispatch **Verify isolated MCP pilot** on the intended branch. It has no deployment credentials. Do not run it in addition to normal CI merely to get a second green status. If repository rules require its old verify check, the repository owner must deliberately reconcile that rule; this change does not bypass or alter branch protection.

## Current quota exhaustion

The owner reported the monthly Actions allotment exhausted while PR #110 was being checked. Preserve the failing records as evidence; do not spend repeated retries on an unchanged quota limit. Continue stacking and validating locally, then run the final batch when quota is restored or the owner chooses a budget change. This process does not reset the allowance or make hosted runners free.
