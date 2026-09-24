# Application architecture

This guide explains ownership and cross-component constraints. Exact limits, schemas, configuration, and individual feature behavior belong in source. Use [principles](principles.md) for design decisions and [release review](../.agents/skills/release-review/SKILL.md) when contracts change.

## Ownership

Convex owns household access, persisted receipts, and server processing. Authorization, revision checks, and related writes share one transaction. Mutations return a small acknowledgement; queries and subscriptions deliver persisted state. Accepted work must finish without an open screen.

The phone has three distinct kinds of local state: durable upload work, unsaved editor drafts, and disposable read caches. Cache cleanup must not delete queued images or edits. Startup can render the cached household while authentication completes, but uploads wait for server-confirmed membership. The server response, including no membership, replaces the startup fallback. Scope includes the deployment, account, and household so changing backend or identity cannot expose another scope's data.

| Responsibility                           | Source entry point                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application and session composition      | [Root layout](../src/app/_layout.tsx), [session](../src/features/session.tsx)                                                                                 |
| Durable capture and upload               | [Receipt storage](../src/lib/receipt-storage.ts), [upload queue](../src/lib/upload-queue.ts), [transport](../src/lib/receipt-upload-transport.ts)             |
| Receipt write policy and derived records | [Receipt changes](../convex/receiptChanges.ts), [mutation builders](../convex/serverFunctions.ts)                                                             |
| Local read synchronization               | [Receipt sync](../convex/receiptSync.ts), [cache provider](../src/features/receipt-cache-provider.tsx), [read interfaces](../src/features/receipt-queries.ts) |
| Product and quantity evidence            | [Product evidence](../src/lib/domain/product-evidence.ts), [analysis worker](../convex/productAnalysisWorker.ts)                                              |
| Tables and indexes                       | [Schema](../convex/schema.ts)                                                                                                                                 |
| API compatibility and service controls   | [Client guards](../convex/clientFunctions.ts), [release policy](../convex/releasePolicy.ts), [feature flags](../convex/featureFlags.ts)                       |

## Receipt flow

Capture retains an import batch until conversion succeeds or the user dismisses it. Storage commits durable images and queue state before publishing a snapshot. Uploads retain reservation identity and completed steps across failure, so retries do not create another receipt. Supported iOS builds can transfer scheduled images while suspended; force-quit, expired credentials, and unscheduled work can require reopening the app.

After upload, Convex extracts receipt evidence, classifies items, checks duplicates, applies household choices, and schedules catalog and product analysis. Completion and bounded retries belong to the server. Generation, revision, and evidence checks reject stale results. Operator repair is separate from normal screen reads.

Approval means material reading errors and duplicates have been addressed. It does not turn a suggested category into a confirmed decision. Category refinement and product linking remain optional; explicit corrections can teach household memory. This separation prevents ordinary receipt review from requiring catalog maintenance.

The editor persists dirty values synchronously in a separate SQLite draft store, scoped by deployment, account, household, and receipt. It retains the baseline revision through sign-out, policy gates, and restart. A newer server revision requires explicit conflict resolution. Unknown future formats stay untouched and block editing. A save acknowledgement can arrive before or after the updated read; neither order may discard a later edit. The durable draft remains until acknowledgement and the corresponding server snapshot arrive; explicit discard or completed deletion removes it. Failed disk writes retain live edits and show an error. Reports retain a selected identity and period, then derive the selected content from current data instead of keeping a second copy.

## Read model and retention

Receipt mutations update the canonical receipt, compact summary, daily totals, and household change sequence together. Use the application mutation builders: raw generated mutations and direct dashboard edits bypass those triggers. Administrative repair must reconcile derived records too.

A small foreground subscription announces household changes. The phone downloads bounded pages into SQLite and commits records with their synchronization cursor. Ordinary navigation reads the local copy. The change stream stores the current entry for each receipt, not every edit; a receipt changed during download is read under its later sequence. Deletion markers let a phone catch up after a long offline period.

Reports require complete data for their scope. During initial synchronization, a server aggregate can supply the headline without claiming the local history is complete. Offline reports describe the last complete copy. Existing bounded reads remain available while the server read model is being backfilled, or when the disposable cache cannot open or accept a page. Full-record reads have byte budgets as well as row limits; clients continue across empty filtered pages until completion.

Caches can be rebuilt; receipt originals, revision evidence, corrections, and unfinished uploads cannot be treated as caches. Keep catalog identities that receipts reference even when request results expire. Clean workflow journals through the component API. A payload-free association tracks receipt, workflow component, and cleanup deadline for every terminal outcome. A bounded inventory recovers missed callbacks and older journals; deletion cancels associated active work before cleanup. Active journals are never force-deleted. A database restore needs an explicit device-cache invalidation and reconciliation plan, not only a successful import.

## Evidence and purchase calculations

Printed receipt text and integer øre amounts are the evidence for purchases. Domain calculations use `Ore` operations; serialized storage and client payloads remain numbers. Category memory records a classification decision; it does not establish product identity. A packaged catalog product, an equivalent candidate group, a product family, and purchased quantity serve different purposes.

Equivalent catalog links can help users recognize an item without establishing its barcode, weight, ingredients, or exact-product price. Do not use a representative group's image as authority to fetch that representative's details for the purchased item. Catalog summaries and fetched details have separate completeness and freshness.

Parse package notation once and preserve conflicting evidence. A catalog pack count that conflicts with the receipt cannot fill a missing quantity. Unknown quantities stay unknown. Families can span package sizes while keeping brands and variants distinct; physical-quantity comparisons and item-count comparisons therefore need different evidence.

Reports share purchase projections and receipt amounts after discounts. Price changes can reflect stores, discounts, or package choices; they are not a measure of inflation. A product recorded only in the current period is not proof of a first purchase. Explanations must use the same projection as the figures and link to supporting lines. These reports describe purchases, never measured consumption.

Correction propagation and undo check the receipt revisions used by the preview. They must not overwrite a later manual decision or turn one correction into several independent learning examples. Fixed model examples and agreement with recorded corrections do not establish accuracy across all purchases.

## External boundaries

Better Auth owns accounts and sessions. Provider linking requires an authenticated session, and a transactional account trigger enforces Apple identity uniqueness. Matching email addresses must not link accounts automatically. Application household identity remains stable when a provider is linked.

Shared catalog requests and provider caches can cross households; receipt data and saved corrections cannot. Provider calls run on the backend, with persisted allowance consumed before network I/O. Admission and scheduling of new optional paid work share a transaction. Provider attempts have deployment, user, and household limits with server-resolved attribution; retries keep the same source. Legacy journaled calls retain their accepted arguments and deployment limits. Retries and uncertain outcomes still cost requests. Request caps and billing alerts are not exact monetary ceilings.

Service flags control availability, not authorization. The client uses a scoped persisted fallback for offline presentation; server writes check current values. Legacy release-policy reads and writes adapt to the same flag store, rather than maintaining another writable copy. Version policy remains separate from service availability.

Optional metadata represents absence. Provider nulls are normalized at the boundary, while unknown amounts, explicit no-match decisions, and clear commands retain distinct null meanings. Review old client writes and stored workflow arguments when changing these contracts; successful schema validation only checks part of compatibility.

Expected user-facing failures use `convex/userErrors.ts`; plain error messages are redacted in production. Preserve the image-upload route’s plain-text error contract for installed clients.
