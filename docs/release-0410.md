# Auto3D 0.41.0 · Packaging 1.9.1

The right tool rail groups AI and Packaging in a distinct teal frame. Undo/Redo move to the main toolbar beneath the Auto3D logo, retaining their existing keyboard shortcuts, commands, history state and disabled/read-only behavior.

Packaging generation removes the visible dimension-unit helper, Top flaps label, repeated category/priority captions, idle blank paragraphs, Equal-depth description and long duplicated generation/playback explanation. The closure selector remains available and labeled for assistive technology; each preset keeps its code, acronym, full name and descriptive tooltip. Empty generation status and inactive playback progress/cancel controls no longer consume space. The CAD profile heading and summary are removed; SVG and DXF downloads share a row.

The primary button now follows actual selected-box state: **Unfold → Pause → Resume**, then **Fold** after the flat sheet commits. It can pause and resume while normal scene edits are blocked. A new strict `packaging.fefco.toggle` command uses the same state-aware service as the button; existing explicit animate/playback commands remain supported. Cancel remains available during playback. Geometry, CAD coordinates, collision preflight, history and manufacturing specifications are unchanged.

The board catalog still contains nominal flute/caliper records, not verified ECT combinations. `board-database.md` now distinguishes a declared ECT rating from a component basis-weight recipe, including 32-28-32 conversion under explicit US-unit assumptions. No nominal row is presented as a supplier-certified grade.

Validation: 673 unit/module tests, focused cleanup and full-preset desktop/mobile browser checks, lint, website, standalone Packaging and Pages builds. The cold board-appearance fixture is prepared in a setup hook without increasing its timeout or removing assertions. See [PR #46](https://github.com/yuttana858/Auto3D/pull/46) and project-status.md. This candidate is not deployed.
