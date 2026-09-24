# 005 — Remove deleted receipt data from correction batches

Priority: P2. Execution status is in the [plan index](../README.md).
Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

## Comparison with active work

See [the working-copy comparison](concurrent-work.md).

Deletion synchronization clears local receipt records, but backend cleanup
still omits correction batches. This plan remains open. Preserve the newer
sync deletion record while removing the retained correction payloads.

## Outcome and evidence

A household applies a correction to a receipt, then deletes that receipt.
`receipts.detail` returns null, but `corrections.batches` still returns its
original product name, text, amount, and category. Other household members can
read the supposedly deleted data through the public query.

[convex/corrections.ts:284](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/corrections.ts) stores complete previous
lines in the batch. The public query at line 340 returns those rows.
[convex/receipts.ts:573](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts) deletes four dependent tables
but excludes `correctionBatches`. The [reproduction](reproductions.md) observed
the retained `BATTERY REMIX` line after deletion and cleanup.

## Scope and approach

Extend deletion ownership to correction batch copies. Add an indexed association
or another bounded way to locate affected batches; avoid scanning every
household batch inside one deletion. Remove the deleted receipt's changes and
handle empty or partly removed batches explicitly. Undo must never recreate a
deleted receipt. Preserve unrelated receipts in a mixed batch.

Dependencies: none. Plan 006 covers a different retained copy. Backfill the
association for existing batches before relying on it. Historical orphaned
batch changes need a bounded cleanup after the new write behavior is deployed.

## Verification and completion

Promote the reproduction into `convex/corrections.test.ts` or the receipt
deletion suite. Apply a correction to two receipts, delete one, exhaust cleanup,
and verify that neither public batches nor stored batch changes contain that
receipt's payload. Undo the remaining batch and verify the surviving receipt.
Test repeated cleanup and household isolation.

Removing batch cleanup must fail the payload assertion. Complete when current
and preexisting batches obey the deletion contract. Test the backfill and
cleanup on representative isolated data before authorizing production cleanup;
do not restore removed personal data as a rollback mechanism.
