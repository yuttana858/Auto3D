# Auto3D Multi-User Authentication Goal

## Active milestone

Complete the multi-user database and login system before resuming broader Library/R2 feature work.

This milestone is complete only when Auto3D has a coherent user lifecycle from access request through authenticated use, with organization membership and administrative controls enforced server-side.

## Required outcomes

- Animated startup screen contains working email/password sign-in.
- Startup screen supports guest access and account-request submission.
- Supabase Auth stores temporary email/password credentials; Auto3D never stores readable passwords.
- Auto3D owns provider-neutral internal user IDs independent of the authentication provider.
- Users may later link Microsoft Entra identities without changing their Auto3D user ID.
- Organizations are first-class records.
- Users may belong to organizations with Owner, Admin, Editor, or Viewer roles.
- Platform admin is distinct from organization roles.
- An administrator can approve or decline account requests.
- An administrator can manually create a user.
- Approval/manual creation can assign an organization and role.
- An administrator can create organizations.
- An administrator can deactivate/reactivate users without deleting their historical identity record.
- An administrator can reset a temporary password without ever reading an existing password.
- An administrator can delete an authentication account while retaining an auditable tombstone in Auto3D metadata.
- Admin actions are written to an audit log.
- The administrator console is unlinked, noindex/no-store, and protected by authenticated platform-admin authorization. Its random URL is defense-in-depth only.
- Session access and refresh tokens are held in HttpOnly Secure SameSite cookies.
- Browser code never receives the Supabase secret/service credential.
- Direct table access remains blocked; privileged user-management operations go through the same-origin backend API.
- The design remains compatible with replacing temporary password authentication with Microsoft Entra ID.

## Identity model

```
Authentication provider
    |
    | provider subject / auth user id
    v
auto3d_user_identities
    |
    v
auto3d_users (immutable internal user id)
    |
    +-- platform admin flag
    |
    +-- auto3d_organization_members
            |
            +-- owner
            +-- admin
            +-- editor
            +-- viewer
```

Email is a contact/login attribute, not the permanent identity key. Future Entra accounts must be linked by verified provider/tenant/subject identity, not automatically merged only because an email matches.

## Temporary authentication implementation

- Supabase Auth: temporary email/password authentication.
- Cloudflare Pages Functions: same-origin authentication and administration API.
- Supabase PostgreSQL: Auto3D users, identities, organizations, memberships, account requests, and audit events.
- Microsoft Entra ID: target replacement authentication provider.

## Security invariants

- No Supabase secret/service key in browser code.
- No password hashes or plaintext passwords in Auto3D tables.
- Existing passwords can never be viewed by administrators.
- Generated/reset temporary passwords are returned only at creation/reset time.
- Disabled/deleted Auto3D accounts cannot obtain an active Auto3D session even if an upstream credential exists.
- Platform-admin operations require a validated authenticated session and server-side platform-admin check.
- Organization permissions are server-side authorization data, not trusted browser claims.
- Account-request input is validated and rate-limit-ready.
- Authentication/session responses are no-store.
- Admin page and API are noindex/no-store.
- Audit events record privileged account-management actions.

## Milestone exit criteria

The multi-user authentication milestone is complete when:

1. The first platform admin can be safely bootstrapped.
2. A guest can request access.
3. The admin can review and approve/decline the request.
4. Approval creates the temporary authentication credential, Auto3D user, organization membership, and role.
5. The approved user can sign in from the startup screen and receive the correct Auto3D identity, organization, and permissions.
6. The admin can manually create, deactivate/reactivate, reset password, change organization role, and delete users.
7. Organization creation and membership management work from the admin console.
8. Auth/session/admin APIs fail closed when server secrets or authorization are unavailable.
9. Database security advisors and CI/build checks are reviewed.
10. PR #16 contains the full tested milestone and is ready for review before merge.

## Next milestone after authentication

Resume authenticated Library Save/Open ownership, per-organization quotas, direct/multipart R2 uploads, and share authorization using the completed identity/organization model.
