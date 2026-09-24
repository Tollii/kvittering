# Paid-call paths and bounds

Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.
The [active-work comparison](concurrent-work.md) records newer receipt and
provider allowances. The unlimited-admission examples below describe this
baseline, not the other task's current working copy.
Counts below are outbound provider requests, not prices or guaranteed billable
units. Provider questions, image size, tokens, cache state, and error behavior
also affect cost. No live paid provider was called for this review.

Let `P` be product lines in a valid receipt, at most 300. Let `Q = ceil(P / 12)`.
Let `U` be distinct uncached catalog searches, at most `P`. Let `H` be the number
of receipts in the household. Bounds assume the relevant keys and services are
enabled. Cache hits, confirmed aliases, missing candidates, stale work, and
early failures reduce actual calls.

## Public entry points

| Caller operation                                                        | Work reached                                                                   | Admission behavior                                                                                                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `receipts:reserve`                                                      | No paid call immediately                                                       | New client IDs create new receipt rows; repeated IDs reuse a row. Count is currently 1–8 images. No hourly allowance.                                                        |
| Image POST / `receipts:completeUpload`                                  | Extraction → classification → household matching → catalog matching → analysis | A complete upload starts one processing generation. Background upload can start it after the final image attachment. Repeated completion does not start a second generation. |
| `receipts:retry`                                                        | Another extraction pipeline                                                    | Active work is rejected; completed/failed work can start a new generation without a cooldown or total retry allowance.                                                       |
| `catalog:searchProducts`, `searchStores`, `product`, `prices`, `ensure` | Catalog queue                                                                  | Same normalized cache key shares pending work and retained results. New keys are unbounded per account. Legacy polling normally reuses the same key.                         |
| `catalogMatching:enrich`                                                | Catalog lookups, TypeSafe catalog decisions, analysis                          | Pending work is reused; an explicit request after completion can run again. `onlyIfMissing` is optional.                                                                     |
| `productAnalysis:ensure`                                                | Analysis workflow                                                              | Up to 20 receipt IDs per request; the current successful/pending version is reused. An error permits another manual run.                                                     |
| `receipts:save`, correction apply/undo, product linking                 | Changed receipt revision → analysis; remembered aliases → more receipts        | A no-op-looking edit can still advance a revision. Alias propagation has total work proportional to remembered aliases × `H`.                                                |
| `correctionEvaluation:evaluate`                                         | TypeSafe category evaluation                                                   | One uncached request with up to 50 latest correction examples after deduplication; no per-account quota, and no controlling service check.                                   |

Evidence: [convex/receipts.ts:100](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts),
[convex/receipts.ts:172](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts),
[convex/receipts.ts:194](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts),
[convex/receipts.ts:456](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts),
[convex/catalog.ts:77](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalog.ts),
[convex/catalogMatching.ts:185](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalogMatching.ts),
[convex/productAnalysis.ts:149](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/productAnalysis.ts),
[convex/receiptChanges.ts:178](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receiptChanges.ts), and
[convex/correctionEvaluation.ts:49](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/correctionEvaluation.ts).

## Provider calls in an accepted run

| Stage                                    | Normal requests                                   | Conservative request bound including configured retries                                                               | Source                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI extraction                        | 1 with every receipt image                        | 6: three workflow attempts × two SDK attempts                                                                         | [processing.ts:59](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/processing.ts), [providers.ts:65](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/providers.ts)                                                                                                                                                                                        |
| TypeSafe receipt categories              | Up to `Q`                                         | Up to `9Q` = 225 at 300 lines: three whole-action attempts × three SDK attempts per batch                             | [processing.ts:78](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/processing.ts), [providers.ts:147](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/providers.ts)                                                                                                                                                                                       |
| TypeSafe household product matching      | Up to `Q`                                         | Up to `Q` = 25; SDK retries disabled; a 45-second deadline is checked between batches                                 | [productMatching.ts:25](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/productMatching.ts)                                                                                                                                                                                                                                                                                                         |
| Kassalapp product search                 | 1–3 per uncached key                              | Up to 9 per key: three queue attempts, each with up to three fallback searches                                        | [catalogWorker.ts:53](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalogWorker.ts), [catalogQueue.ts:279](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalogQueue.ts)                                                                                                                                                                           |
| Kassalapp store, detail, or price lookup | 1 per uncached key                                | Up to 3 per key                                                                                                       | [catalogWorker.ts:75](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalogWorker.ts)                                                                                                                                                                                                                                                                                                             |
| Automatic catalog lookup stage           | Up to `3U + 1` for products and optional store    | Up to `9U + 3` = 2,703 at 300 distinct uncached product searches                                                      | [catalogMatching.ts:58](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalogMatching.ts)                                                                                                                                                                                                                                                                                                         |
| TypeSafe catalog decisions               | 0 or 1                                            | 1 request, but up to nine questions per product line (eight candidate decisions and one category), or 2,700 questions | [catalogClassifier.ts:119](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalogClassifier.ts), [catalogClassifier.ts:243](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalogClassifier.ts)                                                                                                                                                        |
| TypeSafe product analysis                | Up to `2Q`: profile batches plus quantity batches | Up to `6Q` = 150 over three whole-action attempts; saved profiles often lower this                                    | [productAnalysis.ts:69](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/productAnalysis.ts), [productAnalysisWorker.ts:235](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/productAnalysisWorker.ts), [productAnalysisWorker.ts:322](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/productAnalysisWorker.ts) |
| TypeSafe correction evaluation           | 0 or 1, with up to 50 questions                   | 1 per request; caller can repeat                                                                                      | [correctionEvaluation.ts:74](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/correctionEvaluation.ts)                                                                                                                                                                                                                                                                                               |

These are independent stage ceilings, not a claim that every maximum occurs in
one run. A late failed batch can cause the earlier successful category batches
to run again on a workflow retry. The installed TypeSafe SDK 0.6.0 defaults to
two retries (`node_modules/@typesafe-ai/sdk/dist/index.mjs:73`); the receipt
classifier does not override that setting. Other TypeSafe workers explicitly
set zero retries. The workflow component does not automatically retry actions
unless configured to do so.

Operator-only `productAnalysisEvaluation:evaluate` makes six TypeSafe calls over
fixed examples; `evaluateAttributes` makes one. These are internal functions,
not public account entry points. See
[convex/productAnalysisEvaluation.ts:13](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/productAnalysisEvaluation.ts)
and line 78. Keep them within an operator budget if automated later.

## What one account can do in an hour

There is **no enforced account-hour ceiling** in the reviewed application.
Actual throughput depends on provider response time, Convex limits, pool
capacity, and failures. The following are scenarios, not measured throughput:

- With one saved category correction, 60 successful evaluations per minute would
  cause 3,600 TypeSafe requests in an hour. Concurrent action calls can overlap.
  Even all current service pauses do not block this entry point.
- Submitting 3,600 distinct valid catalog search keys can admit 3,600 jobs in an
  hour and up to 32,400 eventual Kassalapp attempts. Four workers limit execution
  concurrency, not jobs admitted or work charged to the account. The backlog can
  continue after that hour.
- Each newly completed receipt, or each accepted manual retry after completion,
  can start the pipeline above. Many distinct receipts can bypass the
  single-receipt in-flight guard.
- A single save with `K` remembered aliases can schedule about
  `K * ceil(H / 10)` alias page executions. Each changed receipt revision can
  cause further analysis. Therefore there is no constant paid-work bound for
  every public request independent of household history.

An hourly request limit alone is insufficient if one accepted request can admit
thousands of provider attempts or questions. Plan 001 needs both admission rate
and work-size limits. The five-image requirement in plan 009 bounds one dimension
of extraction input; it does not bound product count or repeated requests.

Client platform metadata is self-reported.
[convex/releasePolicy.ts:70](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/releasePolicy.ts) selects the client
policy from that field. A platform-specific pause is therefore not a global
cost-control boundary: a direct caller can claim the other platform. The
deployment-wide paid-work ceiling must not depend on the caller reporting an
honest platform or build. This does not bypass household authorization.

## Loops, scheduled work, and shared state

Catalog uses four concurrent workers and explicit retry state with at most
three attempts. Waiter notifications use batches of 50 with scheduled
continuation. The cache is shared across households and deduplicates requests
transactionally. It is useful load reduction, not authorization or a spending
allowance.

Product analysis has one concurrent worker in its component pool, three action
attempts, persisted profiles, and generation/revision checks. Repeated completed
manual enrichments and new receipt revisions still create new eligible work.

The weekly digest scans subscription pages with a fixed creation-time boundary,
then caches a household digest within each delivery batch. It computes purchase
totals in application code and makes **zero paid calls to the three providers**.
It does accumulate all period receipts in one action; plan 007 covers that risk.
Receipt duplicate detection has paginated continuation and a fixed boundary.
Alias propagation has ten-row continuation but no fixed boundary or combined
household job; plan 008 covers that risk.

Client upload retries back off and stop after six automatic attempts in one
runner. A restart or user retry can start another series. Reservation and upload
completion are idempotent, so this does not normally duplicate a successfully
admitted receipt. It also does not substitute for paid-work admission on the
server.
