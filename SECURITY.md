# Security Policy

Auto3D is transitioning from a public prototype to a corporate application.

## Reporting

Do not open public issues containing credentials, confidential model data, customer information, or exploit details. Report security concerns through the corporate security process once Auto3D is transferred to the corporate organization.

Until that transfer is complete, contact the repository owner privately for security-sensitive findings.

## Security boundaries

- Browser code must not contain database secret/service credentials.
- Shared publishing must require server-side authorization.
- Remote publication must remain an explicit user action.
- Shared viewer links are read-only.
- Production secrets belong in managed secret stores, not repository files.
- Vendor-specific database and storage access should remain behind the Auto3D backend API.

See `GOAL.md` and `docs/backend-architecture.md` for the migration target.
