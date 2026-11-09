# Meshy connection and reliability review

This is a local change against Auto3D 0.49.3 / Packaging 1.10.3. The reported production connection failure has not been reproduced or resolved. The prior diagnostics draft (release-0474) distinguishes entered-key testing, saved-key testing, missing credentials and unavailable encrypted storage; it must be present in the deployed build before relying on those messages.

The existing integration uses Meshy's REST API through the same-origin Pages proxy, rather than Meshy's MCP server. Meshy’s developer MCP page requires an interactive account context; its detailed contract and any potential migration have not been verified. Do not replace the existing proxy with MCP without evaluating authentication, task support, operating costs, and production behavior against current provider documentation.

## Changes in this review

- Polling retries up to six consecutive network, rate-limit, or server failures, with bounded backoff or a numeric Retry-After. If the requested wait exceeds one hour, polling stops with an instruction to refresh later. Authentication and other client errors stop immediately. After retries are exhausted, refresh history to recover the provider's task status.
- Four history requests run concurrently. A failed route no longer hides results from other routes; the interface indicates partial history. An account change discards the results.
- Provider 403 responses retain their explanation, because a 403 can reflect moderation, plan access or IP restrictions as well as account issues.
- Browser API calls have a 35-second timeout. Submission is never automatically retried: a lost response can mean Meshy accepted a paid task. Check recent creations before submitting again. The proxy reports the same uncertainty when an upstream submission fails without a response.

## Verification and rollout plan

1. Confirm the actual production deployment and route versions, then review current Meshy REST documentation and the MCP option. Do not assume an MCP endpoint is interchangeable with the REST endpoints.
2. In an authorized account, open AI connections and test the entered key, then the saved connection. Record only the displayed diagnostic and HTTP status, never the key. If entered-key test succeeds but saved test fails, investigate the private R2 binding and encryption secret without rotating it. If both fail, investigate the key, Meshy account, provider availability and IP restrictions. Check Pages logs for sanitized status/timing and request IDs; do not log credentials, prompts, signed asset URLs or response bodies.
3. Review and deploy the candidate through the project's normal process. Repeat the connection tests against the actual deployed URL. With explicit approval for credit consumption, run one small generation, watch it finish, and verify preview and project save. Check recent creations before repeating an ambiguous submission.
4. Monitor failure rates, rate limits, poll latency, and submission outcomes. If reliability remains inadequate, evaluate resumable polling after reload, provider-supported idempotency, durable task tracking, and an authenticated health dashboard before adopting them. Backoff is currently bounded but has no jitter, and refresh does not restart polling automatically.

Tests use mocked provider responses; no live Meshy request or paid generation was made. The development environment's enforced network policy does not allow Meshy hosts, and no Meshy credential is bound. The Cloudflare project has the production credential bucket and an encryption secret binding, but their existence does not prove a saved credential is readable or accepted. Production behavior, provider API compatibility and real latency remain unverified.
