# Auto3D 0.92.0 / Packaging 1.16.1 / Primary Products 0.15.0 / Molded Pulp 0.3.0

Shared macro library. Based on main after #163 (0.91.1). No module changes.

## What changed

- **Macros are saved to the account, in one shared library.** Every signed-in account sees and can run every saved macro (for example `demo1`), from any browser. Previously macros lived only in the browser that saved them.
- **Owner or administrator only.** A macro can be replaced or deleted only by the account that saved it or by an Auto3D administrator. Everyone else can run and export it. An administrator's replace keeps the original owner and records `updated_by`.
- **Who saved it.** Each macro shows "by <name>": the account name, or the part of the email before @. Owner IDs and email addresses are not sent to other accounts.
- **Stale saves are refused.** The dialog sends the listed `revision`; if someone saved the macro since, the save is refused with a message to reload.
- **Browser macros are not lost.** Macros saved earlier only in a browser still appear, labelled "this browser only". **Move browser macros to shared library** (`macro.library.upload_browser`) copies them over as an explicit action; names already in the library are skipped, never overwritten.
- **No silent fallback.** If the account API is unavailable, saving fails with a message; nothing is written to browser storage instead.
- **Limits.** Names are 1–100 characters; macros are version 1 with 1–100 steps and at most 64 KiB; each account can save up to 200 macros.

## Commands

- `macro.list`: every shared macro, with `savedBy`, `mine`, `canEdit`, `revision` and `location` (`shared` or `browser`). `name` and `macro` are unchanged, so `run macro <name>` and saved-macro steps keep working.
- `macro.save { name, definition, revision? }`: saves to the shared library.
- `macro.delete { name }`, `macro.export { name }`: work for shared and browser-only macros; deleting someone else's macro is refused before any request.
- New: `macro.library.inspect` (reachable, administrator, counts) and `macro.library.upload_browser`.
- `animation.macro.record { name }` finds macros in the shared library.

## Server and database

- Route: `functions/api/macros.js` (`GET`, `PUT`, `DELETE`; same-origin writes; 64 KiB body). The verified session user is passed to the database; IDs in the request body are refused.
- Migration: `supabase/migrations/20261119120000_shared_macro_library.sql` adds `public.auto3d_macros` (unique case-insensitive names) and service-role-only functions `auto3d_macro_save`, `auto3d_macro_delete` and `auto3d_macro_is_admin`. The owner/administrator rule and revision check are enforced in the database. Browser roles (`anon`, `authenticated`) cannot read the table or call the functions. Administrators come from `auto3d_admin_emails`.
- Shape check shared by browser and server: `source/website/macroshape.js`. The browser also checks that every command exists.

**Deployment order:** apply the migration before the Pages deploy. Until it is applied, the library reports itself unavailable and saves fail; browser-only macros still list and run.

## Validation

- Database: `test/security/macros-bootstrap.sql` + migration + `test/security/macros-access.sql` on local PostgreSQL 16 (browser roles refused; other accounts cannot replace or delete; unconfirmed accounts cannot save; untrimmed names and invalid definitions refused; stale revisions refused; case-insensitive administrator replace keeps the owner; delete; 200-macro limit). Added to CI.
- Unit: `test/macro-library.test.js` (shape and names; route listing, verified-actor-only RPC arguments, refused extra fields, error mapping without leaking details; commands save/list/export/delete; no browser fallback when the API is down; owner/administrator rules; moving browser macros without overwriting).
- Browser: `command-design` (save to the shared library, "by" label) and `workspace-commands` (`macro.save` reaches the library, `run macro` runs it) with an in-memory `/api/macros` (`test/browser/macro-api-mock.mjs`).
