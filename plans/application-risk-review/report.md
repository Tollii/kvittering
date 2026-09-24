# Application risk review — 24 September 2026

The review found eight actionable risks and one additional requirement: a limit
of five images per new receipt. Three risks were reproduced with failing backend
tests. A fourth failing test demonstrates the new image requirement. No
cross-household authorization bypass was found in the reviewed public surface.

The original highest priorities were paid-work admission, the service-pause
bypass, and loss of an unsaved draft during a pending save. The subsequent
[comparison with active work](concurrent-work.md) confirms that receipt quotas,
provider allowances, and email sign-up control are now implemented in another
working copy. Plans 001, 006, and 007 have been narrowed to their remaining work.
The service-pause and draft defects remain open. The sections below describe
the audit baseline unless explicitly stated otherwise.

## Scope and evidence

Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`, the head of
`claude/happy-archimedes-lyjuqa` when checked out for this review. This includes
[PR 26](https://github.com/Tollii/kvittering/pull/26), before its merge. The review
ran in a dedicated worktree on `codex/application-risk-review`. It excludes
uncommitted changes in the original checkout, including the separate rate-limit
work. That work was subsequently inspected in [the active-work comparison](concurrent-work.md);
it has not been merged into this review worktree.

Context: [AGENTS.md](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/AGENTS.md),
[verification guide](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/docs/verification.md),
[architecture](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/docs/architecture.md), and
[release policy](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/docs/releases.md). This is a behavioral review. Style,
lint, types, secret scanning, and contract-snapshot diagnostics were excluded.
Application source is unchanged. Temporary tests are preserved as documentation
in [reproductions](reproductions.md).

The [plan index](../README.md#application-risk-review-release-checks) owns
execution status. P1 means a high-priority cost-control or data-loss risk. P2
means a concrete defect or requirement with a narrower trigger. These priorities
are not vulnerability scores.

| Plan                                      | Priority | Finding                                                                         | Evidence level                               |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| [001](001-paid-work-admission.md)         | P1       | Accounts have no application-level hourly paid-work budget                      | Source trace and retry analysis              |
| [002](002-evaluation-service-pause.md)    | P1       | Category evaluation starts paid work while all services are paused              | Failing backend test                         |
| [003](003-draft-preservation.md)          | P1       | Navigation during a pending save can discard the draft                          | Source trace; device check proposed          |
| [004](004-alias-processing-state.md)      | P2       | Alias propagation changes processing state and suppresses extraction completion | Failing backend test                         |
| [005](005-correction-history-deletion.md) | P2       | Receipt deletion leaves readable copies in correction batches                   | Failing backend test                         |
| [006](006-workflow-retention.md)          | P2       | Completed workflow journals retain receipt payloads indefinitely                | Source and installed package behavior        |
| [007](007-receipt-read-budgets.md)        | P2       | Row-count limits do not bound receipt read bytes or digest memory               | Accepted large-payload test and source trace |
| [008](008-alias-work-scheduling.md)       | P2       | One save can schedule hundreds of complete household scans                      | Source trace                                 |
| [009](009-five-image-limit.md)            | P2       | New receipts currently accept eight images; required limit is five              | Failing requirement test                     |

## Authorization

All **52 public functions**, **six HTTP route entries**, and **six `Access:`
comments** were inspected. The [surface inventory](public-surface.md) lists every
entry and its authorization rule. Membership comes from the authenticated
identity, not a caller-supplied household ID. Receipt, correction, household
product, notification, and live-activity operations check that identity or its
household before acting.

Invitation possession intentionally grants membership to a household with an
available place. Codes are 32 hexadecimal characters, and the membership and
two-person limit are checked in the same mutation. Invitation guessing is not a
confirmed disclosure path. Abuse admission still belongs in plan 001.

`releasePolicy:getVersions`, `releasePolicy:get`, and `featureFlags:get` expose
configuration needed before sign-in, not household data. `GET /receipt-image`
requires receipt access. `POST /receipt-image` checks access before storing the
body and rechecks it when attaching the image. `OPTIONS` returns no receipt data.
The authentication routes intentionally include public sign-in and public key
metadata. Their individual Better Auth checks must remain enabled.

The catalog is shared reference data. Being able to read the same catalog product
as another household is not a household-data leak. Receipt images use an
authenticated HTTP route; the application does not issue public storage download
URLs. A storage ID alone is not the public download URL described in the
[Convex file-serving documentation](https://docs.convex.dev/file-storage/serve-files).

The `Access:` comment on evaluation is correct for data access but says nothing
about paid-work admission. It does not prevent the separate defect in plan 002.

## Paid calls and concurrency

The [paid-call analysis](paid-calls.md) gives call counts, retry multipliers,
entry points, and account-hour scenarios. There is no finite application policy
for paid calls per account per hour at this baseline. Workpool concurrency limits
and cache reuse reduce parallel work; neither is an account budget.

No unconditional infinite provider retry loop was found. Extraction,
classification, analysis, and catalog retry loops have limits. The risks are
repeated admission, retry multiplication, large fan-out, and repeated scans.
Digests make **no OpenAI, TypeSafe, or Kassalapp calls**. Their risk is receipt
read volume and retained in-memory data, covered by plan 007.

Receipt revisions and processing generations normally reject stale writes.
Catalog requests use a unique normalized key and share in-flight work. Product
analysis deduplicates a receipt revision and permits explicit recovery after an
error. The exception found is alias propagation changing a receipt's processing
state, covered by plan 004.

Ordinary receipt writes do not all update one household or policy document.
Household edits and policy configuration use revision checks. Reading policy on
each mutation does make a policy update conflict with concurrent readers, but
there is no demonstrated steady write-contention defect there. More relevant
write concentrations are shared catalog keys, category-memory keys, workflow
component state, and receipt revisions during background propagation. Measure
these under load before introducing counters on a single global document.

## Authentication and device credentials

[convex/auth.ts:83](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/auth.ts) explicitly keeps origin checking on.
Trusted origins are the application scheme, configured site origin, and `exp://`
only when `ALLOW_EXPO_GO` is `true` at line 109. The source does not constrain
that switch to a development deployment. Actual deployment environment values
were not retrieved. Add a deployment configuration assertion that production and
TestFlight backends do not enable Expo Go, plus HTTP tests for rejected foreign
web origins. The helper-level origin tests alone do not establish that routing
and middleware enforce the configuration.

Email sign-up does not require verification
([convex/auth.ts:100](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/auth.ts)). This permits inexpensive account
creation and is material to plan 001. It does not, by itself, grant access to an
existing household. Better Auth supplies production rate limiting by default;
the installed package chooses memory storage when no alternate store is
configured. Do not describe this as a durable deployment-wide abuse budget or
assume that it protects public Convex functions.

Apple linking is explicit: implicit email linking is disabled, different email
addresses are permitted, and an account-create trigger rejects reuse of the same
Apple identity across users in the write transaction
([convex/auth.ts:26](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/auth.ts),
[convex/auth.ts:93](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/auth.ts)). This supports private relay addresses
without treating email equality as proof of identity. The authentication tests
exercise signed identity tokens, wrong audience/issuer/nonce, expiration, bad
signatures, explicit linking, and duplicate identity rollback. They passed.

[src/lib/auth-client.ts:21](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/src/lib/auth-client.ts) configures a
deployment-scoped SecureStore prefix. The Expo auth adapter persists cookies and
session data through that storage and handles sign-out clearing. Convex token
fetches use `authClient.convex.token()`; the session hook obtains a fresh token
through the adapter instead of maintaining a second plaintext token store.
Cold-start, expiry, refresh during a background transfer, and keychain behavior
still need a signed-device check.

## Drafts, queues, migrations, and service pauses

Drafts exist in editor reducer state. The navigation guard is disabled while an
operation is busy. This is a concrete lost-draft path if a save later fails.
Plan 003 also covers recovery across a required update: the update modal keeps
children mounted, so opening the modal alone does not erase the draft, but a
native update or process restart does. Do not mistake modal preservation for
durable draft preservation.

The SQLite queue retains images until server completion. Account and household
scope prevent a different account from uploading those entries. Sign-out stops
new work and retains local queued entries. Already transmitted requests can
complete under their previously authorized identity. Upload failures preserve
progress and use bounded backoff; process restart and explicit retry can start
another series, so client backoff is not a server quota.

Migration tests use SQLite and verify transaction rollback on a corrupt entry,
preserved image paths and upload progress, and rejection of unknown future schema
versions. The source does not reset or erase the queue on a future version. No
queue-deletion defect was found in these paths. No physical-device interruption,
upgrade, or background-upload test was run for this audit.

## Installed-client behavior

Build provenance was checked through EAS build records and successful GitHub
TestFlight workflow logs:

| Build                                     | Source commit                              | Evidence                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS 5, API contract 0                     | `31b9edb2dcadc3a31f1d5303ff18e2bef1baaccf` | [TestFlight workflow 35407345204](https://github.com/Tollii/kvittering/actions/runs/35407345204), build `258e4255-4ab5-49f7-8f53-10891309b4f2` |
| Latest identified submitted iOS build: 15 | `a59afc53b6c2635468add95f37a35e127ed5d62d` | [TestFlight workflow 35791084510](https://github.com/Tollii/kvittering/actions/runs/35791084510), build `72205a88-2512-4206-87f2-3e65e70e185f` |

This identifies the latest submitted build, not which build each tester has
installed. App Store Connect availability and execution of those binaries were
not verified.

The recent returned outcomes are internal validation results. For example,
`receipts.save` still turns an invalid `checkReceipt` result into a thrown
`userError` at [convex/receipts.ts:249](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts). It returns a
revision acknowledgement only after a successful write. No public failure-as-
success regression was confirmed from that change.

Build 5 ignores the save acknowledgement and reloads receipt detail after
success. Build 15 consumes the acknowledgement revision. Both enter their
failure path when the mutation rejects. Build 5's now-unused `readings` prop
receives the removed `detail.extractions` field, but that component does not read
the prop; this was not classified as a demonstrated runtime failure. Legacy
catalog callers understand `pending`, `ready`, and `error`, and retry polling
reuses the same request key. Legacy upload callers retain queued images on a
non-success HTTP response. Build 5 has no update gate and displays a generic
failure for release-policy rejection; do not retire it by raising minimums as
part of these plans.

These source checks do not prove that every possible response is handled on a
device. Add behavioral fixtures for both client revisions: save success, invalid
data, revision conflict, service pause, required update, unauthorized image
access, and catalog pending/error/missing product. Assert retained drafts and
queue entries, not only returned shapes. The five-image change has an additional
legacy queue constraint in plan 009.

## Privacy and deletion

Sentry receives sanitized error messages, stack frames, restricted network
breadcrumbs, application diagnostic metadata, and release context. Replay masks
text, images, and vectors; network bodies and automatic console collection are
disabled. [src/lib/sentry-event.ts:11](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/src/lib/sentry-event.ts) removes
credentials, email addresses, HTTP query strings, and payload dumps. It does not
recursively sanitize arbitrary `extra` or `contexts`, and application-owned
`kvitto` breadcrumbs are trusted. Current call sites use restricted diagnostic
fields; no concrete receipt-payload leak to Sentry was demonstrated. Add an
SDK-envelope test with sentinel receipt text, credentials, and push tokens in
each supported error path so future call sites cannot bypass that assumption.

Deleting a receipt removes its main row and incrementally removes images,
extractions, revisions, and direct corrections. It does not remove correction
batch copies or workflow journal payloads. Plans 005 and 006 address these two
separate owners. Other members of the same household can still read the batch
copies. Workflow journal access is an operator/component retention issue, not a
new anonymous endpoint.

There is no application account-deletion or household-deletion command at this
baseline. Better Auth user deletion is not enabled. Thus there is no implemented
cascade to certify. Before adding account removal, define what happens to shared
household receipts, membership, authentication sessions, notification tokens,
local queues, journals, and retained diagnostics. Administrative deletion of an
auth record is not an application deletion procedure.

Push subscriptions are bound to the authenticated identity and household, with
at most ten registered devices per identity. Another identity cannot take an
already registered token. Reminder requests also verify receipt and uploader
access. Live-activity updates check ownership and membership. Sign-out removes
the current device subscription when the online operation succeeds. Failed
unregistration must remain visible and retryable; no claim of device delivery
revocation was tested here.

## Checks that would have found the risks

The 122 selected existing tests passed. They do not cover the three reproduced
defects. Receipt-deletion tests create direct history but no correction batch;
feature-flag tests do not call the public evaluation action with existing
corrections; alias tests use completed receipts, not active reprocessing.
Reducer tests cannot detect the editor's navigation guard being disabled.

Each plan names an observable test and the change that must make it fail. Read
limits need a real isolated Convex deployment: `convex-test` does not establish
the hosted byte or memory limits. Authentication needs route-level origin tests;
installed clients need behavior fixtures and signed-device checks. Keep these
targeted checks in their owning feature tests, rather than adding a broad test
that only checks source spelling or counts exported functions.

See [verification](verification.md) for commands, results, and remaining limits.
