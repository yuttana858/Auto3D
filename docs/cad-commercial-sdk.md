# Internally hosted CAD SDK options

Researched 2026-11-18 for Auto3D's private converter. No commercial SDK is installed or licensed, and none has been tested against the failed private Parasolid source. The native service remains 0.5.0; Auto3D 0.91.1 adds the private proof transport.

## Current decision

Annual SDK licensing is excluded for the current low-frequency use. The existing paid Modal workspace supplies compute; it does not include a proprietary CAD reader license. No additional workspace, subscription, vendor-hosted upload or SDK purchase was made.

The [private open-source proof](https://github.com/yuttana858/Cloud-3D-Studio/blob/main/docs/cadconvert-proof.md) has now built and tested CadConvert commit `d5d9a1b9948c575fd46b22840971360c67878362`. Its public reference passes, but individual face tessellation fails on the retained private source (`mesh_face_failure`). Therefore it remains an experimental manual tool and is not enabled as an Auto3D fallback. The source was processed only in the existing private server path; original attempts and retention are unchanged. See [0.91.1](release-0911.md).

## Shortlist

| SDK | Relevant capability | Fit for Auto3D | Commercial considerations |
| --- | --- | --- | --- |
| CAD Exchanger SDK | Parasolid text/binary, STEP, GLB/glTF and STL; assembly, geometry and supported appearance data | First evaluation candidate: official Python API and native libraries that support containers; closest to the existing Python Modal worker | Format-specific or bundled licensing, development/joining and recurring maintenance fees, plus distribution terms. Server deployment and ephemeral-container licensing need a written quote. |
| HOOPS Exchange | Parasolid, STEP and many native CAD readers; STEP, GLB/glTF and STL writers; B-rep, assembly, style and engineering metadata | Strong broader-CAD candidate: Linux and C/C++/C# APIs; likely a small native command-line helper called by the Python worker | Commercial agreement and deployment rights required. Official site offers a 60-day evaluation; no current public production quote was established. |

Sources: CAD Exchanger [SDK/container FAQ](https://cadexchanger.com/products/sdk/), [format matrix](https://cadexchanger.com/formats/), [features](https://cadexchanger.com/products/sdk/features/) and [licensing/pricing FAQ](https://cadexchanger.com/products/sdk/pricing/); HOOPS [product/platform/evaluation details](https://www.techsoft3d.com/developers/products/hoops-exchange/) and [import/export matrix](https://docs.techsoft3d.com/hoops/exchange/start/supported-formats.html). Published format support is not proof that a specific supplier file will convert completely.

## Private Modal integration

Keep Auto3D's sign-in, owned job API, private storage, worker lease, callbacks, progress, quotas and expiry. Add a selected reader/exporter implementation inside Cloud 3D Studio's existing CPU image. It receives the same private upload and returns validated STEP, GLB, STL and the manifest through the existing contract. Browser scene insertion uses GLB; engineering exchange uses STEP; STL remains geometry only. No vendor-hosted upload service is necessary to use these native SDKs.

Container support alone does not establish a usable serverless license. CAD Exchanger describes host-ID-based distribution keys; confirm that scale-to-zero, changing container host IDs, build machines, preview/production and one-worker concurrency are permitted and supported. Ask either vendor about offline use, activation/telemetry egress, confidential processing and server/SaaS rights. Modal compute and storage remain separately billable under the existing workspace plan. SDK license costs are additional; the illustrative numbers in a FAQ are not an Auto3D quote.

Keep licensed binaries in a private build source and activation material in server-only secret storage. Never embed them in the browser bundle or commit a production key. A new SDK should not require users to supply provider credentials on every conversion.

## Evaluation and acceptance

1. Obtain an evaluation package and license covering private Linux containers. Confirm pricing and deployment terms before production adoption; no purchase or vendor contact has been made.
2. Add a configurable SDK adapter, preserving the current reader for rollback. Version the producer and report the selected reader in the existing safe diagnostic contract.
3. Test public fixtures first: units, complete assemblies, transforms, solids/faces, independent STEP reimport, GLB dimensions/colors/alpha, material/texture inventory, and all output hashes.
4. Run the private failing source inside the existing private server pipeline only. Compare expected completeness as well as successful file creation; never accept recovered partial geometry as a complete engineering model.
5. Verify cold start, memory/time bounds, cancellation, lease loss and cleanup. Release only after the existing two-account/privacy/retention gate passes with the selected SDK.

Color/style support and bitmap textures are separate. An SDK may preserve more available appearance data, but cannot recover image assets or UV mapping that the source never contains. Test actual GLB rendering, rather than relying only on metadata counts.

## Open-source alternative found

[cadconvert](https://github.com/omerbasavul/cadconvert) is an experimental MIT Rust Parasolid-text/STEP-to-mesh engine. It is a possible separately evaluated visualization path, not a verified replacement for the current complete STEP/GLB/STL engineering contract: binary Parasolid and engineering STEP output are not established, and the project's testing notes include recovery of partial data from damaged inputs. The bounded private evaluation above now records its actual result. Updating the existing reader from 0.3.17 to 0.3.18 also does not establish a fix for that source's parametric face-construction failure. Neither alternative is enabled by this release.
