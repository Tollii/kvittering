---
name: convex-insights
description: Investigate Kvitto backend failures, read limits, transaction contention, or operating cost using bounded deployment evidence. Use for a specific incident or performance question.
---

# Backend investigation

Read [observability](../../../docs/observability.md) and identify the deployment with [backend operations](../../../docs/backend-operations.md). An investigation starts read-only; a log entry does not authorize a repair or deployment.

Use the available Convex tools or CLI. Confirm their parameters rather than assuming another skill's tool names exist. Begin with a bounded time window and the affected request, function, or receipt identifier. Widen the window only when needed to establish a cause. Do not print receipt contents or credentials.

Use failure logs for exceptions and request history. Use deployment insights for the read-limit or contention evidence they actually provide; these are not a general exception feed. Correlate the event with the deployed revision and source before attributing a cause.

For excessive reads, inspect scope, indexes, pagination, repeated reads, and result completeness. For contention, inspect shared documents, transaction read/write sets, concurrency, and retries. Explain the observed path before suggesting batching, partitioning, caching, or another component.

For spending estimates, read [cost analysis](references/cost-analysis.md). Keep Sentry app events and Convex backend logs distinct. Neither Sentinel nor a report schema is required.

Report the evidence window, confirmed cause or remaining hypotheses, affected behavior, and smallest corrective action. Label unavailable evidence. If fixes are requested, verify the affected behavior and recheck the same signal after an authorized deployment. Create continuing monitoring only when requested, using the host's supported scheduling tools and a defined stopping condition.

For specific insight events, read [event diagnosis](references/event-diagnosis.md). For a requested error watch or repair lifecycle, read [incident workflow](references/incident-workflow.md).
