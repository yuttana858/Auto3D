# Auto3D 0.90.1 — private alternative-reader proof transport

App 0.90.1; Packaging 1.16.0, Primary Products 0.15.0 and Molded Pulp 0.3.0 are unchanged. Based on main `9b97a2e` (0.90.0), preserving its packing sequence, motion easing and Assign facing work. PR pending.

The trusted conversion controller can issue a 15-minute, read-only source capability for one retained failed text-Parasolid job. Its HMAC binds the origin, job, owner, source hash/length/units and original expiry. Each read rechecks the account, retained failed state and immutable R2 metadata, then streams directly to the private Modal proof. The capability cannot claim a job, change attempts/retention, upload artifacts or publish a model. Rotation, expiry, account disablement and source/ownership changes revoke access. No new browser action or MCP command is introduced.

This enables an operator proof of the pinned CadConvert reader. It does not enable a production fallback, change the existing validated STEP/GLB/STL contract or promise Parasolid coverage. Private source files, logs and geometry stay off developer machines and GitHub runners/artifacts.

Validation: 1,064 application/module tests, 73 MCP tests, 11 backend tests, existing worker/modal runtime tests and the new source-capability workerd test pass. Lint, production audit, license checks, website and Pages builds pass. The first browser invocation encountered an older development server on shared ports and is not accepted as validation; a fresh isolated public checkout uses ports 18080/18082. Full browser results, CI and deployment pending.
