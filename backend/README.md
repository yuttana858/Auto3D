# Auto3D Library API

This directory contains the implemented provider-neutral backend for Auto3D shared-library operations.

The service is a dependency-light Node.js HTTP application so it can run in Azure App Service, Azure Container Apps, Kubernetes, or another container/runtime without changing the browser contract. The current persistence adapter uses Supabase only from the server side. Browser code must never receive the Supabase secret key.

## Endpoints

- `GET /health`
- `GET /api/library/items`
- `GET /api/library/items/{id}`
- `GET /api/library/items/{id}/archive`
- `GET /api/library/items/{id}/thumbnail`
- `POST /api/library/items` — requires an Entra token with `Auto3D.Publisher` or `Auto3D.Admin`
- `DELETE /api/library/items/{id}` — requires `Auto3D.Admin`

The full contract is in `openapi.yaml`.

## Run locally

Use Node.js 22 or later.

```bash
cp .env.example .env
# load the environment values using your preferred local secret mechanism
npm test
npm start
```

No production secrets should be committed to the repository.

## Required runtime configuration

The current adapter requires `SUPABASE_URL` and a server-only `SUPABASE_SECRET_KEY`. Microsoft Entra verification requires `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID`; issuer and JWKS URLs are derived automatically but can be overridden.

Set `AUTO3D_ALLOWED_ORIGINS` to a comma-separated allowlist of browser origins that may call the API cross-origin.

## Azure deployment

The included `Dockerfile` is suitable for Azure Container Apps or a custom-container App Service. Store all secrets in Azure Key Vault and inject them through managed configuration. Use a managed identity wherever possible.

Recommended production stack:

- Microsoft Entra ID for workforce identity.
- Azure Container Apps or App Service for this API.
- Azure Key Vault for configuration/secrets.
- Application Insights / Azure Monitor for telemetry.
- Azure Database for PostgreSQL and Azure Blob Storage as the target persistence implementation.
- GitHub Actions with OIDC federation to Azure for deployments.

The service boundary deliberately keeps persistence behind an adapter. Replacing `adapters/supabase.mjs` with Azure PostgreSQL/Blob implementations should not require changes to the browser or route contract.
