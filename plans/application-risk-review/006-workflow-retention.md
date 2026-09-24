# 006 — Define and enforce workflow payload retention

Priority: P2. Execution status is in the [plan index](../README.md).
Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

## Comparison with active work

See [the working-copy comparison](concurrent-work.md).

Reuse the other task's new 30-day completion cleanup. Its product-analysis
callback currently targets `components.workflow` although analysis runs in
`components.productAnalysisWorkflow`; the comparison records exact evidence.
Correct that component selection and test actual journal deletion in both
components. Define handling for uncaught failures, cancellations, old journals,
and receipt deletion before the retention deadline. Do not build a second
retention system or mark this plan complete from a scheduled-callback test.

## Outcome and evidence

A receipt completes processing and is later deleted. The application removes
its extraction table rows, but completed workflow journals still retain step
arguments and results containing the receipt data. Repeated processing also
accumulates completed journals. Operators retain sensitive receipt content and
storage grows without an application retention policy.

The extraction result and full receipt payload pass through journaled steps at
[convex/processing.ts:59](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/processing.ts), line 71, and line 115.
[convex/receipts.ts:163](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts) discards the returned extraction
workflow ID. [convex/productAnalysis.ts:116](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/productAnalysis.ts)
also starts workflows without retaining a cleanup association. Receipt deletion
at [convex/receipts.ts:565](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts) does not clean either
workflow component. No workflow cleanup call exists in application source.

The installed `@convex-dev/workflow` README, lines 579–580, explicitly states
that completed workflows are not automatically cleaned up and supplies the
`cleanup()` operation. This is package/source evidence, not a production data
inspection. Component journals are not exposed by a new public application API.

## Scope and approach

Define one retention owner for all three workflow families: receipt processing,
catalog matching, and product analysis. Register completion cleanup or a bounded
retention job, and retain only the identifiers needed to cancel or clean active
work on receipt deletion. Set the diagnostic retention duration explicitly.
Do not delete an active journal needed for durable recovery or replay.

Dependencies: none. Coordinate receipt deletion with plan 005. Existing journal
cleanup needs an inventory, bounded migration, and verification against the
installed component API. Receipt IDs alone may not identify every old journal.

## Verification and completion

Use component integration tests with mocked providers. Complete, fail, and
cancel workflows; delete their receipts; then verify payload removal after the
defined retention period. Interrupt and resume a running workflow before that
period to prove recovery still works. Repeat cleanup to prove idempotence.
Removing the completion cleanup must leave a detectable journal and fail.

Complete when each workflow family has a tested retention path and old journals
have an authorized cleanup procedure. Rehearse with an isolated deployment;
this audit does not authorize production journal deletion.
