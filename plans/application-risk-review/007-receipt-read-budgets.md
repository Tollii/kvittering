# 007 — Bound receipt reads by bytes and aggregate digests incrementally

Priority: P2. Execution status is in the [plan index](../README.md).
Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

## Comparison with active work

See [the working-copy comparison](concurrent-work.md).

Reuse the newer daily aggregates, receipt synchronization/cache, and the
500,000-byte cap on product-linking pages. Normal digest reads use aggregates
once backfill is ready. Remaining checks cover editorContext, legacy full-record
queries, pre-backfill digest fallback, and byte bounds on the new 20-receipt
sync/backfill batches. Test contention on the new per-household sequence row.
Do not duplicate the aggregate model or local cache.

## Outcome and evidence

A household accumulates large but valid receipts. Opening any editor reads its
50 newest complete receipt documents, even though the query only returns
categories. The query can exceed the transaction read limit. Other full-document
reads fail earlier or later according to their row limit. Summary output does
not reduce bytes already read from storage.

Evidence: [convex/receipts.ts:768](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts) takes 50 full rows;
line 819 takes 100 per attention status; lines 634, 687, and 846 cap rows without
a server-selected byte budget. [convex/corrections.ts:206](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/corrections.ts)
takes 201 full receipts. [convex/spotlight.ts:25](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/spotlight.ts)
also loads full receipt documents.

[src/lib/domain/receipt.ts:180](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/src/lib/domain/receipt.ts) permits 300 lines
and 60,000 characters of original text; lines 203–204 permit another 2,000
characters per line. The [accepted-payload test](reproductions.md) proves a valid
payload remains below 1 MiB while 50 such values exceed 16 MiB. Plain text alone
in this fixture is 660,000 bytes per receipt, or 33,000,000 bytes for 50.
Convex documents the transaction read limit as 16 MiB. See
[Convex limits](https://docs.convex.dev/production/state/limits).

A second case remains even after pages fit:
[convex/digest.ts:112](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/digest.ts) retains every full receipt in the
period while paging. A sufficiently large month can exceed action memory or
duration. There is no paid AI call in this path.

## Scope and approach

Apply server-owned byte and row budgets to paginated full-document reads.
Replace fixed `take` queries with small indexed projections or bounded pages
where needed. Do not rely on a caller voluntarily supplying a byte limit.
Compute digest totals incrementally using the same purchase rules and a fixed
scan boundary, without retaining all OCR payloads. Preserve report completeness;
do not silently stop at a count threshold.

Dependencies: none. Include the legacy `receipts:list` path because build 5
requests 100 full receipts per page. Keep its response contract compatible.

## Verification and completion

Use large valid payload fixtures, not hundreds of tiny fixtures. Verify totals
and cursors across byte-limited pages, including empty filtered pages. In an
isolated real Convex deployment, show that the baseline editor/context read
fails at the documented byte limit and that the new implementation completes.
Measure digest memory as receipt count increases. The in-process test library
does not establish hosted limits.

Removing the byte budget must make the deployment check fail. Complete when
large-household reads stay within limits and complete totals are preserved.
Rehearse any projection backfill before using it for reads; preserve the old
read path until the projection is complete.
