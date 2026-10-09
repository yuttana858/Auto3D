# PR #16 historical SQL

These five files record SQL already applied to the current Supabase project. They are archived outside `supabase/migrations` intentionally: their original date-only filenames do not match the deployed migration versions, and this set is not a complete fresh-database baseline. Do not replay them or use them to reset existing users. Current runtime SQL and later account/session changes live in `database/`.

Verified against Supabase migration history during PR reconciliation:

| Original file | Applied version |
| --- | --- |
| 20261007_r2_object_metadata.sql | 20261007141635 |
| 20261008_multi_user_auth_foundation.sql | 20261008115808 |
| 20261008_auth_integrity_indexes.sql | 20261008120614 |
| 20261008_auth_foreign_key_indexes.sql | 20261008120857 |
| 20261008_require_password_change.sql | 20261008120945 |

Organization tables and historical password-change flags in these records do not imply that the current UI implements organization administration or first-login password changes. Follow `docs/temporary-auth.md` for the active approval, session and administrator flows.
