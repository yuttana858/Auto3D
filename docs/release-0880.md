# Auto3D 0.88.0 / Molded Pulp 0.3.0 / Packaging 1.15.0 / Primary Products 0.15.0

Molded Pulp output for tooling and customers. Based on main after #152 (0.87.1). The plan, the measurements and the next test are in [docs/molded-pulp-nurbs.md](molded-pulp-nurbs.md).

## Review model and output model

- **Review model.** The formed heightfields stay the internal model. The viewer shows them, and DFM, rib, lug and nesting checks run on them.
- **Output model.** A NURBS B-rep built on the review model:
  - **Export STEP:** a closed solid per shell (AP214, mm, positions matching the products).
  - **Export GLB:** the formed shape with its pulp material, in metres, for customer review.
- **Where.** Both are in the new **Output** section of the Molded Pulp panel, and in `pulp.export { format }`.
- **Clamshells** export two solids. The hinge bead is display only for now.
- **Saved objects.** A pulp object from a saved session, or one restored by Undo, is formed again from its saved definition before export, in the worker.

## NURBS core (foundation for the solid modeling module)

`modules/molded-pulp/src/nurbs/` contains:
- the B-spline core (`bspline.js`: knots, basis, evaluation, separable least-squares fitting);
- the shell builder (`shell.js`: degree-1 faces through the review nodes, at most 513 per side);
- B-rep topology (`brep.js`: 6 faces, 12 shared edges, outward orientation);
- the STEP AP214 writer (`step.js`).

None of these import forming code. All are exported from the module API.

## Validation

- `npm test`, including the new `nurbs.test.js`:
  - B-spline partition of unity, linear precision and exact bicubic reproduction;
  - closed topology;
  - outward orientation by signed volume for a tray, three clamshell modes and sheets;
  - volume within 2% of review;
  - exact subsampling;
  - STEP references, header and units.
- Browser test `molded-pulp-export` (in the CI suite):
  - STEP (1 solid, 6 faces, mm) and GLB (glTF 2.0, pulp material, metres) from the panel buttons;
  - clamshell STEP with 2 solids;
  - export after Undo re-forms from the saved definition.
- OpenCASCADE reads Auto3D's STEP as valid solids: a 9 × 9 dish in four pull directions, and the 6-can tray (1 solid, 6 faces, 0 open edges, 288.00 cm³ vs review 288.3 cm³). Details are in the plan document.

## Known limits (Phase 2 addresses them)

- Faces are degree 1 on the review nodes. They are exact at the nodes but faceted between them, and dense: 2 MB for a draft-detail tray, and slow for CAD kernels to mesh.
- Phase 2 replaces them with height-parameterized cubic lofts (smooth, compact, with fillets). The test cases and pass criteria are in the plan document.
