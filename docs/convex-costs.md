# Convex operating cost

Convex remains the authority for household membership, receipts, and processing.
The phone keeps a disposable SQLite copy of receipt data. It subscribes to one
small household change counter while it is online and in the foreground. It
fetches changes in pages of at most 20 receipts. Unchanged receipts are not sent
again when a tab opens. History search, inbox selection, product history,
receipt details, editor suggestions, and Spotlight use the local copy.

The first synchronization downloads the household's receipt history. Report
completeness is false until this download ends. A small daily aggregate query
can show the spending headline during that download. Afterward, local reports
use the same domain rules as before. Offline reports describe the last complete
local copy; the existing offline indication remains visible.

## Writes and summaries

All application mutations use `convex/serverFunctions.ts` directly or through
`clientMutation`. Its receipt trigger updates a compact summary, daily totals,
and a monotonically increasing household sequence in the receipt transaction.
Status, date, amount, exclusion, duplicate, catalog, and analysis changes are
therefore visible to synchronization. Daily totals change only when their
contribution changes. Deletions retain a small marker with no receipt data.

The summary stream contains one current entry per receipt, not one entry per
edit. If a receipt changes during a paged download, its later sequence is read
in the next pass. Daily aggregates preserve separate overview and comparison
rules for suspected duplicates. Unknown amounts and foreign currency remain
explicit. Weekly digests use at most 45 daily records after the backfill.

Do not write receipt documents through the raw generated mutation builders.
Direct dashboard edits also bypass application triggers. An administrative
repair must update the read model in the same transaction. A database restore
needs a separate cache invalidation and reconciliation plan.

## Uploads and subscriptions

Upload retries use persisted deadlines in a separate SQLite table. The upload
queue format remains version 1, so an older installed app can still read it.
New clients request structured quota errors; older clients retain the Norwegian
string error. A quota deadline also postpones other unreserved images in that
household's queue. Manual retry does not bypass an active quota deadline.

Other upload failures start with a 30-second delay, then double up to 30
minutes. The queue wakes for eligible work, a connection change, or foreground
entry. There is no fixed 15-second upload poll. Reservations and completed
image uploads remain reusable after failure.

Receipt queries do not retain live subscriptions for hidden tabs. Other
navigation queries release idle subscriptions immediately. The catalog keeps
its existing persisted cache and expiry rules.

## Retention

| Data                                             | Rule                                                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone receipt images                             | Private cache; at most 200 MB after each successful preview load; copies expire after seven days. Clear on account or household change and remove known deleted receipts. The OS can evict the cache. |
| Phone receipt data                               | Separate disposable database, scoped to deployment, account, and household. Clear revoked scopes. Receipt changes and sync progress commit together.                                                  |
| Queued images and editor drafts                  | Preserve. They are not part of cache cleanup.                                                                                                                                                         |
| Terminal catalog request results                 | Remove 30 days after expiry, in batches of 50. Keep entries that have workflow waiters. Keep pending and running work.                                                                                |
| Successful workflow journals                     | New workflows schedule component cleanup 30 days after completion. Existing journals and unsuccessful workflows remain available for diagnosis.                                                       |
| Receipt originals, revisions, correction history | Preserve. User-requested receipt deletion uses the existing bounded cleanup.                                                                                                                          |
| Incomplete uploads                               | Preserve. An offline phone can still hold the matching reservation and unsent images.                                                                                                                 |
| Receipt deletion markers                         | Preserve so a phone can synchronize after a long offline period.                                                                                                                                      |

Cache cleanup does not remove canonical catalog product identities or store
records that receipts can reference. Successful workflow cleanup uses the
component API; it does not directly delete component tables or active work.

## Release sequence

1. Rehearse the additive schema and backfill against representative existing
   data in an isolated deployment. Follow [backend operations](backend-operations.md).
2. Deploy the backend before the app. Existing receipt functions, response
   shapes, queue records, and workflow step arguments remain supported.
3. Start the bounded backfill on the explicitly selected deployment:
   `npx convex run --deployment <deployment-name> receiptSync:backfill '{}'`.
   Continuations run automatically. Repeating this command resumes safely.
4. Check the `receiptReadModel` row named `receipts-v1`. `ready` must be true.
   Compare representative monthly totals and weekly digests with receipt data.
   Check receipt edits and deletion from a second household device.
5. Release the app. Before backfill completion it uses the existing bounded
   reads. Local image Quick Look needs a new native build; older binaries use
   the image sheet. No minimum app version needs to change.

Local Convex tests cover backfill retries, legacy records, concurrent changes,
aggregate edits and deletions, authorization, and the old digest calculation.
SQLite tests cover interruption, transaction rollback, deletion, and account
isolation. These checks do not replace an isolated deployment rehearsal or
an offline upgrade test on a physical device.

## Usage thresholds and measurement

Set warning thresholds on the staging deployment's Usage page. A suitable
initial warning level for two testers is 50,000 function calls, 1 GB database
I/O, and 0.5 GB data egress per month. These are proposed warning levels, not
measured capacity requirements. Set action-compute warnings from observed
receipt processing usage rather than the screenshot's rounded zero values.

A disable threshold stops service. Select that value from the acceptable
monthly spend and the actual plan before enabling it. Keep staging and
production thresholds separate. Repository changes do not alter dashboard
thresholds or deploy the backend.

Compare the same routine before and after release: open the app, switch tabs,
open one receipt twice, background the app, and add or edit one receipt from
the other device. Check function executions, database I/O, egress, and action
compute in the dashboard. Unchanged tab navigation should use local data;
new receipt data should cause bounded synchronization. Summary writes add a
small cost per receipt change. The gain grows as history and read frequency
increase.
