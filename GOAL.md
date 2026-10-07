# Auto3D Migration Goal

## Goal

Complete the Auto3D backend transition so the browser no longer owns database credentials or publisher authentication, shared publishing is authorized by corporate identity, and large 3D assets are stored economically without coupling the 3D workspace to any single identity, database, or object-storage vendor.

## Target architecture

```
Auto3D browser
    |
    | HTTPS / JSON + direct authorized binary transfer
    v
Auto3D Library API
    |
    +-- Identity / authorization
    |      Target: Microsoft Entra ID
    |
    +-- Metadata repository
    |      Current: Supabase PostgreSQL
    |      Future: provider-neutral PostgreSQL-compatible service
    |
    +-- Object storage
           Primary: Cloudflare R2
           Legacy fallback during migration: Supabase Storage
```

The browser must depend on the Auto3D Library API contract, not Supabase, Cloudflare, Azure, or AWS-specific SDKs. Object storage stores bytes only; Auto3D remains the authority for users, organizations, permissions, quotas, shares, and audit events.

## Required outcomes

- Remove the Supabase email/password publisher login from Auto3D.
- Add a provider-neutral AuthService and multi-user organization model.
- Place the login experience below the Auto3D logo after the landing animation loads.
- Use Microsoft Entra ID for corporate authentication and group/role authorization.
- Prevent anonymous publishing and enforce authorization server-side.
- Move large `.auto3d`, GLB/GLTF, texture, HDRI, thumbnail and future artifact payloads to Cloudflare R2.
- Keep Library metadata, ownership, ACLs, quotas, share records and audit events in PostgreSQL.
- Use direct authorized R2 transfers for large files; use multipart uploads for large/resumable saves.
- Preserve read-only shared-library browsing and view-only share links during the transition.
- Preserve Device library and portable `.auto3d` file workflows.
- Add explicit per-user/organization storage accounting using persisted file sizes.
- Keep the persistence contract provider-neutral enough to migrate storage/database implementations later without rewriting the workspace.
- Add CI release gates for lint, tests and production build before v1.0.
- Establish versioned `.auto3d` schema migration and backward-compatibility rules.
- Complete dependency-license, security, privacy and representative format-fidelity validation.

## Cloud direction

### Active implementation

- Cloudflare Pages/Workers: Auto3D application and same-origin Library API.
- Cloudflare R2: large binary model/session assets with zero public bucket access.
- Supabase PostgreSQL: metadata and transitional authorization data.
- Microsoft Entra ID: target workforce identity provider.
- Short-lived server-authorized object access; no R2 credentials in browser code.

### Storage rules

- R2 buckets remain private.
- The API verifies identity, organization membership, permission and quota before upload/download authorization.
- New Library records store a provider plus opaque object keys; they do not expose storage implementation details to the workspace.
- Uploads should bypass the API data plane when possible: Browser -> authorized temporary R2 URL.
- Use multipart uploads once payload size/reliability makes single PUT undesirable.
- Persist `file_size_bytes` in metadata rather than scanning object storage for quota calculations.
- Keep legacy Supabase Storage reads only during the migration window.

### Future Microsoft hosting option

If corporate policy later requires an all-Microsoft data plane, the provider-neutral Library API may map the same object contract to Azure Blob Storage. Entra integration must not depend on the selected object store.

## Security invariants

- No database secret/service key or R2 secret in browser code.
- No anonymous publishing.
- Remote publication is always an explicit user action.
- Authorization is enforced server-side, never from browser claims alone.
- Shared view links are read-only.
- Presigned/object access URLs are short-lived bearer capabilities.
- Production secrets come from managed secret stores.
- Backend APIs use least-privilege identities and auditable operations.
- Storage provider choice never grants authorization by itself.

## Exit criteria

The migration is complete when authenticated Auto3D users can save, reopen and share organization-owned Library assets, large payloads are stored in private R2, quotas and permissions are enforced server-side, Entra can become the identity provider without changing Library ownership semantics, and automated tests/build/deployment pass.
