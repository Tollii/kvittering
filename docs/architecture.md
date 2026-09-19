# Application structure

The Expo application starts in `src/app/_layout.tsx`. Session context contains account, household, connectivity, and local upload state. Active screens declare their receipt reads in `src/features/receipt-queries.ts`. History pages contain summaries. Reports wait until all pages in their purchase-date range are loaded. Product price history is a separate, explicit read.

## Receipt flow

1. Capture claims an import batch. It retains the batch until conversion succeeds or the user dismisses it.
2. `receipt-storage.ts` copies images into durable storage and commits the queue to SQLite. It publishes immutable snapshots after commit. `receipt-upload-transport.ts` owns authenticated uploads; `upload-queue.ts` retains each completed step.
3. Convex processing extracts and parses receipt evidence, classifies products, checks duplicates, and applies saved household choices. `receiptChanges.ts` owns revision, history, status, and follow-up policy for receipt changes.
4. Catalog matching and product analysis run on the server. Profile questions use bounded batches. Writes reject stale generation, revision, or evidence. Exhausted analysis can be retried explicitly; `productAnalysis.repair` is an operator recovery operation.
5. `receipt-draft.ts` owns editor changes and save acknowledgement. Reactive queries deliver the saved receipt. Report selections keep identity and period, then derive their content from current data.

## Identity and evidence

- A receipt line preserves printed text and integer øre amounts.
- A category alias records a household's category decision. It is not a product identity.
- A product reference is unresolved, explicitly separate, a household product, or an exact catalog product. The compatibility adapter projects legacy fields for installed clients.
- A catalog product describes one packaged item. A family groups the same product across package sizes. Purchased quantity is a separate interpretation.
- `product-evidence.ts` parses package notation once. Unknown or conflicting measurements remain explicit.

Add receipt issues in `receipt-issues.ts`; display text belongs in its mapper. Parse receipt input at the boundary and use the assessment in `receipt-review.ts`. Add category metadata in `categories.ts` and classifier evidence in `classification.ts`. Add reports to the typed registry in `src/features/spending-reports/reports.tsx`; use existing purchase projections for arithmetic.

## Table ownership

| Tables | Owner and purpose |
| --- | --- |
| households, members | Household membership, invitation, and budget |
| receipts, images | Current receipt state and uploaded image references |
| extractions | Original provider output for each generation |
| revisions | Prior receipt data before a committed non-extraction change |
| aliases, categoryMemory | Explicit and learned household category decisions |
| products, productMappings | Household identities and remembered product choices |
| corrections, correctionBatches | Human decisions, bulk changes, and guarded undo |
| catalogRequests, catalogRequestWaiters | Shared catalog work and workflow completion |
| catalogProducts, catalogStores | Shared catalog records; detail freshness is separate from summary freshness |
| productFamilies, productProfiles | Household family identity and reusable analysis evidence |
| deviceSubscriptions | Device notification destinations |
| clientReleases | Installed-client diagnostics |
| releasePolicies, releasePolicyHistory | Native/API version controls and operator history |
| featureFlags, featureFlagHistory | Platform-scoped service configuration and operator history |

Convex components own their workflow, workpool, and authentication tables. There is no sample table. Revision retention is a separate operator decision; this refactor does not remove history.

## Presentation and checks

`src/components/ui.tsx` is an import facade. Typography, controls, surfaces, layout, and selection views have separate modules. Feature screens own state and use these components directly.

Run `npm run typecheck`, `npm run lint`, and `npm test`. Native camera, PDF import, sheets, large text, light/dark mode, offline restart, and old-client upgrades require development-build checks. Source tests do not prove those device behaviors. Follow `docs/releases.md` before deployment or publication.
