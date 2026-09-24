# Application structure

Use this map for ownership and data-flow changes. [Design principles](principles.md) explain the design preferences; [AGENTS.md](../AGENTS.md) lists task-specific references and checks.

Users capture or import receipts, review uncertain readings, and correct items and categories. Saved decisions reduce repeated work. Extraction turns images into purchases; Kassalapp supplies product and store information. Product families and quantity normalization support comparisons. Missing evidence remains explicit.

The Expo application starts in `src/app/_layout.tsx`. Session context contains account, household, connectivity, and local upload state. Active screens declare their receipt reads in `src/features/receipt-queries.ts`. History pages contain summaries. Reports wait until all pages in their purchase-date range are loaded. Product price history is a separate, explicit read.

## State and data contracts

- Convex queries return persisted data. Mutations write and return `null`, an ID, or a small acknowledgement. Existing subscriptions deliver changes; background work can use focused read queries. Live reads need no polling, manual refetch, or cache invalidation.
- Server completion and retries belong to the backend. Opening a screen must not be required to finish accepted work.
- Keep editable drafts separate from persisted data. Incoming query updates must preserve unsaved changes and revision checks. Derive other UI values from their source instead of keeping synchronized copies.
- Use React effects for external synchronization, event handlers for user actions, and render or pure functions for calculations. Give subscriptions, timers, persistence, and lifecycle listeners an owner and cleanup path.
- Read only the scope and fields needed. Avoid complete household history in root providers. Growing collections use indexes and pagination; background work uses bounded batches with continuation, not silent truncation.
- Startup renders from the owner's cached household while Convex authenticates; the server's answer, including "no household", replaces it. Uploads wait for the server-confirmed household.
- Persistent caches serve startup, offline use, or external providers. Their validity includes account/household scope, source, and completeness. A cached product summary is not a complete product record. Transport and cache policy belong behind feature interfaces; callers do not manage freshness.
- Failures a person can act on are thrown with `userError` (`convex/userErrors.ts`), a `ConvexError` whose `{ code, message }` reaches clients in production. Plain `Error` messages are redacted there, so use them only for defects and operator problems that should reach Sentry. `RECEIPT_CHANGED` marks revision conflicts; other rejections use `REJECTED`. The client reads them with `parseUserError` and records them as expected. The image upload route keeps user errors on its existing plain-text 403 response for installed clients.
- Separate tables when lifecycle, ownership, or retention differs. Table count alone does not justify merging them.

## Receipt flow

1. Capture claims an import batch. It retains the batch until conversion succeeds or the user dismisses it.
2. `receipt-storage.ts` copies images into durable storage and commits the queue to SQLite. It publishes immutable snapshots after commit. `receipt-upload-transport.ts` owns authenticated uploads; `upload-queue.ts` retains each completed step. After a failure it retries automatically with backoff (15 seconds, doubling) for at most six attempts per app start. A `REJECTED` user error waits for the person's retry. These limits live in memory, so each app start tries every queued capture again; they never remove queued images.
3. Convex processing extracts and parses receipt evidence, classifies products, checks duplicates, and applies saved household choices. `receiptChanges.ts` owns revision, history, status, and follow-up policy for receipt changes.
4. Catalog matching and product analysis run on the server. Profile questions use bounded batches. Writes reject stale generation, revision, or evidence. Exhausted analysis can be retried explicitly; `productAnalysis.repair` is an operator recovery operation.
5. `receipt-draft.ts` owns editor changes and save acknowledgement. The change subscription and bounded synchronization deliver the saved receipt. Report selections keep identity and period, then derive their content from current data.

Receipt approval checks material reading errors and duplicates. Category uncertainty
does not block approval, and approval does not confirm or remember suggested
categories. Explicit category edits still update household memory. Initial push
notifications are reserved for receipts that need review; requested reminders
keep their separate schedule and delivery checks.

The product-linking queue is an optional action in the Inbox header. Spending uses
one default purchase scope, with payment reconciliation and calculation details
in secondary views. New users explicitly start with the default household name
or join through an invitation; Settings permits an authenticated household rename.

## Identity and evidence

- Better Auth owns Apple and email/password accounts and sessions. Native Apple
  identity tokens are verified by the backend. Provider links require an
  authenticated session; email matching never links accounts automatically.
  An account-creation trigger rejects duplicate Apple identities in the same
  transaction as the provider-account write. Household membership and device
  queues continue to use the existing Kvitto identity.
  Settings subscribes to the authenticated account's Apple connection status.
  It does not keep a second local copy. One account component controls Apple
  linking and sign-out, and permits only one of these operations at a time.
- A receipt line preserves printed text and integer øre amounts. In code, amounts are `Ore` values combined only through the `Ore` operations; storage and client payloads keep plain numbers. See [quality checks](quality.md#money).
- A category alias records a household's category decision. It is not a product identity.
- A product reference is unresolved, explicitly separate, a household product, or an exact catalog product. The compatibility adapter projects legacy fields for installed clients.
- A catalog product describes one packaged item. A family groups the same product across package sizes. Purchased quantity is a separate interpretation.
- `product-evidence.ts` parses package notation once. Unknown or conflicting measurements remain explicit.

The analysis screen explains the largest observed price and quantity contributions
and identifies product families recorded only in the current comparison period.
Explanations use the same purchase projection as the numeric report, wait for all
period pages, and link to supporting receipt lines. They do not infer consumption,
first-time purchases, or missing product identities.

Add receipt issues in `receipt-issues.ts`; display text belongs in its mapper. Parse receipt input at the boundary and use the assessment in `receipt-review.ts`. Add category metadata in `categories.ts` and classifier evidence in `classification.ts`. Add reports to the typed registry in `src/features/spending-reports/reports.tsx`; use existing purchase projections for arithmetic.

## Table ownership

| Tables                                               | Owner and purpose                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| households, members                                  | Household membership, invitation, and budget                                |
| receipts, images                                     | Current receipt state and uploaded image references                         |
| receiptSummaries, receiptSyncHeads, receiptReadModel | Compact receipt records, synchronization cursor, and backfill state         |
| receiptDailyTotals                                   | Incremental daily spending totals and comparison categories                 |
| extractions                                          | Original provider output for each generation                                |
| revisions                                            | Prior receipt data before a committed non-extraction change                 |
| aliases, categoryMemory                              | Explicit and learned household category decisions                           |
| products, productMappings                            | Household identities and remembered product choices                         |
| corrections, correctionBatches                       | Human decisions, bulk changes, and guarded undo                             |
| catalogRequests, catalogRequestWaiters               | Shared catalog work and workflow completion                                 |
| catalogProducts, catalogStores                       | Shared catalog records; detail freshness is separate from summary freshness |
| productFamilies, productProfiles                     | Household family identity and reusable analysis evidence                    |
| receiptReminders                                     | One pending receipt-review reminder per device subscription and receipt     |
| deviceSubscriptions                                  | Device notification destinations                                            |
| clientReleases                                       | Installed-client diagnostics                                                |
| releasePolicies, releasePolicyHistory                | Native/API version controls and operator history                            |
| featureFlags, featureFlagHistory                     | Platform-scoped service configuration and operator history                  |

Convex components own their workflow, workpool, and authentication tables. Revision retention is a separate operator decision.

## Presentation and checks

`src/components/ui.tsx` is an import facade. Typography, controls, surfaces, layout, and selection views have separate modules. Feature screens own state and use these components directly.

Native camera, PDF import, sheets, large text, light/dark mode, offline restart, and old-client upgrades require device checks. Source tests do not prove those behaviors. See [quality checks](quality.md) and [release policy](releases.md) for verification procedures.

## API abuse controls

Receipt admission and explicit retries use transactional user and household quotas.
Each external provider has a separate deployment-wide allowance, consumed before
network I/O. Email registration uses the `emailSignUp` feature flag in both the
sign-in screen and the authentication route. See [API limits](api-limits.md) and
[feature flags](featureFlags.md#email-registration) for policy and operations.

## Receipt read storage and cost

Receipt mutations maintain compact summaries, daily report totals, and a
household change sequence in the same transaction. New phones synchronize
bounded changes into a separate SQLite cache. Tabs, receipt details, search,
and product history read this cache. One small foreground subscription reports
new changes; inactive tabs do not keep broad receipt subscriptions alive.
Queued uploads and editor drafts remain separate from disposable caches.

See [Convex operating cost](convex-costs.md) for synchronization, backfill,
retention, release order, and usage measurements. Existing receipt endpoints
remain available to installed clients and during the backfill.

## Workflow journal retention

Receipt processing and catalog matching use the processing workflow component.
Product analysis uses its own component. `workflowJournals` stores the component,
workflow ID, receipt ID, and cleanup deadline. It stores no receipt payload.
All terminal outcomes retain diagnostics for 30 days. Receipt deletion schedules
cancellation of active associated work and cleanup of terminal journals. Cleanup
uses the component API and does not force deletion of active journals.

A daily bounded inventory discovers older journals in both components. Existing
terminal journals get a full 30-day grace period from first discovery. Journals
for receipts already deleted are cleaned after discovery, including cancellation
of active work. Legacy null completion contexts and old scheduled arguments
remain valid. A failed callback is recovered by the inventory. This additive
association table requires no receipt backfill and no client minimum change.

## Receipt read budgets

Full-receipt pages use a server-selected 500,000-byte budget as well as row
limits. One document can exceed the page target; the maximum document size
still bounds that read. Clients must continue across empty filtered pages until
`isDone`. This also applies to the legacy list API. Recent category suggestions
and Spotlight use bounded samples. The attention indicator reports a lower
bound once either status has five receipts, using an index that excludes
receipts omitted from reports. This avoids scanning excluded documents.

The pre-backfill digest fallback reduces each bounded receipt page into daily
totals. It retains at most the days in the report period. Normal digests still
use persisted daily totals. Synchronization and backfill keep their existing
4 MiB budgets; synchronization also bounds its returned full-record payload.
