# Comparison with the active implementation

Compared on 24 September 2026, approximately 14:06 UTC, with
[Add API rate limits and caps](codex://threads/01a0d380-51a0-7c31-8b88-c3bd2636c74e).
The task was still active. Its checkout was
`/Users/andreas.tolnes/Developer/kvitto`, with HEAD
`09194c71364185708a24509ec81b44927716c923` and uncommitted changes. The review
worktree remains on `96331941a84ca8fcb23da55b06478afacfce3eac`.

This comparison includes the implementation files, not only the task's progress
messages. It does not certify a merged or deployed version. Links below point
to the other checkout and line numbers describe the observed working copy.
Recheck them after that task completes.

## Changes to the audit plans

| Plan                         | Already covered in the active task                                                                                                                         | Remaining work                                                                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 — Paid-work admission    | Transactional user/household receipt quotas; deployment-wide provider allowances; each outbound attempt charged; email sign-up flag; extraction output cap | Reuse these controls. Decide account-level catalog/evaluation allowances so one account cannot consume the shared allowance. Verify all provider paths and bounded request size. |
| 002 — Evaluation pause       | Evaluation now uses the shared TypeSafe allowance                                                                                                          | Still has no service check; a paid allowance is not a service pause.                                                                                                             |
| 003 — Draft preservation     | Durable receipt cache is separate from drafts                                                                                                              | Pending-save navigation guard is unchanged; durable server cache does not preserve unsaved editor values.                                                                        |
| 004 — Alias processing state | Alias mutations participate in receipt-summary updates                                                                                                     | Still processes any receipt with data, including an active extraction.                                                                                                           |
| 005 — Correction deletion    | Receipt deletion updates the local sync deletion record                                                                                                    | Still omits correction-batch copies from server cleanup.                                                                                                                         |
| 006 — Workflow retention     | New successful workflows schedule cleanup after 30 days                                                                                                    | Fix component selection; decide failure/cancellation and deletion behavior; handle preexisting journals.                                                                         |
| 007 — Read budgets           | Daily report aggregates, change synchronization, local receipt cache, and a byte cap on product-linking pages                                              | Editor context and legacy full-document reads remain; new sync pages/backfill need byte-budget checks; digest fallback still accumulates receipts before backfill is ready.      |
| 008 — Alias scheduling       | New summary triggers run with receipt writes                                                                                                               | Still schedules one full scan per remembered alias; now each affected write also updates the household sync sequence.                                                            |
| 009 — Five images            | No observed implementation                                                                                                                                 | Both capture/import and server reservation still allow eight.                                                                                                                    |

Plans 001, 006, and 007 are marked IN PROGRESS in the authoritative index because
that task implements part of them. Do not create a second rate limiter, cache,
aggregate model, or cleanup mechanism. The other plans remain open.

## Paid-work controls now present

[convex/rateLimits.ts:17](/Users/andreas.tolnes/Developer/kvitto/convex/rateLimits.ts:17)
defines 30 accepted receipt attempts per UTC day for both the user and household,
plus a token bucket with capacity 10 and refill of 10 per minute. Reservations
check for an existing client ID before charging; retry charges before starting
a new generation. Both checks and receipt writes share a transaction.

| Provider  | UTC day | Fixed 30-day window |
| --------- | ------: | ------------------: |
| OpenAI    |     300 |               3,000 |
| TypeSafe  |  10,000 |             100,000 |
| Kassalapp |  10,000 |             100,000 |

[convex/providerTransport.ts:6](/Users/andreas.tolnes/Developer/kvitto/convex/providerTransport.ts:6)
charges the corresponding persisted allowance before network I/O. The OpenAI
and TypeSafe SDK constructors and Kassalapp transport use it, including operator
evaluations and retries. Extraction also sets `max_output_tokens: 16000` at
[convex/providers.ts:77](/Users/andreas.tolnes/Developer/kvitto/convex/providers.ts:77).
The email-sign-up hook checks the server feature flag at
[convex/auth.ts:93](/Users/andreas.tolnes/Developer/kvitto/convex/auth.ts:93).
The flag defaults off; existing email sign-in remains enabled.

Thus the baseline statement that paid calls have no application ceiling does
**not** describe this newer working copy. A receipt-only account is limited to
30 accepted attempts within one UTC day; an hour across midnight can include
two daily windows, subject to the burst limit. Shared provider allowances bound
actual outbound attempts even when queued work or SDK retries multiply them.

There is still no account-specific catalog/evaluation allowance. One account can
consume the available shared TypeSafe or Kassalapp allowance and deny optional
service to other households. Request caps also do not constitute a currency
budget or bound the number of questions in a request. These are the remaining
plan 001 decisions; do not repeat the receipt/provider quota implementation.

The evaluation action still calls `releasePolicy.check` without a feature at
[convex/correctionEvaluation.ts:49](/Users/andreas.tolnes/Developer/kvitto/convex/correctionEvaluation.ts:49).
The provider wrapper at line 78 limits volume but does not check service flags.
Plan 002 remains necessary even after the rate-limit work is integrated.

## Workflow cleanup mismatch — P2

The new product-analysis launch uses
`WorkflowManager(components.productAnalysisWorkflow)` at
[convex/productAnalysis.ts:37](/Users/andreas.tolnes/Developer/kvitto/convex/productAnalysis.ts:37),
but registers the common completion callback at line 114. That callback schedules
`retention.workflowJournal`, which calls `cleanup` against **components.workflow**
at [convex/retention.ts:33](/Users/andreas.tolnes/Developer/kvitto/convex/retention.ts:33).
These are separate component instances, with separate workflow storage.

Concrete scenario: product analysis completes, 30 days pass, and its scheduled
cleanup runs against the receipt/catalog component. It cannot remove the journal
from the product-analysis component. The new retention mechanism therefore does
not yet close that part of plan 006. This is confirmed in source; the delayed
component cleanup was not executed in this comparison.

Keep the owning component in the completion context, or provide separate
callbacks. Add a component integration test that completes one workflow in each
component, advances the retention period, executes cleanup, and verifies the
actual journals are gone. Merely checking that a scheduled job exists would
miss this defect. The current `convex/retention.test.ts` tests expired catalog
records, not workflow journals.

The callback schedules cleanup only for a workflow result of `success`.
Provider failures caught inside a workflow can still result in a successful
workflow return, so those may be cleaned. Uncaught workflow failures and
cancellations have no cleanup in this callback. Old workflows started before
the new callback and receipt deletion before the retention deadline also need
an explicit policy. Do not claim immediate receipt-data erasure from a 30-day
completed-job retention policy.

## Read and synchronization work

The new digest path reads up to 45 daily aggregate rows after the backfill is
ready at [convex/digest.ts:186](/Users/andreas.tolnes/Developer/kvitto/convex/digest.ts:186).
This addresses the normal full-period digest accumulation. The old path remains
as a fallback at line 101. Product-linking pagination now applies a 500,000-byte
budget at [convex/productLinking.ts:53](/Users/andreas.tolnes/Developer/kvitto/convex/productLinking.ts:53).
Both are useful partial resolutions of plan 007.

Editor context still reads 50 full receipt documents at
[convex/receipts.ts:777](/Users/andreas.tolnes/Developer/kvitto/convex/receipts.ts:777).
The new sync endpoint loads up to 20 full receipts at
[convex/receiptSync.ts:85](/Users/andreas.tolnes/Developer/kvitto/convex/receiptSync.ts:85),
and backfill paginates 20 full receipts at line 158 without a byte cap. Twenty
documents can still exceed 16 MiB when each approaches the allowed document
size. Include these new paths in the large-payload deployment check; a local
cache reduces repeated reads but does not make each page fit automatically.

Every receipt write now updates one household sequence row at
[convex/receiptReadModel.ts:135](/Users/andreas.tolnes/Developer/kvitto/convex/receiptReadModel.ts:135).
This is a deliberate synchronization design, not a demonstrated contention
failure. It does supersede the baseline observation about independent receipt
writes. Test concurrent image attachments, workflow status updates, and alias
propagation in one household before claiming this path scales without conflicts.

The task also adds account-scoped image caching and persistent upload retry
deadlines. Those address extra network use; neither changes the pending-save
navigation guard, the eight-image input limit, or correction-batch retention.
New cache migrations, deletion synchronization, and device privacy checks remain
part of that implementation's release review. This comparison is not a full
audit of the new synchronization subsystem.

## Verification performed

The following existing tests from the other working copy passed independently:
**six files, 24 tests**, run at approximately 14:06 UTC.

```sh
npx vitest run convex/rateLimits.test.ts convex/auth.test.ts convex/retention.test.ts convex/receiptSync.test.ts src/lib/receipt-cache.test.ts src/lib/upload-queue.test.ts
```

They cover quotas, repeated reservations, counter rollback, blocked outbound
requests, sign-up control, cache recovery, synchronization, upload retry
deadlines, and catalog retention. They do not establish the missing workflow
cleanup behavior or close the remaining audit findings. The earlier task
reported 332 passing tests for its rate-limit stage; that report was not treated
as verification of its later, still-active cache and retention changes.

No source file in the other task was edited. No task message, deployment, merge,
or live setting change was made. The audit documents and status index were
updated to avoid duplicate implementation.
