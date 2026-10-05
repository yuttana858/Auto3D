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

## Security

Do not commit Cloudflare API tokens. Keep the API token scoped only to Cloudflare Pages Edit for the intended account. Rotate or revoke it when this temporary hosting path is retired.
