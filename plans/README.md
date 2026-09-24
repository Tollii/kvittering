# Kvitto simplification review

## Application risk review — 24 September 2026

Review complete. Implementation is now authorized on this branch, starting from
`8564c4c7287d936161b3d63041c5a0bfe2a44c0c`. See the
[implementation record](application-risk-review/implementation.md). Original audit baseline:
`96331941a84ca8fcb23da55b06478afacfce3eac`, from
`claude/happy-archimedes-lyjuqa` before merge. Dedicated review branch:
`codex/application-risk-review`. Implementation changes follow the audit.

Read the [risk report](application-risk-review/report.md),
[public surface inventory](application-risk-review/public-surface.md),
[paid-call analysis](application-risk-review/paid-calls.md), and
[verification record](application-risk-review/verification.md).
The review covers all 52 public functions and six HTTP route entries. The 122
selected existing tests passed. Three defects were reproduced; a fourth failing
check demonstrates the user-requested five-image limit. Each plan records
source evidence, a concrete scenario, priority, and an observable proposed check.

The [active-work comparison](application-risk-review/concurrent-work.md) checks
**Add API rate limits and caps** against the audit. Plans 001, 006, and 007
are partly implemented there. Six focused files with 24 tests passed in that
working copy. Reuse that work; the baseline findings are not all still unchanged.

| Plan | Title | Priority | Dependencies | Status |
| --- | --- | --- | --- | --- |
| [001](application-risk-review/001-paid-work-admission.md) | Complete paid-work admission coverage | P1 | Existing receipt/provider limits in the other task | IN PROGRESS |
| [002](application-risk-review/002-evaluation-service-pause.md) | Apply service pauses to category evaluation | P1 | None; coordinate with 001 | DONE |
| [003](application-risk-review/003-draft-preservation.md) | Preserve drafts through pending saves and required updates | P1 | None | DONE |
| [004](application-risk-review/004-alias-processing-state.md) | Keep alias propagation from completing active processing | P2 | None | DONE |
| [005](application-risk-review/005-correction-history-deletion.md) | Remove deleted receipt data from correction batches | P2 | None | DONE |
| [006](application-risk-review/006-workflow-retention.md) | Complete workflow payload retention | P2 | Existing retention callback; coordinate with 005 | DONE |
| [007](application-risk-review/007-receipt-read-budgets.md) | Complete receipt read budgets | P2 | Existing summaries and cache in the other task | DONE |
| [008](application-risk-review/008-alias-work-scheduling.md) | Bound and combine household alias propagation | P2 | Coordinate with 001 and 004 | DONE |
| [009](application-risk-review/009-five-image-limit.md) | Limit new receipts to five images | P2 | Legacy queue recovery before enforcement | DONE |

Implement the remaining work as small changes. Start with 002–004 while the
other task completes its overlapping work. Plan 001 now concerns remaining
admission coverage, not a second receipt/provider limiter. Do not combine the
plans into one application-wide implementation. This table is the authoritative
status index for this review; the older simplification plans below keep their
existing status.


## Product simplification assessment — 23 September 2026

Status: IMPLEMENTED. See the [product assessment](product-simplification.md) for
approved changes, sub-agent review fixes, and verification limits. Product linking
remains accessible from the Inbox header. Inbox and History remain separate.
These product changes are separate from the completed technical plans below.

Read [the HTML report](simplification-review/report.html) for findings, all 23 tables, all 26 effects, architecture, evidence limits, and implementation packages.

Audited commit: `af69fdafc24ae0b2367989e5203f50067b2479d8`, 2026-09-19. Application code was unchanged during the audit. Typecheck, lint, and all 148 tests passed. All 19 plans are implemented in separate commits. See [the final verification record](simplification-review/verification.md) for checks and remaining native/release limits. The findings and source counts below describe the audit baseline.

## Follow-up: Convex reactivity and optional fields

The report now explains where reactive queries can replace polling. Plans 007 and 017 are implemented. Convex 1.46.0 was already current. A separate source update adopts fluent optional validators and removes absent metadata placeholders; see [the migration record](../docs/optional-metadata-migration.md). Cited source lines describe the audit baseline; use the implementation records for the completed changes.

## Follow-up: PR #5 interface maintainability review

Status: DONE. The strict review of [PR #5](https://github.com/Tollii/kvittering/pull/5)
found no confirmed material maintainability issues. All 32 changed source files
and affected contracts were reviewed. The rebase onto `d90baf8` preserves the
reviewed patch. No application fixes were required.

The calendar grid and large-text list share purchase calculations and selection.
Form sections own their surfaces. Submit eligibility has one owner per form.
No changed file crosses 700 or 1,000 lines. The receipt editor grows from 1,147
to 1,165 lines; its existing size is accepted here because the changes adjust
local layout and list separators without adding state or orchestration.

`npm run check` passed with 297 application tests and 13 lint-rule tests.
The existing calendar and large-text receipt captures were inspected. No new
native interaction or live-service tests were run. The [interface verification
limits](../docs/interface-review.md#limits) still apply.

## Follow-up: PR #6 authentication maintainability review

Status: DONE. The strict review of
[PR #6](https://github.com/Tollii/kvittering/pull/6) found two issues in the
original `src/features/apple-account.tsx` and its Settings caller:

- The connection-status effect (lines 22–49) and link handler both wrote a
  local boolean. Removing a link elsewhere could leave Settings reporting that
  Apple was still connected. Replaced both writes and the refresh effect with
  the authenticated `auth.appleConnected` subscription. The query returns no
  account status after sign-out and cannot read another user's links.
- The link handler (lines 51–79) had its own operation lock, while sign-out
  used a separate Settings lock. Sign-out could therefore run during a link
  request. `AccountSettings` now owns both actions and their shared lock.

The backend account-creation trigger is retained. Better Auth 1.6.33 checks only
the current user's existing accounts in its native identity-token linking path.
The Convex trigger enforces Apple identity uniqueness within the write
transaction. An HTTP hook outside that transaction would not provide that guarantee.

No changed source file crosses 700 or 1,000 lines. The synchronous submission
references are retained to prevent duplicate presses before React renders the
pending state. No additional state library or account table is needed.

The maintainability gate passes with both findings fixed. `npm run check` and
`npm run check:ci` pass with 311 application tests and 13 lint-rule tests. The
extended authentication tests cover connection status before and after linking,
unlinking, account isolation, and session removal. The iOS JavaScript export
also passes. The shared account-operation guard was reviewed in source; no new
native interaction test was run.

This review compares with `main`; it does not
establish the oldest installed binary or live release-policy adoption. A new
native build and signed physical-device authentication tests remain required
before distribution. No backend deployment, OTA update, or minimum-version
change is part of this review.

## Read and write contracts

Mutations perform writes and return null, an ID, or a small acknowledgement. Queries return persisted objects. Mounted screens receive persisted changes automatically through their existing reactive query, without a manual refetch. Background workflows can use a focused read query when they need persisted data. Preserve draft edits and revision checks across either response order. Plans 006 and 009 no longer recommend returning complete receipts or profiles from mutations. This separation does not require another database or a command framework.

## Recommended execution order

Start with 001, 002, 003, and 004. They fix demonstrated state/model defects and establish shared boundaries. Continue in the order below; respect dependencies. Small independent fixes 011 and 015 can be selected separately. Execute 019 last; it consolidates feature flags under featureFlags and reuses Convex subscriptions instead of refresh timers.

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| [001](simplification-review/001-receipt-draft-state.md) | Give each edit one draft state | P1 | M–L | None | DONE |
| [002](simplification-review/002-package-evidence.md) | Parse package evidence once | P1 | M | None | DONE |
| [003](simplification-review/003-catalog-cache-completeness.md) | Distinguish a catalog summary from fetched details | P1 | S–M | None | DONE |
| [004](simplification-review/004-purchase-projection.md) | Use one purchase projection for reports and price signals | P1 | M–L | 002 | DONE |
| [011](simplification-review/011-capture-import-state.md) | Make shared-file import an explicit operation | P1 | S–M | None | DONE |
| [005](simplification-review/005-typed-review-assessment.md) | Separate review decisions from displayed sentences | P2 | M | None | DONE |
| [006](simplification-review/006-receipt-write-policy.md) | Give receipt changes one transaction policy | P2 | M | 005 | DONE |
| [007](simplification-review/007-server-owned-analysis.md) | Complete backend scheduling before removing UI workers | P2 | M | 006 | DONE |
| [008](simplification-review/008-product-identity-resolution.md) | Resolve purchased product identity once | P2 | L | 002, 006 | DONE |
| [009](simplification-review/009-batched-product-analysis.md) | Batch independent Jev analysis questions | P2 | M | 002 | DONE |
| [010](simplification-review/010-local-receipt-store.md) | Expose stable local receipt snapshots | P2 | M | None | DONE |
| [015](simplification-review/015-application-lifecycle-cache.md) | Give query lifecycle and cache removal explicit owners | P2 | S–M | None | DONE |
| [017](simplification-review/017-catalog-request-observation.md) | Observe catalog completion without polling mutations | P2 | M | 003, 015 | DONE |
| [012](simplification-review/012-receipt-read-boundaries.md) | Load receipt data where it is needed | P2 | M | 004, 007 | DONE |
| [018](simplification-review/018-bounded-background-reads.md) | Replace arbitrary history limits with complete bounded reads | P2 | M–L | 004, 012 | DONE |
| [016](simplification-review/016-spending-report-selection.md) | Keep report selections linked to current data | P2 | S–M | 004, 012 | DONE |
| [014](simplification-review/014-typed-classification-contracts.md) | Keep classification evidence and taxonomy typed | P2 | M | None | DONE |
| [013](simplification-review/013-module-and-table-cleanup.md) | Remove dead paths and separate large presentation modules | P3 | S–M | 001, 012, 016 | DONE |
| [019](simplification-review/019-feature-flags.md) | Make featureFlags simple to define and consume | P2 | M | 015; execute last | DONE |

Status values: TODO, IN PROGRESS, DONE, BLOCKED (reason), REJECTED (reason).

## Read scope and repeated requests

The follow-up read review confirms full-history loading in the root provider, two-second catalog mutation polling, repeated per-line preparation, and arbitrary historical/recipient limits. Plans 007, 009, 010, and 012 cover existing owners; 017 separates catalog commands from result observation, and 018 adds bounded continuation to background reads. 017 follows 003 and 015; 018 follows 004 and 012.

## Feature flags

[Plan 019](simplification-review/019-feature-flags.md) separates featureFlags from app-version requirements. Define each flag/default once, consume it through useFeatureFlag, and let a shared Convex subscription keep it current. No TTL or polling is needed for live values. Keep only a parsed, deployment-scoped last-known snapshot for startup/offline use. Server guards use current transactional state.

## Function contracts

The follow-up review adds pure decision functions, narrow semantic inputs, explicit results, and checked type transitions as acceptance criteria for all packages. See the Function contracts section of the HTML report and the embedded requirements in each plan. The strongest changes are in 002, 005, 006, 008, 010, and 014. Parsing establishes structural facts; approval, ownership, and current revisions need separate evidence. The implementation records describe the resulting source changes.

## Dependencies and execution limits

- 002 supplies common package evidence for 004, 008, and 009.
- 005 supplies typed assessment for 006; 006 supplies transaction policy for 007 and 008.
- 007 must prove server completion/retry paths before deleting client repair effects.
- 004 and 007 precede 012 so report completeness and backend ownership stay clear.
- 004 and 012 precede 016. 001, 012, and 016 precede the final presentation cleanup in 013.
- 019 runs last and reuses lifecycle ownership from 015. It must preserve the flag consumers revised by earlier packages.
- Plans overlap in schema, receipt routes, session, and worker files. Execute one overlapping package at a time. Any parallel execution needs explicit file ownership.
- The audit did not authorize implementation. The later user request authorized implementation and one commit per plan. No deployment, live data deletion, push, or publication was performed.
- No native modules were added. Source compatibility review is recorded in the final verification record; installed-client and live release checks remain required before release.

## Findings considered and rejected

- Do not replace Convex, TanStack Query, or SQLite with another state library. Their responsibilities differ; the problem is ownership at their boundaries.
- Do not merge aliases with categoryMemory. Explicit identity memory and learned category confidence have different keys and trust rules.
- Do not merge catalogRequests, catalogRequestWaiters, and catalogProducts. They represent request coordination, workflow subscriptions, and reusable entities.
- Do not delete extractions because the editor ignores readings. Remove the unused query payload; retain original provider evidence.
- Do not delete revisions by inference. No app history reader was found, but audit retention is an operator decision. correctionBatches supplies undo.
- Do not remove all effects. Native subscriptions, timers, persistence, telemetry, and the durable local upload queue are external synchronization.
- Do not flag every runQuery/runMutation wrapper as redundant. Action and workflow boundaries require registered functions; an in-transaction helper has different semantics.
- Do not turn all receipt line fields into a large discriminated union in one change. Introduce types at demonstrated failure points: review issues, product identity, package evidence, and operation state.
- Do not delete public/internal endpoints based only on graph fan-in. Generated API references, scheduled functions, and workflow callbacks require source verification.
- Do not add an application request-per-minute limiter. Keep shared requests, cache freshness, bounded work, and graceful 429 handling.
- Do not add more fixture infrastructure or tests that prove deleted code stays deleted. Keep the active mock-provider mode and test the behavior that remains.
- Do not split every domain function by line count. Most domain modules are cohesive and below 430 lines. Split overloaded owners first.

## Evidence limits

Source and deterministic local probes establish the findings. The audit did not test the iPhone UI, call AI/catalog providers, inspect live Convex data volumes, benchmark runtime performance, or validate production services. Test success is a baseline, not proof that the identified behaviors are correct.
