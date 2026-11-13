# Auto3D 0.69.1 — decimal size entry and AI generation progress

Packaging remains 1.10.7, Primary Products 0.15.0 and Molded Pulp 0.1.0. Based on main after Auto3D 0.69.0. Not deployed.

## Decimal points in size and transform fields

Typing a decimal into the object transform fields (Position, Rotation and Size X/Y/Z) lost the point. For example, `1.5` became `51`. Each keystroke applies the value live, and `SyncInputs` then rewrote every field, including the one being typed in. That turned `1.` into `1`, so the next digit followed it.

`SyncInputs` now skips the focused field. Leaving the field shows the applied, rounded value. Live updates and Undo are unchanged. The Details panel W/L/H and **Scale percentage** fields already skipped the focused field; the new `decimal-inputs` browser test covers both panels.

## AI Generative progress

The AI Generative panel shows a progress box under the Generate button with a spinner and a progress bar. It is a polite live region (`role="status"`).

- **Sending request…** while the request is submitted.
- **Request accepted · processing…**, then **Request processing · NN%** as the provider reports progress.
- **Complete · select Preview to review** on success, or **Request failed: …** if the submission or the task fails.

All submissions use it: Generate (every mode), Texture, Revise and Generate views. When a request is accepted, the Latest creations list scrolls once to the new creation's card, which stays highlighted (`aria-busy`) while it runs. Reduced motion uses an instant scroll and no spinner animation. A newer submission takes over the progress display.

`ai.workspace.inspect` now also returns `progress` (`phase`, `taskId`, `percent`, `message`), so agents can follow the same state.

## Validation

- `npm test`: 877 passing. `npm run lint` is clean.
- New browser tests `decimal-inputs` and `ai-progress` were added to the CI browser suite.
  - `decimal-inputs` fails without the fix (`'51'` instead of `'1.5'`).
  - `ai-progress` fails if the scroll to the new creation is removed.
- `ai-extended`, `workspace-optimization`, `workspace-editing`, `packaging-effects` and `dimensions` pass locally.
