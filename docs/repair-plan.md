# Auto3D repair plan (2026-11-06)

Goal: complete every repair from the 2026-11-06 deep review of Auto3D 0.49.2 (main at PR #80). Target release: **Auto3D 0.51.0 / Packaging 1.10.3 / Primary Products 0.4.0** (main moved to 0.50.2 during the work). Each milestone is done only when its items are fixed, covered by tests and `npm run lint`, `npm test`, `npm run test_mcp` pass.

Status legend: ☐ open · ☑ done · ⏸ planned for a later release (feature work, not a repair)

## Milestone 1 — MCP live-control reliability (critical)

| ID | Issue | Repair | Status |
|---|---|---|---|
| C1 | Broker request records inherit the ~100-year registration expiry and are never cleaned, so an account hits the 1000-record cap and every live command fails permanently. | Request records get a short TTL (`now + 4 × timeout`); `Cleanup` and revocation remove them; existing long-lived records are treated as expired when older than the TTL. Test >1000 dispatches. | ☑ |
| C2 | Any thrown browser command calls `Disconnect()`, disabling reconnect; agent tab switch/close also trips it. | Browser catches per request and returns a structured `{ error : { code, message } }` result; only protocol violations disconnect. Session revision change re-advertises sessions instead of failing. Tests for error results and agent-invoked tab switch. | ☑ |
| H1 | Every MCP error is collapsed into one generic message. | Introduce `AgentError` with a whitelisted code taxonomy (`not_paired`, `session_unavailable`, `permission_required`, `invalid_arguments`, `command_failed`, `timeout`, `result_too_large`, `rate_limited`, `unavailable`). Transport returns code + safe message; unknown errors stay generic. | ☑ |
| H2 | Registration cap (100) counts revoked registrations forever. | Count only active registrations; prune revoked/expired records older than 30 days on registration and alarm. | ☑ |
| H3 | Transient Supabase failure turns into `invalid_grant`/401, destroying refresh tokens. | Identity lookups distinguish `revoked` from `unavailable`; unavailable → 503 / `temporarily_unavailable` and refresh tokens are kept. | ☑ |
| M7 | Expired registration on `/mcp` returns 503. | Assertion failures for revoked/expired registrations return 401 with `WWW-Authenticate`. | ☑ |
| L2 | `DisableAgents` does not reject pending requests or notify windows. | Route through the same path as `Revoke`. | ☑ |

## Milestone 2 — Browser security

| ID | Issue | Repair | Status |
|---|---|---|---|
| S1 | Stored XSS: model/mesh/material/file/zip names reach `innerHTML` through `AddDiv`/`CreateDomElement`. | `AddDiv`/`CreateDiv`/`CreateDomElement` set `textContent`; explicit `AddDomElementHtml` used only for trusted static markup. Audit callers; test with a hostile node name. | ☑ |
| S2 | No Content-Security-Policy. | CSP in `website/_headers`; build-time SHA-256 hashes for inline bootstrap scripts; `object-src 'none'`, `base-uri 'self'`, same-origin editor framing. `'unsafe-eval'` kept for the embind CAD/IFC/3DM importers (could not be exercised from this sandbox). | ☑ |
| S3 | Admin-provided environment names inserted via `innerHTML` (`lightingpanel.js`). | Use `textContent`. | ☑ |

## Milestone 3 — Command catalog correctness

| ID | Issue | Repair | Status |
|---|---|---|---|
| K1 | Mutating commands marked `mutates:false` (render/queue, lighting, view, camera.fov, playback). | 14 flags corrected; registry test asserts naming rules with an explicit allowlist. `mutates` means a change to the open document/session or shared data, so sign-in, personal preferences, local diagnostics/macros and `commands.text` (each step checked) stay non-mutating for read-only viewers. | ☑ |
| K2 | 10 command examples fail their own schema; no test checks examples. | Fix examples; test validates every example against its schema. | ☑ |
| K3 | 112 unbounded strings/numbers/indexes. | Shared `text` helper gets `maxLength` (default 4096; IDs 128; data URIs 12 MB); integer indexes get `maximum`; numeric transforms get finite bounds; `number` indexes become `integer`. | ☑ |
| K4 | `macro.cancel` has no command, so MCP can't stop a macro. | Add `macro.cancel` (fast path outside the queue). | ☑ |
| K5 | `ai.project.open_file`/`ai.reference.open` use `.click()`; pickers/fullscreen report `opened:true` even when blocked. | Shared editor methods; result reports `requiresUserGesture` when no transient activation; descriptions document dialog/gesture requirements. | ☑ |
| K6 | Missing commands for UI actions: session rename, discard recovery, user-data delete. | Add `session.rename`, `session.recovery.discard`, `object.user_data.delete` on shared functions. | ☑ |
| K7 | Primary Products and other unmapped categories fall into Settings; hints mention tools a read-only grant lacks; docs claim 250 commands. | Map every category explicitly (test fails on unmapped); scope-aware descriptions and hints; docs updated. | ☑ |
| K8 | `mcp/command-catalog.js` not checked against registry; CI never runs `test_mcp`. | Test compares committed catalog with registry; `ci.yml` runs `lint_mcp` + `test_mcp`. | ☑ |

## Milestone 4 — Agentic live-control capabilities

| ID | Issue | Repair | Status |
|---|---|---|---|
| A1 | Results >64 KB discarded. | Browser truncates oversized results to a bounded summary with `truncated : true` and guidance; `scene.inspect`/library lists accept `offset`/`limit`. | ☑ |
| A2 | Fixed 15 s timeout; long operations keep running unseen; no cancel. | Per-command timeout classes (inspect 15 s, mutation 60 s, render/AI/save 300 s); broker sends `cancel` on timeout, which stops typed command sequences/macros; other commands report that they may still complete. Job handles with progress remain with A5. | ☑ |
| A3 | `sessions.select` bypasses the single-use window code. | The broker selects only windows that announce `allowSelect`. Following main's code-free dialog (0.50.1), connecting a window is that consent; `agent.access.connect` with `allowSelect : false` requires the code. | ☑ |
| A4 | Reconnect/tab switch breaks pairing. | Stable per-window `instanceId` survives reconnect within the pairing lifetime; pairing follows the active tab when the window opts in. | ☑ |
| A5 | No change events, multi-window, MCP batching. | ⏸ Event stream (SSE/`listChanged`), multi-target pairing and server-side batch — planned for 0.51 after real-client verification. | ⏸ |

## Milestone 5 — Platform, API and CI

| ID | Issue | Repair | Status |
|---|---|---|---|
| P1 | 61 of 63 browser tests not in CI. | Root cause: the 0.47.5 welcome screen blocked every test; it now continues for `navigator.webdriver`. New CI `browser` job runs the 35 passing regressions serially. 26 tests fail identically on unchanged 0.49.2 (stale expectations) and are follow-up work. | ☑ |
| P2 | Production deploy can cancel itself mid-way (broker vs Pages skew). | `cancel-in-progress: false` for the production deploy. | ☑ |
| P3 | Shared Meshy key: users can list everyone's tasks; no rate limit; unvalidated 28 MB bodies; model proxy without timeout/size cap. | Record task ownership per account; list/read filtered to owner; per-account rate limit; body schema/size validation; proxy timeout + size cap + host-checked redirects. | ☑ |
| P4 | Malformed JSON returns 503; raw `error.message` leak in boards route. | 400 `invalid_json`; generic error text. | ☑ |
| P5 | Hard-coded personal email in recovery message; unsalted IP hashes. | Configurable admin contact (env), HMAC-keyed IP hashes. | ☑ |
| P6 | `build_website_dev` writes mini viewer to a wrong path. | Fix output path. | ☑ |
| P7 | Audience PIN brute force, 16K canvas memory, Node backend drift, per-request Supabase round trips. | ⏸ Tracked: longer PINs/global throttle, 16K tiled PNG streaming, backend retirement decision, short session cache. | ⏸ |

## Milestone 6 — Documentation and release

| ID | Issue | Repair | Status |
|---|---|---|---|
| D1 | AGENTS.md says main is PR #45 / 0.40.0; no Primary Products boundary. | Update orientation, versions and module boundary. | ☑ |
| D2 | `agent-project-overview.md`, `mcp-pilot.md` (250 commands), status test counts stale. | Update. | ☑ |
| D3 | Release alignment. | Bump to 0.51.0 (main reached 0.50.2 during the work) in package.json/AppVersion, `docs/release-0510.md`, project-status entry. | ☑ |

## Milestone 7 — Self-hosted runtime resources

| ID | Issue | Repair | Status |
|---|---|---|---|
| R1 | Format importers load `draco3d` and `rhino3dm` from cdn.jsdelivr.net at runtime. | Engine library URLs are configurable; the site uses its bundled three.js Draco decoder and a build-time copy of rhino3dm 8.17.0 (MIT) with notices. Verified in Chromium with the CDN blocked. | ☑ |
| R2 | `occt-import-js` (LGPL-2.1) and `web-ifc` (MPL-2.0) load from the CDN. | ⏸ Needs an owner decision on redistributing copyleft files; switching each is one `BundledLibraries` entry plus a build copy and notices. The CSP keeps cdn.jsdelivr.net until then. | ⏸ |

Other external origins are first-party: HDRI environments come from the account's own Supabase Storage and Meshy models are proxied through `/api/ai`. Fonts are already bundled.

## Out of scope for this release (roadmap)

Headless rendering/scene editing/import-export, Entra ID, SMTP delivery, glass rendering and label artwork, mobile share variants, and splitting `sessioneditor.js`/`agentcommands.js`/`packagingworkspace.js` are feature or refactor projects already listed in `project-status.md`; they are not repairs and are not executed here.
