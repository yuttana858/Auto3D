# Auto3D 0.70.0 — Model spec as the default right panel (phase 1)

Packaging remains 1.10.7, Primary Products 0.15.0 and Molded Pulp 0.1.0. Stacked on 0.69.2 (movable Object transform panel). Not deployed.

## Right panel rules

- **Model spec** (formerly *Model data*, module id `data`) is the default right panel. It opens at start when both docks fit (1100 px wide or more). Its Details section, with the preview and specs, starts expanded.
- Modules (AI Generative, Packaging Gen, Primary Products, Molded Pulp) open only from their icons or commands. AI is never opened by default.
- **Module icons toggle.** Clicking the icon of the module that is already open (AI Generative, Packaging Gen, Primary Products, Molded Pulp) closes it and returns to Model spec. The icon shows as pressed while its module is open. Agents use `ui.module.toggle { module }`.
- Closing a right module returns the right side to Model spec. Closing Model spec itself collapses the right side. Panels that close automatically to make room at narrow widths do not trigger the return, and neither does the Primary Products profile editor clearing panels while it is open (`ModulePanels.Set (id, 'closed', { returnToDefault : false })`).

## Model spec contents

- **Preview window** at the top: the existing interactive 3D preview of the selected model (drag to rotate). Below it is a toolbar:
  - **Rotate** turns on a turntable. The choice carries over to the next selection, and reduced motion keeps it still.
  - **Update** opens the replacement-model file picker, as the tool strip's Update does.
  - **×** deletes the selected model. Undo restores it.
- **Packaging section** for generated FEFCO boxes, shown under the preview:
  - Style code, score size L × W × H, board caliper, closure and folded state.
  - **Open in CAD Studio** opens the box dieline in the Packaging Designer CAD (`packaging.open_selected`).
  - **Fold / Unfold** uses `packaging.fefco.toggle`.
  - **Packaging Gen tools** opens the full module (`ui.packaging`).
  - These buttons run the same registered commands that agents use.
- The existing specs and scaling (format, counts, volume and surface, W/L/H, proportional scaling, Scale %) stay below and apply to any selected object.

## Agent commands

- `ui.model_spec.inspect` returns whether the panel is open, whether the turntable is on, and the selection's name, W/L/H in display units, unit, scale, vertex and triangle counts, and packaging spec.
- `ui.model_spec.preview { rotate }` turns the turntable on or off.
- Update and Delete stay `ui.update_model` and `object.delete`. Scaling stays `object.dimension` and `object.scaling.percent`.
- The catalog has 329 commands.

## Planned next phases

- **Assign facing:** a placement visual with a glowing transparent blue ground rectangle and front and up arrows, plus a button to choose which side is the front and which is up. It is not shown until it is built.
- **Other module sections:** AI creations, Molded Pulp and Primary Products sections in Model spec.
- **Live preview:** a fully live, focus-locked 3D preview.

## Validation

- `npm test`: 877 passing. `npm run test_mcp`: 72 passing. `npm run lint` is clean.
- New `model-spec` browser test (added to the CI suite) covers:
  - the default panel and that AI is not open
  - closing AI returns to Model spec, and closing Model spec collapses the side
  - the packaging spec and its buttons
  - Rotate by button and command, and invalid input
  - Update opening a file chooser
  - × deleting with Undo
  - Packaging Gen tools
- `rendering` no longer assumes Model spec and Details start closed.
