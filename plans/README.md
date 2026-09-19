# Kvitto simplification review

Read [the HTML report](simplification-review/report.html) for findings, all 23 tables, all 26 effects, architecture, evidence limits, and implementation packages.

Audited commit: `af69fdafc24ae0b2367989e5203f50067b2479d8`, 2026-09-19. Application code was unchanged during the audit. Typecheck, lint, and all 148 tests passed. These plans are proposed work.

## Follow-up: Convex reactivity and optional fields

The report now explains where reactive queries can replace polling. Plans 007 and 017 remain TODO. Convex 1.46.0 was already current. A separate source update adopts fluent optional validators and removes absent metadata placeholders; see [the migration record](../docs/optional-metadata-migration.md). Recheck cited source lines before executing a plan.

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
| [018](simplification-review/018-bounded-background-reads.md) | Replace arbitrary history limits with complete bounded reads | P2 | M–L | 004, 012 | TODO |
| [016](simplification-review/016-spending-report-selection.md) | Keep report selections linked to current data | P2 | S–M | 004, 012 | TODO |
| [014](simplification-review/014-typed-classification-contracts.md) | Keep classification evidence and taxonomy typed | P2 | M | None | TODO |
| [013](simplification-review/013-module-and-table-cleanup.md) | Remove dead paths and separate large presentation modules | P3 | S–M | 001, 012, 016 | TODO |
| [019](simplification-review/019-feature-flags.md) | Make featureFlags simple to define and consume | P2 | M | 015; execute last | TODO |

Status values: TODO, IN PROGRESS, DONE, BLOCKED (reason), REJECTED (reason).

## Read scope and repeated requests

The follow-up read review confirms full-history loading in the root provider, two-second catalog mutation polling, repeated per-line preparation, and arbitrary historical/recipient limits. Plans 007, 009, 010, and 012 cover existing owners; 017 separates catalog commands from result observation, and 018 adds bounded continuation to background reads. 017 follows 003 and 015; 018 follows 004 and 012.

## Feature flags

[Plan 019](simplification-review/019-feature-flags.md) separates featureFlags from app-version requirements. Define each flag/default once, consume it through useFeatureFlag, and let a shared Convex subscription keep it current. No TTL or polling is needed for live values. Keep only a parsed, deployment-scoped last-known snapshot for startup/offline use. Server guards use current transactional state.

## Function contracts

The follow-up review adds pure decision functions, narrow semantic inputs, explicit results, and checked type transitions as acceptance criteria for all packages. See the Function contracts section of the HTML report and the embedded requirements in each plan. The strongest changes are in 002, 005, 006, 008, 010, and 014. Parsing establishes structural facts; approval, ownership, and current revisions need separate evidence. Application code remains unchanged.

## Dependencies and execution limits

- 002 supplies common package evidence for 004, 008, and 009.
- 005 supplies typed assessment for 006; 006 supplies transaction policy for 007 and 008.
- 007 must prove server completion/retry paths before deleting client repair effects.
- 004 and 007 precede 012 so report completeness and backend ownership stay clear.
- 004 and 012 precede 016. 001, 012, and 016 precede the final presentation cleanup in 013.
- 019 runs last and reuses lifecycle ownership from 015. It must preserve the flag consumers revised by earlier packages.
- Plans overlap in schema, receipt routes, session, and worker files. Execute one overlapping package at a time. Any parallel execution needs explicit file ownership.
- No deployment, data deletion, commit, or publication is part of this report.
- New native modules are not proposed. A later implementation still needs release review if it changes backend contracts or local payload formats.

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
