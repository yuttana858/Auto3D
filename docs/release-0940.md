# Auto3D 0.94.0 — Animation stack, can collars and CAD shape tools

Packaging **1.17.0** / Primary Products **0.15.0** / Molded Pulp **0.3.0**.

PR #162 combines the dependent animation PRs #158, #159 and #160 with macro step timing (#162) and can-collar/CAD tools (#166). It includes main through #164 (`cfd03f6`), preserving the shared macro library, Auto Pack assembly sequencing and private CAD conversion behavior. Individual candidate versions overlapped main; this combined release uses 0.94.0 and retains both workstreams' release notes.

## Resulting behavior

- Object visibility keyframes and lifetime ranges share the animation timeline and saved-session system.
- Embedded clips have scheduled start, duration, speed and looping; seeking, playback and exported video use the same timeline positions.
- Existing array copies can receive staggered motion/visibility tracks. A macro can create copies and pass their IDs to the scheduler. The account's motion easing applies to the scheduled reveal.
- Macro steps can specify a duration and pause. Strict validation accepts this timing in the shared library and rejects invalid timing before execution or save. A complete run/recording remains one Undo step.
- Packaging Accessories can create a can collar from sensed rim geometry, with a CAD profile and measurement layer. CAD tools add circles, relief holes and rounded corners.

## Integration review

The review checks the combined behavior rather than relying on the original branch results. Corrections cover shared-library timing validation, array easing consistency, current-player clip Undo, timeline-hidden picking, appended animation tracks, CAD dimension references after rounding, collar fit and account readiness across asynchronous creation.

The collar remains a flat board model; flexible tab bending is not simulated. Animation recording still excludes automatic recording of arbitrary creation, deletion and material/procedural operations. Explicit array scheduling and supported macro actions are available.

## Validation

Combined-commit results are recorded in PR #162. The release follows docs/actions-cost-control.md: one consolidated draft, a complete local suite, then one hosted smoke gate before merge. The gate includes app/module and MCP tests, worker contracts, database permission fixtures, backend checks, dependency/license checks, all browser regressions and production builds. No branch-protection or billing changes.

Feature notes: [visibility](release-animation-visibility.md), [embedded clips](release-animation-clips.md), [array scheduling](release-animation-array.md), [macro timing](release-macro-timing.md), [can collars/CAD](release-0930.md).
