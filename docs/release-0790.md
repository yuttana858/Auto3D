# Auto3D 0.79.0 — Private CAD conversion

Versions: Auto3D **0.79.0**, Packaging **1.12.0**, Primary Products **0.15.0**, Molded Pulp **0.1.0**; Cloud 3D Studio **0.3.1**. Based on main after merged #138/#139/#140; preserves the current landing, connected prompt, Auto Pack arrays, Auto Pallet and the Image to 3D drop zone. This application increment is a review candidate until deployment is recorded.

**Convert CAD** adds private Parasolid (`.x_t`, `.x_b`, supported subset) and STEP conversion to independently validated STEP/GLB/STL plus a provenance manifest. File selection stays on the device until Convert; mixed Parasolid selections require choosing one source. Parasolid coordinate units are explicit; STEP keeps embedded units. Local import of other formats and `.auto3d` sessions retains its existing path.

The Pages API owns jobs and private R2 transfers. Supabase stores account ownership, idempotency, queue limits, attempts and leases. Modal receives only expiring job references and capabilities. Every required artifact must pass native validation and upload before publication; cancellation and late/superseded attempts cannot publish. Downloads expire after 24 hours, with controller cleanup and a conversion-prefix R2 lifecycle backstop. No public bucket or additional subscription project is created.

Ready models require an explicit Add action. The import rechecks account epoch, window, active session and revision across asynchronous work, converts GLB meters to known scene units, and commits one Undo step. All actions share strict `conversion.*` commands and the Sessions/Library MCP discovery family. Provider credentials and storage keys are absent from public job records and saved model metadata.

Hosted Modal proof [44131313665](https://github.com/yuttana858/Cloud-3D-Studio/actions/runs/44131313665) passed: authenticated gateway, exact workspace/environment, synthetic 40 × 30 × 20 mm native checks and direct Vault runtime provisioning. Database ownership/idempotency/quota/lease/cancellation/retry fixtures passed with all writes rolled back. The private R2 24-hour lifecycle rule is installed and existing rules preserved.

Validation in progress: the 967-test application/module baseline and 72 MCP tests pass; targeted command/import checks cover the final mixed-selection and account-change guards. Application/MCP lint, website/Pages build, desktop/mobile calibration import/download/Undo and actual Workers streaming/checksum tests pass. The complete local browser suite and hosted CI are being recorded separately. Production profile configuration remains blocked by automatic approval review of the environment PATCH; deployment and a live user-API calibration canary remain pending. Positive supplier Parasolid acceptance requires the user's private reference file.

See [workflow and operations](cad-conversion.md) and [credentials](modal-credentials.md).
