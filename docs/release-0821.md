# Auto3D 0.82.1 — Durable retry dispatch

Versions: Auto3D **0.82.1**, Packaging **1.14.0**, Primary Products **0.15.0**, Molded Pulp **0.1.0**; Cloud 3D Studio **0.3.3**.

The operator retry of the original failed upload revealed a second bug: `retry` returned the job to queued but retained the previous sent dispatch flag and attempt identity. The normal API often dispatched immediately, hiding this gap; a recovered/reconciled retry could remain queued forever.

Retry now creates a pending outbox entry and clears the old provider call/attempt, so late acknowledgements cannot restore an obsolete dispatch. The corrective migration repairs only queued, unclaimed retries with that stale flag, within the existing attempt/deadline/retention limits. It preserves immutable sources, ownership and the two-attempt cap. The migration is applied and the queued incident is verified pending without consuming its second attempt.

Validation reproduces an acknowledged failure with the old function, applies the correction, verifies pending state and unchanged attempt count, rejects late acknowledgements, then reruns the ownership/progress/cancellation/retry fixtures in isolated PostgreSQL. UI and command contracts are unchanged from 0.82.0, whose 991 application tests and hosted CI/deployment passed. The full browser regression continues separately.
