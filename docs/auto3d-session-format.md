# Auto3D Session Format

The `.auto3d` file is Auto3D's portable document contract. It is a ZIP archive containing a single `session.json` document.

## Compatibility policy

- Current writer version: **3**.
- Readers must accept the current version and explicitly supported older versions.
- Version 1 and version 2 sessions migrate in memory to version 3 before validation.
- A file created by a newer unsupported Auto3D version fails with a clear compatibility error; Auto3D does not guess at unknown schemas.
- Migrations are sequential and must be covered by regression tests before the writer version changes.
- Opening an older file does not rewrite it automatically. A user must explicitly save to create a new-version file.

## Version 3

Version 3 adds per-object `userData`, a bounded string key/value map for user-entered metadata. The field is copied with duplicate/array operations and persists through `.auto3d` save/open. Existing v1/v2 sessions receive an empty `userData` object during migration.

## Version 2

Version 2 retains the v1 scene/model representation and adds top-level `metadata` containing:

- `savedAt`: ISO-8601 timestamp for new saves.
- `migratedFrom`: present on an in-memory migrated document when useful for diagnostics.

The document continues to contain scene objects, compacted engine model data, material/texture state, transforms, visibility, animation source assets/playback state and view settings.

## Validation and limits

- Compressed and expanded session payloads are capped at 256 MB in the local file path.
- Object count is capped at 1,000.
- Node hierarchy depth is capped.
- Mesh/material references, coordinates, colors, transforms, object IDs and model geometry are validated before the current document is replaced.
- Zero-scale objects and non-finite transforms are rejected.
- Animation playback is restored paused.

## Recovery

Editable sessions maintain a debounced recovery checkpoint in IndexedDB. The recovery checkpoint is intentionally device-local and is not uploaded. Auto3D offers it after an interrupted/unsaved session and clears it after an explicit full-session save or discard.
