# Auto3D Migration Goal

## Goal

Complete the Auto3D backend transition so the browser no longer owns database credentials or publisher authentication, shared publishing is authorized by corporate identity, and the application can move from the current Supabase prototype to the corporate Microsoft stack without rewriting the 3D workspace.

## Target architecture

```
Auto3D browser
    |
    | HTTPS / JSON + binary assets
    v
Auto3D Library API
    |
    +-- Identity / authorization
    |      Target: Microsoft Entra ID
    |
    +-- Metadata repository
    |      Current: Supabase PostgreSQL
    |      Target: Azure Database for PostgreSQL (preferred) or Azure SQL if corporate standards require it
    |
    +-- Object storage
           Current: Supabase Storage
           Target: Azure Blob Storage
```

The browser must depend on the Auto3D Library API contract, not Supabase, Azure, or AWS-specific SDKs.

## Required outcomes

- Remove the Supabase email/password publisher login from Auto3D.
- Prevent browser-side publishing until corporate identity authorization is available.
- Preserve read-only shared-library browsing and view-only share links during the transition.
- Preserve Device library and portable `.auto3d` file workflows.
- Move privileged publication, update, delete, moderation and future audit operations behind a backend service.
- Use Microsoft Entra ID for corporate authentication and group/role authorization.
- Keep the persistence contract provider-neutral enough to migrate storage/database implementations.
- Add CI release gates for lint, tests and production build before v1.0.
- Establish versioned `.auto3d` schema migration and backward-compatibility rules.
- Complete dependency-license, security, privacy and representative format-fidelity validation.
- Move source repository to private only after replacement hosting and deployment are verified.

## Cloud direction

### Preferred Microsoft implementation

- Microsoft Entra ID: workforce authentication and authorization.
- Azure Functions or Azure Container Apps/App Service: Auto3D Library API.
- Azure Blob Storage: `.auto3d` archives, thumbnails and future generated artifacts.
- Azure Database for PostgreSQL: preferred metadata database because Auto3D currently uses PostgreSQL semantics and migrations.
- Azure Key Vault: application secrets and connection strings.
- Application Insights / Azure Monitor: API and publishing telemetry.
- GitHub Actions with OIDC federation to Azure: CI/CD without long-lived cloud credentials.

### AWS usage

Use AWS only for a workload with a specific technical or organizational advantage. Avoid splitting core identity, metadata and primary object storage across Azure and AWS unless a concrete requirement justifies the operational complexity.

## Security invariants

- No database secret/service key in browser code.
- No anonymous publishing.
- Remote publication is always an explicit user action.
- Authorization is enforced server-side, never from browser claims alone.
- Shared view links are read-only.
- Production secrets come from managed secret stores.
- Backend APIs use least-privilege identities and auditable operations.

## Exit criteria

The migration is complete when Auto3D can run with Supabase disabled in the browser, corporate users can authenticate through Entra ID, authorized publishers can manage shared content through the backend API, automated tests/build/deployment pass, and the repository can be made private without disrupting the production application.
