# Auto3D Backend Architecture

## Design principle

Auto3D treats cloud infrastructure as an implementation detail behind a small Library API. UI, editor, session and agent-command code must not call vendor authentication or database APIs directly.

## API contract

Initial service contract:

- `GET /api/library/items` — list visible library entries.
- `GET /api/library/items/{id}` — retrieve item metadata.
- `GET /api/library/items/{id}/archive` — retrieve the portable Auto3D archive.
- `GET /api/library/items/{id}/thumbnail` — retrieve thumbnail.
- `POST /api/library/items` — publish a new immutable item. Requires corporate publisher authorization.
- `DELETE /api/library/items/{id}` — archive/delete according to retention policy. Requires publisher/admin authorization.

Future revision endpoints should preserve immutable version history instead of overwriting model files.

## Authorization

The production target is Microsoft Entra ID. The backend validates the access token and maps Entra groups/app roles to Auto3D permissions such as:

- `Auto3D.Reader`
- `Auto3D.Publisher`
- `Auto3D.Admin`

The browser should never make authorization decisions that the server trusts.

## Migration stages

1. Current transition: shared reads remain available; browser publishing and Supabase publisher login are removed.
2. Service introduction: backend owns database/storage access and exposes the Library API.
3. Entra integration: publisher/admin operations require corporate identity.
4. Azure migration: metadata and blobs move behind the same API contract.
5. Private repository cutover: replace GitHub Pages where required, validate deployment, then make the source repository private.

## Data model direction

Retain UUID identifiers and immutable asset paths. Add explicit ownership/version/audit fields before enabling corporate publishing:

- `created_by`
- `created_at`
- `version`
- `supersedes_id`
- `status`
- `classification`
- `retention_policy`

Do not bind ownership to Supabase Auth user IDs; use an external identity subject/tenant representation suitable for Entra ID.

## Azure recommendation

Prefer Azure Database for PostgreSQL over an immediate Azure SQL rewrite. This minimizes migration risk and preserves the current PostgreSQL/RLS/migration knowledge while identity and application boundaries are being stabilized. A later database-engine change can then be evaluated independently.

For the API runtime, Azure Functions is a good first choice for a small stateless library service. If model-processing workloads become long-running or CPU/memory heavy, move those workloads to Azure Container Apps, Azure Batch, or a dedicated container service without changing the browser contract.
