# Cost analysis

Start with the relevant deployment, period, and current plan. Read current official pricing only when calculating money; do not infer a bill from package versions or old examples.

Rank functions by observed call volume and relevant usage, such as documents or bytes read, writes, storage, and action time. Separate measurements from estimates. Distinguish per-call evidence from aggregate totals and state sampling limits.

Explain the dominant cost in source: unnecessary history reads, repeated provider calls, large documents, contention retries, or work that could be shared. Prefer a change that removes work while preserving correctness. Cache validity must include scope, source, and completeness.

Give the baseline, assumptions, expected change, and verification method. Traffic projections are scenarios, not guarantees. Do not change plans, provision services, or run paid load tests unless those actions are within the user's authorization.

## Compare growth and volume

Show both work per call and call volume. A small read repeated frequently can outweigh an expensive rare call. Estimate growing scans as a function of retained records and traffic; repeated full-history reads can grow in both dimensions. An index does not make an unbounded result constant-cost. Bounded result reads can stabilize per-call work, while complete reports may still require all relevant pages.

When there is no usage history, label projections as estimates from query shape and stated traffic assumptions. Include at least the current scenario and a meaningful growth scenario. Name the least costly correction that preserves the requested result. Do not multiply threshold-event counts as if they were complete billing telemetry. State price and recurrence before a new paid commitment, unless the exact commitment is already authorized.
