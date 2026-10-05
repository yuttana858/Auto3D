# Privacy and Network Boundary

## Local model work

Opening local model files and working in the editor does not automatically publish those files. Device-library saves and recovery checkpoints stay in browser storage. Portable `.auto3d` files are written only when the user explicitly chooses a file save/download.

## Shared library

The browser talks only to same-origin Auto3D endpoints under `/api/library/*`. It no longer contains Supabase database/storage configuration or makes direct Supabase REST/storage calls.

The temporary Cloudflare Pages Function currently performs read-only shared-library retrieval from Supabase. Shared publishing remains disabled until Microsoft Entra ID is connected. Write methods fail closed.

A shared-view link intentionally allows the recipient to retrieve the published model/session data required to render that shared item.

## Future corporate backend

When GIS provides Entra/Azure, the same browser API contract will be retained while persistence moves behind the corporate service. No service/database secret belongs in browser code.

## Network review baseline

Expected production network destinations before the GIS transition are:

- the Auto3D Cloudflare Pages origin for application assets and same-origin API requests;
- Supabase only from the Cloudflare Pages Function for the existing shared-library read path.

Local model content is not sent to Supabase or Cloudflare API endpoints merely by opening or editing it.


## Generated share links

Auto3D can create random-token, read-only mini-viewer links for existing Shared Library items. A link can hide the download control and can require a four-digit access code. Access-code hashes are stored in the private database schema rather than in the browser or API-exposed share table; the plaintext code is never stored.

The current pre-Entra Shared Library remains publicly browseable by design. Therefore, a four-digit code gates the generated mini-viewer route but should not be represented as enterprise confidentiality for an item that is already published in the Shared Library. When GIS supplies corporate identity, the same share-link contract should be moved behind the corporate authorization boundary.

Similarly, disabling the download control prevents ordinary UI downloading but cannot make rendered browser-delivered model bytes technically unrecoverable by a determined recipient. Use the option as a product permission/UX control, not as DRM.
