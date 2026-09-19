# Operational diagnostics

Sentry receives app diagnostics. Convex logs record backend processing, including work that continues after the app closes. These are separate systems; backend console output is not automatically sent to Sentry.

## Sentry

The SDK starts in `src/lib/sentry.ts`. The DSN is a public ingestion address, not a credential. `SENTRY_AUTH_TOKEN` is a build credential for source maps; it must never be included in the app bundle.

The token is stored locally and in GitHub repository secrets, and the GitHub release workflows expose it as an environment variable. Remote EAS builders require their own configured environment variable; GitHub runner variables are not automatically forwarded. An OTA publication also needs its matching source maps uploaded. Event ingestion through the public DSN works independently of these build credentials.

- **Issues** group unexpected failures. Open an issue to see the stack and preceding breadcrumbs. Handled failures have an `operation` tag and an operation context with a receipt ID when available.
- **Explore → Logs** shows deliberate milestones, including successful uploads, mutations, policy changes, and update downloads. Filter by `environment:development` or `environment:testflight` and inspect `receiptId` to find related backend logs.
- **Breadcrumbs** show the last 60 app milestones before an error. They explain the sequence without creating an issue for every action.
- Release context includes native version/build, API version, OTA update ID, runtime version, backend address, and policy revision. This separates failures in different installed versions.

Known network failures, timeouts, rate limits, required updates, and paused services do not create issues. Unexpected failures do. Repeated reports for the same operation, error type, and receipt are limited to one per five minutes in each app process. This is diagnostic suppression, not an upload retry limit.

Automatic console collection and automatic UI/HTTP breadcrumbs are disabled. The explicit logs contain IDs, counts, timings, status codes, and fixed event names. They do not contain receipt text, images, search terms, authentication tokens, email addresses, or purchase totals. Handled error reports retain stack frames but replace raw messages because provider errors can contain inputs. No session replay or performance tracing is enabled in this configuration.

The root wrapper still provides Sentry's normal crash reporting. Native crashes and SDK-captured unhandled errors are distinct from the explicit handled reports described above.

## Convex

Select the correct deployment in the Convex dashboard, then open Logs. Search for a receipt ID or one of these event names:

| Event                                                    | What it establishes                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `receipt.upload_completed`                               | All images were accepted and processing was scheduled.                              |
| `receipt.processing_started`                             | Processing started for this receipt generation.                                     |
| `receipt.extraction_completed`                           | OCR finished; includes model, elapsed time, image/line counts, and token usage.     |
| `receipt.classification_completed`                       | Category classification finished; includes model, batch count, and elapsed time.    |
| `receipt.processing_completed`                           | Result was stored; includes review/duplicate counts and automatic approval.         |
| `receipt.processing_failed`                              | Processing failed after retries; includes the stage and error type.                 |
| `catalog.request_reused`                                 | A cached result or pending request avoided another API call.                        |
| `catalog.request_failed`                                 | Includes request ID, HTTP status, elapsed time, and retry delay.                    |
| `catalog.matching_evaluated`                             | Counts selected matches and rejection reasons, such as ambiguity or low confidence. |
| `product.analysis_completed` / `product.analysis_failed` | Shows whether family and quantity analysis finished.                                |

Use `receiptId` and `generation` to distinguish retries. Use `requestId` to follow catalog work shared between receipts. `selectedCount` describes model decisions before stale/manual-edit guards; it is not a count of database changes. Provider duration covers provider work, not total queue time.

Logs are diagnostic records, not an accounting source. They can expire, and retried Convex transactions can repeat entries. The receipt and extraction tables remain the source of truth. Existing platform-generated exception logs are separate from the explicit payload-free logs added here.

## Verify a release

Run the installed app, upload one receipt, and check for `receipt.upload_completed` in Sentry Logs and Convex Logs with the same receipt ID. Check the Sentry environment and native build tags. Confirm source maps uploaded during the build so stack frames resolve to source code.

An empty Sentry Issues page can mean there were no errors, or that ingestion is not connected. It is not a successful connection test. A successful event sent from a CLI also does not prove the iPhone app is connected.
