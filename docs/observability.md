# Operational diagnostics

Sentry receives app diagnostics. Convex logs record backend processing, including work that continues after the app closes. These are separate systems; backend console output is not automatically sent to Sentry.

## Sentry

The SDK starts in `src/lib/sentry.ts` only for non-development bundles on the `testflight` or `production` release channel. TestFlight uses the staging backend. Local development and the `development` channel skip SDK initialization and the root wrapper, so they do not send errors, logs, or replays. Restart the development app after changing this configuration; Fast Refresh does not stop an SDK instance that already started. The DSN is a public ingestion address, not a credential. `SENTRY_AUTH_TOKEN` is a build credential for source maps; it must never be included in the app bundle.

The token is stored locally and in GitHub repository secrets, and the GitHub release workflows expose it as an environment variable. Remote EAS builders require their own configured environment variable; GitHub runner variables are not automatically forwarded. The Expo plugin uploads native build source maps. The GitHub OTA workflow and the `postupdate:testflight` npm hook upload the matching `dist` source maps through `npm run sentry:sourcemaps`. An upload failure fails the command, although an OTA already published remains published. Retry the source-map upload from the same export directory. Event ingestion through the public DSN works independently of these build credentials.

- **Issues** group unexpected failures. Open an issue to see the original error type, redacted message, stack, causes and preceding breadcrumbs. Handled failures have an `operation` tag and an operation context with receipt ID, SDK error code and Convex request ID when available. Update errors also identify the failed phase: policy refresh, update check or download.
- **Explore → Logs** shows deliberate milestones, including successful uploads, mutations, policy changes, and update downloads. Filter by `environment:testflight` or `environment:production` and inspect `receiptId` to find related backend logs.
- **Breadcrumbs** show the last 60 app milestones and HTTP results before an error. HTTP entries retain method, endpoint and status without query parameters or bodies. They explain the sequence without creating an issue for every action.
- Release context includes native version/build, API version, OTA update ID, runtime version, backend address, and policy revision. This separates failures in different installed versions.

Known network failures, timeouts, rate limits, required updates, and paused services do not create issues. Unexpected failures do. Repeated reports for the same operation, error type, code, message and receipt are limited to one per five minutes in each app process. Repeated attempts still record failure milestones. Different failure messages remain distinct. Each captured error also writes a log with `sentry_event_id`, so the log and issue can be joined.

Automatic console collection and UI breadcrumbs are disabled. Explicit milestones contain IDs, counts, timings, status codes and fixed event names. Error messages retain the failure explanation, with credential patterns, email addresses, URL parameters and structured payload dumps removed, and a 2,000-character limit. Do not put receipt text, images, search terms, credentials, purchase totals or request/response bodies into messages or diagnostic fields. Performance tracing is disabled.

### Session Replay

Session Replay is disabled for local development. It samples 10% of enabled release sessions, including TestFlight and production. Error sampling is 100%: sessions outside the full-session sample buffer up to one minute before a reported error, then continue recording. Errors suppressed by the app are not sent to Sentry and do not trigger an error replay.

Text, images and vectors are masked. Request and response body capture is disabled, and no URLs are allowed for detailed network capture. The existing breadcrumb filter remains active. Do not add unmasked views for receipt data or account details.

Open **Replays** in Sentry, or follow the replay link from an error. Filter by the app environment and build. Restart the installed app after changing replay initialization; Fast Refresh is not a reliable native SDK restart. Verify that a replay arrives and that its recording masks receipt text and images. The installed React Native SDK, 8.27.0, supports this configuration without a dependency upgrade. See the [Sentry configuration documentation](https://docs.sentry.io/platforms/react-native/session-replay/).

Sentry processes original errors and their JavaScript/native causes. The app no longer filters stack lines itself. If the primary error has no frames, it receives a capture-location stack labelled `diagnostics.stack_source=capture`; this identifies the reporting call, not the missing original throw location. Existing stacks use `original`. An old event cannot recover details that were never sent.

The root wrapper provides Sentry's normal crash reporting in enabled release builds. Native crashes and SDK-captured unhandled errors are distinct from the explicit handled reports described above.

### Read issues from the command line

Use the installed `sentry` CLI for investigations. It stores OAuth credentials outside the repository and refreshes them automatically. The build token in `.env.local` can upload source maps but cannot read issues. Do not load that file for an investigation or replace the build token with a user token.

```sh
env -u SENTRY_AUTH_TOKEN sentry issue list --sort date --period 24h --limit 5 --fresh --json --fields shortId,title,count,lastSeen,permalink
env -u SENTRY_AUTH_TOKEN sentry issue view KVITTO-1 --json --fields shortId,title,count,permalink,event.contexts,event.tags
```

The CLI detects `andreas-tolnes/kvitto` from this checkout. If authentication expires and cannot refresh, run `sentry auth login --read-only` and complete the browser login. Do not print or copy tokens into chat, source files, or application environment files.

The Sentry plugin's Python script needs `SENTRY_AUTH_TOKEN`. Supply the CLI credential only to that process, using the script path from the installed Sentry skill:

```sh
SENTRY_AUTH_TOKEN="$(env -u SENTRY_AUTH_TOKEN sentry auth token)" python3 "$SENTRY_API" --org andreas-tolnes --project kvitto issue-detail 148055737
```

Do not enable shell tracing for this command. Prefer selected CLI fields when inspecting events; full event payloads can contain private context. Diagnostic reports retain validated codes from `error.code` or Convex `error.data.code` and redact messages before transmission.

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
