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
