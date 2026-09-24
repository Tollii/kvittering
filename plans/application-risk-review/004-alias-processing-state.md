# 004 — Keep alias propagation from completing active processing

Priority: P2. Execution status is in the [plan index](../README.md).
Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

## Comparison with active work

See [the working-copy comparison](concurrent-work.md).

Alias propagation now participates in summary synchronization, but still
accepts every receipt with data. The processing-state defect remains open.

## Outcome and evidence

A member retries a previously read receipt. While extraction is active, another
save propagates a remembered category to that receipt. Alias propagation uses
the old receipt data and changes its status from `processing` to `reviewed` or
`needs_review`. The extraction completion then returns without saving its new
result. Paid work has run, but the receipt still contains its previous reading.

[convex/aliases.ts:170](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/aliases.ts) processes every receipt with
data, without excluding active processing.
[convex/receiptChanges.ts:84](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receiptChanges.ts) chooses a completed
status for alias changes.
[convex/processing.ts:200](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/processing.ts) requires `processing`
before accepting the extraction result. The [backend reproduction](reproductions.md)
observed `reviewed` after propagating an alias into a `processing` receipt.

## Scope and approach

Give the receipt transition rule an explicit decision for automatic changes
during active processing. Prefer deferring alias propagation for those receipts:
the processing pipeline already reapplies household aliases to new extraction
data. Confirm the timing when an alias changes after that step, and apply any
needed follow-up without discarding the extraction. Keep generation and revision
checks in the same transaction.

Dependencies: none. Coordinate with plan 008, which changes scheduling but does
not replace this state rule.

## Verification and completion

Extend `convex/receipts.test.ts`: begin reprocessing an existing receipt, apply
an alias, finish with distinguishable new extraction data, and assert that the
new data is persisted once and the category is correct. Also test a late result
after deletion and a newer generation. The existing alias tests use completed
receipts and cannot detect this transition.

Changing the propagation rule back to accepting every receipt with data must
fail the new test. Complete when no automatic category update prematurely exits
the processing state. No client contract change or data deletion is required.
