# Actions spending and stacked releases

## Development and release process

1. Keep the active integration PR in **Draft**. Add related commits to that branch, or keep dependent PRs draft and consolidate them before release. PR #116 is the current integration batch; #110 reached main through #109. Draft pushes allocate no CI runner jobs; small skipped workflow records may still appear.
2. Run relevant checks locally after each change. For a release batch, run the full local validation below and record the commit, commands, results and any unexecuted checks in the PR. Do not rerun unchanged checks without a reason.
3. When the batch is stable, mark the integration PR **Ready for review** once. A ready PR runs validation and the **browser smoke suite** (`test/browser/smoke-suite.txt`, one job, about 10 tests). A later push to a ready PR reruns that gate; return it to draft before iterative work. Converting to draft cancels an in-flight CI run through the existing concurrency group.
   - **Full browser suite, on request only.** Right before merging a release batch, add the `full-ci` label to the PR, or run **Actions → CI → Run workflow** (suite `full`). That runs every test in `test/browser/ci-suite.txt` across three shards. Unrelated labels neither start nor cancel CI.
   - Before asking for the full suite, run it locally (below) and put the report in the PR.
4. Require results for the final commit before merging: the smoke gate on GitHub, plus a full-suite pass (local report or `full-ci` run) for that commit. A quota error, skipped job or old green commit is not a test pass. Required-check rules remain unchanged. Merge one batch to avoid triggering a production deployment for every intermediate feature.
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

### Browser suites

`tools/run_browser_suite.mjs` is the one runner for CI and local use, so a local report means the same as a CI job. It writes a pass/fail table tied to the commit (and to the job summary on GitHub).

```sh
npm run build_dev && npm run build_website && node tools/build_pages.mjs && node tools/build_mcp_workers.mjs
node tools/run_browser_suite.mjs --suite smoke --serve
node tools/run_browser_suite.mjs --suite full --serve --keep-going --report work/full-report.md
```

`--serve` starts the development and packaging preview servers and stops them afterwards; leave it out if they are already running. `--only a,b` runs named tests, `--shard 2/3` runs one CI shard. Every smoke test must also be in `ci-suite.txt` (a unit test checks this). Add a test to the smoke list only if it is quick and covers an area the list misses.

The complete gate also verifies the audience SQL security fixtures against disposable PostgreSQL 17 and runs every browser test in test/browser/ci-suite.txt. Follow the commands and services in .github/workflows/ci.yml; do not run security fixtures against production. Browser testing needs Chromium, dev/production/Pages builds, MCP workers and the development and packaging preview servers. Generate isolated assets before mcp-access. Targeted local browser tests are useful during development, but do not imply the entire suite has run.

To produce a downloadable isolated pilot only, explicitly dispatch **Verify isolated MCP pilot** on the intended branch. It has no deployment credentials. Do not run it in addition to normal CI merely to get a second green status. If repository rules require its old verify check, the repository owner must deliberately reconcile that rule; this change does not bypass or alter branch protection.

## Current quota exhaustion

The owner reported the monthly Actions allotment exhausted while PR #110 was being checked. Preserve the failing records as evidence; do not spend repeated retries on an unchanged quota limit. Continue stacking and validating locally, then run the final batch when quota is restored or the owner chooses a budget change. This process does not reset the allowance or make hosted runners free.

## Findings, 2026-11-16

- **The repository is public**, so its jobs on standard GitHub-hosted runners (`ubuntu-latest`) are free.
  - The Actions run-timing endpoint reports 0 billable minutes for every run, including the full CI runs on 2026-11-16.
  - A quota or budget limit reached on the account does not come from current Auto3D runs. It is earlier usage in the billing cycle, from before the repository was public, or another private repository on the same account. Check *Settings → Billing → Usage*, grouped by repository.
- **Size of a full CI run.** A ready PR uses about 65–75 runner-minutes:
  - `validate` takes about 2 minutes;
  - each of the three browser shards takes 17–31 minutes.
  - On a private repository with the Free plan's 2,000 minutes, that is roughly 25–30 full runs a month. 35 CI runs started between 2026-11-01 and 2026-11-16. A deployment takes about 2 minutes.
- **Avoidable runs seen this month:**
  - superseded PRs marked ready after their work was already in the integration PR (#128 ran a full gate at the same time as #134, which contained it);
  - re-runs of failing CI on unchanged code (2026-11-13, run attempts 2–3);
  - several ready PRs open at once, each running the gate.
- **Working rules.** These still matter if the repository becomes private again:
  1. Validate locally first.
  2. Keep one integration PR in draft and mark it ready once.
  3. Close superseded PRs instead of marking them ready.
  4. Fix failures locally before pushing again.
  5. Merge batches rather than single features, because each merge also deploys.


## Plan for a private repository

On a private repository, hosted Actions minutes are billed after the plan's included minutes (2,000 a month on Free, 3,000 on Pro). Per-minute prices change; check GitHub's billing page.

| Run | Runner-minutes (approx.) |
| --- | ---: |
| Draft push | 0 |
| Ready PR or push to a ready PR: validate + smoke | 10–15 |
| `full-ci` label or manual full run | 60–75 |
| Deployment after a merge | 2 |

- With one ready integration PR and one full run per release batch, a month of daily releases is roughly 1,500–2,500 minutes. Before the smoke gate, every ready push cost a full run.
- Before going private, the owner should set an Actions budget with *stop usage* in *Settings → Billing*. Agents do not change billing.
- Main has no branch protection or rulesets (checked 2026-11-16), so CI results do not block merges by themselves. Merge only on a green gate for the final commit.
- If the full suite is needed more often, run it outside hosted Actions: in these agent sessions (free, using the runner above), or on a separate compute service or self-hosted runner. A private repository makes a self-hosted runner safe from outside pull requests.
