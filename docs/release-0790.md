# Auto3D 0.79.0 — Private CAD conversion

Versions: Auto3D **0.79.0**, Packaging **1.12.0**, Primary Products **0.15.0**, Molded Pulp **0.1.0**; Cloud 3D Studio **0.3.1**. Based on main after merged #138/#139/#140; preserves the current landing, connected prompt, Auto Pack arrays, Auto Pallet and the Image to 3D drop zone. This application increment is a review candidate until deployment is recorded.

**Convert CAD** adds private Parasolid (`.x_t`, `.x_b`, supported subset) and STEP conversion to independently validated STEP/GLB/STL plus a provenance manifest. File selection stays on the device until Convert; mixed Parasolid selections require choosing one source. Parasolid coordinate units are explicit; STEP keeps embedded units. Local import of other formats and `.auto3d` sessions retains its existing path.

The Pages API owns jobs and private R2 transfers. Supabase stores account ownership, idempotency, queue limits, attempts and leases. Modal receives only expiring job references and capabilities. Every required artifact must pass native validation and upload before publication; cancellation and late/superseded attempts cannot publish. Downloads expire after 24 hours, with controller cleanup and a conversion-prefix R2 lifecycle backstop. No public bucket or additional subscription project is created.

Ready models require an explicit Add action. The import rechecks account epoch, window, active session and revision across asynchronous work, converts GLB meters to known scene units, and commits one Undo step. All actions share strict `conversion.*` commands and the Sessions/Library MCP discovery family. Provider credentials and storage keys are absent from public job records and saved model metadata.

Hosted Modal proof [44131313665](https://github.com/yuttana858/Cloud-3D-Studio/actions/runs/44131313665) passed: authenticated gateway, exact workspace/environment, synthetic 40 × 30 × 20 mm native checks and direct Vault runtime provisioning. Database ownership/idempotency/quota/lease/cancellation/retry fixtures passed with all writes rolled back. The private R2 24-hour lifecycle rule is installed and existing rules preserved.

Validation: **970 application/module tests**, **72 MCP tests**, lint, backend checks, production licenses/audit, engine/module and website/Pages builds pass. Every declared full browser check has a passing result across the full run and targeted reruns; actual workerd/R2 transfer checks and rolled-back service-role database checks pass. See [exact scope and browser report](cad-conversion-validation.md). Production profile is verified; hosted CI, application rollout and the live user-API calibration canary are pending. Supplier Parasolid acceptance requires the private reference file.

See [workflow and operations](cad-conversion.md) and [credentials](modal-credentials.md).
