# 008 — Bound and combine household alias propagation

Priority: P2. Execution status is in the [plan index](../README.md).
Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

## Comparison with active work

See [the working-copy comparison](concurrent-work.md).

The other task still schedules one household traversal per remembered alias.
Its new receipt triggers also update a shared household sequence per write.
This plan remains open; include those effects in its work and contention checks.

## Outcome and evidence

A member saves a 300-product receipt and selects Remember for every line. The
save schedules up to 300 alias jobs. Each scans the household's complete receipt
history in ten-row pages. At 10,000 receipts this can cause about three million
receipt reads and 300,000 page executions from one save, before contention,
retries, or later analysis. Actual work depends on valid distinct aliases.

[convex/receipts.ts:348](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts) loops over the lines and line
391 schedules one traversal per remembered alias, even if its value was already
stored. [convex/aliases.ts:165](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/aliases.ts) starts the household
scan; line 192 continues it without a fixed creation-time boundary. Changed
receipts also schedule analysis through
[convex/receiptChanges.ts:186](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receiptChanges.ts). This is a bounded
page size, not bounded total work per request.

## Scope and approach

Combine changed aliases into one household propagation operation, or use an
indexed association that visits only affected receipts. Skip unchanged alias
decisions. Bound the scan to receipts present when the operation starts and
deduplicate overlapping work. Preserve manual categories and make continuation
idempotent. Avoid starting analysis once per alias when one final receipt
revision is sufficient.

Dependencies: coordinate with 004 for processing-state safety and 001 for paid
admission. It can be implemented without changing public function signatures.

## Verification and completion

Seed multiple remembered aliases and many matching/nonmatching receipts. Use
real scheduled mutations with bounded instrumentation to count visited receipts
and resulting revisions. Assert the final categories and preserved manual
choices, then assert work grows with the affected household scan rather than
aliases multiplied by history. Add new receipts between pages and verify that
the original run ends and new receipts get aliases through normal processing.

Restoring one full scan per alias must fail the work bound. Repeat the same
unchanged save and require zero new propagation work. Complete when one save
cannot enqueue hundreds of independent full-history scans. If an association
index needs a backfill, keep old behavior available until the index is complete.
