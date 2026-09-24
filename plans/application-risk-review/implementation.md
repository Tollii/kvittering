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
