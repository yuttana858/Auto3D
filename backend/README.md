# Auto3D Backend

This directory defines the provider-neutral service boundary used by the Auto3D browser.

The contract is in `openapi.yaml`. The first production implementation should target Microsoft Entra ID and Azure while preserving the same API contract.

## Recommended first implementation

- Runtime: Azure Functions (Node.js/TypeScript) for metadata and library operations.
- Identity: Microsoft Entra ID access tokens.
- Authorization: Entra app roles or groups mapped to Auto3D.Reader, Auto3D.Publisher and Auto3D.Admin.
- Metadata: Azure Database for PostgreSQL.
- Files: Azure Blob Storage.
- Secrets: Azure Key Vault.
- Observability: Application Insights / Azure Monitor.
- Deployment: GitHub Actions using OIDC federation to Azure.

Supabase remains a temporary data/storage implementation during migration. New browser features must not add direct Supabase authentication or privileged database/storage calls.
