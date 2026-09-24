# Risk plan implementation

Starting revision: `8564c4c7287d936161b3d63041c5a0bfe2a44c0c`.
Branch: `codex/application-risk-review`, in its dedicated worktree.

The user authorized implementation and local commits for all nine plans.
This base includes the committed API safeguards and receipt caching work.
It does not include the separate verification-tooling branch used for the audit.
The original findings retain immutable source links to the audited revision.
Use the plan index for status; this record holds implementation and verification
results. No deployment or release-minimum change is part of this task.

## Verification approach

Use focused behavioral tests and the base revision's `check`, `check:ci`, and
formatting checks. Prove each new defect check fails before applying its fix
where practical. Preserve old public and scheduled arguments. Local fixture
rehearsals cover additive persisted-data changes; live deployment and signed
device upgrade checks remain separate release work.

## 002 — Evaluation service pause

Category evaluation now uses the receipt-processing service guard. Shared
service guards check both platform scopes, so caller-provided platform metadata
cannot bypass a pause. A backend test first failed by reaching TypeSafe during
the pause, then passed after the change. It also checks successful resumption
and legacy callers. Current screens do not expose evaluation; its endpoint is
retained for older installed clients.

## 004 — Alias propagation during processing

Alias propagation skips active receipts. Extraction completion applies current
household decisions, including decisions made while processing was active.
Manual categories and edited receipt data keep their existing precedence. The
new backend test reproduced premature completion before the fix. It now checks
that extraction completes and remains idempotent. `check:ci` passed.

## 005 — Correction history deletion

Receipt deletion schedules a bounded scan of that household's existing batches.
It removes only that receipt's changes and deletes empty batches. Mixed batches
retain undo for surviving receipts. Each transaction reads one batch; its fixed
creation boundary prevents new batches from extending the job.

The internal `retention.orphanedCorrectionBatches` operation repairs older
orphan copies with the same rule. Run it once after deployment; it was not run
against a live deployment here. Fixture tests verify mixed-batch undo, private
household access, repeated cleanup, and historical orphan repair. All 347 tests
and `check:ci` passed. No schema migration or new association is required.

## 006 — Workflow journal retention

All three workflow families record their component and receipt association.
All terminal outcomes have a 30-day deadline. Deletion cancels active associated
work and cleans terminal journals. Daily bounded inventories recover missed
callbacks and discover older runs in both components. Older terminal runs get
30 days from discovery; old receipt deletion is handled on discovery.

Component integration tests store sensitive step arguments and results, then
verify actual removal for success, failure, cancellation, legacy inventory,
and receipt deletion. They verify that active journals remain readable before
deletion and that repeated cleanup is safe. The new table is additive; old
callback contexts and scheduled arguments remain accepted. No live cleanup was
run. A hosted recovery/replay exercise remains part of release verification.

## 007 — Receipt read budgets

Legacy and current full-receipt pages now enforce server byte budgets. Editor
suggestions, correction previews, Spotlight, duplicate detection, alias scans,
and analysis repair also have bounded reads. A new additive status/exclusion
index bounds attention counts and pending-receipt lookup. The count explicitly
reports its lower-bound status instead of scanning arbitrary excluded history.
Digest fallback retains daily aggregates instead of all receipt payloads.

Large valid receipt fixtures verify that callers cannot increase the page byte
budget, cursors deliver every receipt, empty filtered pages remain incomplete,
and fallback/aggregate digests agree. The existing sync and backfill byte caps
were retained and tested with the same large data. In-process checks do not
measure hosted transaction contention or action memory. Hosted load and recovery
checks remain release work; no projection was deployed or backfilled here.

## 008 — Alias scheduling

A save schedules one household traversal containing only changed alias keys.
Repeated unchanged choices schedule no propagation. Each page applies all keys
before committing one revision per affected receipt. A fixed creation boundary
excludes later receipts; their normal extraction completion applies aliases.
The old single-key scheduled function remains compatible.

The integration test checks scheduled work across two pages, manual category
precedence, a later receipt outside the boundary, one revision per target,
idempotent continuation, and an unchanged repeated save. All 354 tests and
`check:ci` passed. No association backfill is needed.

## 009 — Five images and legacy queue recovery

New capture/import, durable admission, and server reservations share a five-image
policy. Existing reservations remain recoverable up to their persisted count of
eight. This is an explicit temporary provider-input exception for old data, not
a client-version bypass. Existing unreserved queues retain all files after a
count rejection. Inbox offers deliberate image selection into two groups, in
one SQLite transaction, only when no upload attempt is active.

Checks cover new counts, position bounds, legacy reservation reuse, image/PDF
import rejection and retry, queue operation locking, transaction rollback,
account scope, reserved entries, and unknown future payload preservation. Native
PDF code already rejects oversized documents before rendering; it does not
truncate them. Signed-device camera, background upload, and installed-client
upgrade flows remain release checks. Client recovery must precede backend
count enforcement. No backend or native release was published here.

## 003 — Durable editor drafts

A scoped SQLite record preserves dirty values, validation errors, product
choices, and the original revision. Draft storage is independent of the upload
queue and disposable cache. The editor blocks unknown persisted formats without
changing them. Newer remote revisions retain the draft and use the existing
explicit conflict flow. Pending saves keep navigation protection active.

SQLite tests cover restart, account isolation, future formats, write failure,
and cleanup only after acknowledgement plus snapshot, discard, or deletion.
A React DOM component harness exercises the actual navigation hook with a
pending save, Back, rejection, visible edited text and error, successful save,
and explicit discard. Restoring the old guard makes that check fail. The harness
uses supported React DOM and Happy DOM instead of the deprecated test renderer.
No native module changed. A signed-device update-gate/restart and gesture flow
remains required before distribution; it was not simulated as a real device run.

## 001 — Paid-work admission

The existing limiter now also admits new catalog jobs, category evaluations,
and manual matching/analysis starts per user and household. Cached and current
work is free. Every newly attributed provider attempt also has user/household
hourly and daily caps before the shared deployment caps. Receipt source and
catalog payer metadata are resolved from persisted records. Automatic work,
manual retries, and SDK retries use the same attribution. Old journaled calls
and trusted operator evaluations retain global limits. No public caller can
select an unattributed provider operation.

Catalog classification uses 12-product batches, with at most 108 questions per
request. Initial allowance values and their fixed UTC windows are documented
in `docs/api-limits.md`. They are operating choices, not currency budgets or
measurements of normal traffic. New catalog payer metadata is optional for old
rows; internal optional arguments and replay options preserve existing journals.

Checks cover concurrent admission, shared-household limits, cache reuse, hourly
recovery, other-household access, manual processing reuse, background attribution,
and actual SDK retry effects. The OpenAI test supplies five images and observes
only one network attempt when the retry exceeds the actor limit. No paid service
was called. Hosted contention and signed-client behavior remain release checks.

## Cleanup follow-up

Final integration checks found two cleanup edge cases. Correction cleanup now
uses the newest persisted creation timestamp, so a fractional timestamp cannot
fall beyond a wall-clock boundary. Catalog notification removes only an obsolete
waiter when the installed workflow API confirms its event no longer exists.
Other notification failures still propagate. A component test removes the actual
workflow journal and then verifies that catalog notification clears its waiter.

## Final verification

All nine plans are implemented in local commits based on `8564c4c`. The other
task remains complete at that revision. `npm run check:ci` passed, including
375 application tests in 63 files, lint, types, formatting, and the lint-rule
tests. The iOS JavaScript export also passed. No paid provider was contacted.

DONE in the plan index means local implementation and verification are complete.
Hosted contention, load, workflow replay, and signed-device upgrade checks were
not run. The client recovery flow must ship before stricter image-count
enforcement. Existing eight-image reservations retain their original capacity.
The historical correction cleanup remains an operator step after deployment.
No code was pushed or deployed, and no release minimum was changed.
