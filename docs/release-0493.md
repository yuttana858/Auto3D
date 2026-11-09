# Auto3D 0.49.3 / Packaging 1.10.3 / Primary Products 0.3.0 — Meshy reliability candidate

A transient Meshy polling failure no longer immediately abandons tracking. History loads concurrently and reports partial failures. Uncertain submissions warn users to check history before retrying, and Meshy 403 responses retain the provider's explanation. See [Meshy reliability review](meshy-reliability-review.md).

The reported production connection failure is not yet diagnosed. Live key and generation tests remain necessary; this candidate does not assert that credentials or provider access work.
