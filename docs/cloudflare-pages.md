# Cloudflare Pages deployment

Auto3D can be hosted from the private GitHub repository on Cloudflare Pages without a custom domain. The production site will use Cloudflare's generated `*.pages.dev` hostname.

## Deployment model

GitHub Actions builds the static website and uses Wrangler Direct Upload. Cloudflare does not need direct access to the private GitHub repository.

Production build:

```bash
npm ci
npm run build_website
node tools/build_pages.mjs
```

Deployment directory: `build/pages`

Pages project: `auto3d`

## Required GitHub Actions secrets

Create these repository secrets before running the workflow:

- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID.
- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with **Account → Cloudflare Pages → Edit** for the target account.

The connected ChatGPT Cloudflare integration can currently read the account and Pages projects, but its write call is rejected by Cloudflare authentication. The CI token is therefore kept separate and used only by GitHub Actions.

## First deployment

The workflow checks whether the `auto3d` Pages project exists. If it does not, Wrangler creates it with `main` as the production branch. It then uploads `build/pages`.

Run the workflow manually from **Actions → Deploy Cloudflare Pages → Run workflow**, or merge/push a commit to `main`.

After the first successful deployment, Cloudflare assigns the project a `pages.dev` hostname. No purchased domain is required.

## Library database configuration

Set `SUPABASE_URL` and the encrypted `SUPABASE_SECRET_KEY` in the Pages project's production environment, and separately in preview if preview Library access is needed. Redeploy after changing configuration. Library and share Functions require both values and return 503 when configuration is missing or invalid; they no longer fall back to the prototype project or a publishable key. New `sb_secret_` keys use the upstream `apikey` header; legacy `service_role` JWT keys also use bearer authorization. These values stay in server Functions and must never enter static assets or browser configuration.

`GET /api/health` now makes a bounded read-only query against `auto3d_library`. It returns HTTP 200 with `database: "ok"` when the table is accessible, or HTTP 503 with `database: "unavailable"` otherwise. It reports no model rows, credentials or upstream error details. This verifies metadata access only, not R2, share RPCs, schema migrations, or sign-in. The existing public published catalog remains read-only; per-user authorization is separate work.

After deployment, check `/api/health`, then `/api/library/items`, and open an existing published model. Verify share access-code and download controls on an existing share. Never test database access by putting a secret into a browser URL.

## Security

Do not commit Cloudflare API tokens. Keep the API token scoped only to Cloudflare Pages Edit for the intended account. Rotate or revoke it when this temporary hosting path is retired.

## Consolidated 0.27.1 release verification

On 2026-10-09, both GitHub Actions and Cloudflare's canonical production deployment reported successful deployment of PR #21, merge commit `c46bbf465ecf555f291431dc4a9bd07a71d281cc` (deployment `0d73523a-cff9-4b17-a84e-e09156748715`). The six most recent production deployments were successful and not skipped. PR #21 kept the application version at 0.27.0 and did not include the later preference/recovery changes. Deployment history therefore does not substantiate a failed rollout caused by frequent PRs. The user's unchanged fill-light appearance on their browser still needs the running release identity checked.

`tools/build_pages.mjs` now emits `version.json` and an HTML build meta tag. The build is `CF_PAGES_COMMIT_SHA`/`GITHUB_SHA`, falling back to the combined asset digest locally. The digest includes the recovery worker as well as JS, CSS and optimizer; previously a recovery-worker-only change did not invalidate its URL. HTML and un-fingerprinted bundle filenames revalidate; the manifest is no-store. This addresses potential stale assets without asserting that cache was the observed cause.

After uploading, the deployment workflow runs `tools/verify_deployment.mjs`. It checks the production manifest's commit, the root HTML's build/script references, and SHA-256 of the served application bundle. A successful upload alone is no longer the final release check. The app header shows v0.27.1, Preferences shows the build, and `app.version.inspect` exposes both through the agent interface. Future release PR descriptions should identify the expected version and commit and report the completed deployment verification separately from CI.
