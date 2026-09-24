# Native releases and compatibility

The backend must support installed clients while a new app is built, reviewed and installed. Run the project `release-review` skill before a release. Review from the last shipped commit, including the oldest client still supported by policy.

## Version identities

- Native app version and build: read from `expo-application`; EAS increments the build.
- API contract: `src/lib/releases/policy.ts`, currently 1. Clients without metadata use contract 0. Both remain accepted by default. A future or invalid declared contract is rejected with `UNSUPPORTED_API_VERSION` before writes.
- Local receipt payload/database: version 1. Version 0 payloads migrate in a SQLite transaction. An unknown future version stops without clearing data.
- OTA runtime: Expo fingerprint. Only compatible native runtimes receive an update.
- Policy revision: monotonically increasing, including rollbacks.

Changing the API constant does not implement compatibility. Preserve old argument and return contracts until retired, and preserve fields that an old editor does not know about. Add a new endpoint for a truly incompatible contract if both must operate together.

Use [backend operations](backend-operations.md) to select the target and handle deployment authorization, secrets, and data operations.

## Environments

| Builds/channel | EAS environment | Convex deployment | Server RELEASE_CHANNEL |
| -------------- | --------------- | ----------------- | ---------------------- |
| development    | development     | agile-falcon-148  | development            |
| testflight     | preview         | courteous-jay-215 | testflight             |

Local builds retain the personal backend. Public App Store production is not configured; create a separate production profile/backend/environment before a public release. Do not promote TestFlight binaries that contain staging URLs to public release.

EAS environments contain the public Convex URLs and `EXPO_PUBLIC_RELEASE_CHANNEL`. Build profiles also declare them. OTA publication uses `--environment preview` explicitly; values in `.env.local` must never determine a TestFlight update's backend.

## Policy operations

`releasePolicy:getVersions` is the current unauthenticated version bootstrap query. `releasePolicy:get` remains a compatibility read for older clients and includes their legacy flag shape. It is cached for five minutes and refreshed while active and on resume/reconnect when stale. The last valid policy persists across restarts. Failed fetches retain it, including a confirmed required update. A newer policy revision can remove a restriction. No background polling is required.

The UI gate keeps mounted drafts and stored images. Server writes independently check compatibility, including legacy callers, and return `UPDATE_REQUIRED` or `SERVICE_PAUSED`. Client release metadata is not a security credential; existing authentication/ownership checks remain required. Read endpoints stay compatible and available during a gate.

Change policy through the internal `releasePolicy:configure` mutation, using the Convex dashboard or the CLI for the explicitly selected deployment. It requires `expectedRevision`, `operator`, `reason`, and `replacementAvailable`. Only operators with deployment access can call it; the operator label is supplied by that operator. App users have no policy-write function. Changes are recorded in `releasePolicyHistory`.

For example, after reading revision 0 on staging:

```sh
npx convex run --env-file .env.staging.local releasePolicy:configure '{"platform":"ios","expectedRevision":0,"operator":"Andreas","reason":"Offer an available update","replacementAvailable":true,"settings":{"minimum":null,"recommended":{"version":"1.0.0","build":"6"},"minimumApiVersion":0,"message":"","features":{"receiptProcessing":true,"productLookup":true,"automaticProductMatching":true,"spendingAnalysis":true}}}'
```

Use the actual available build; the example is not an instruction to recommend build 6. Raising a minimum is a separate release decision. The mutation refuses a restrictive policy without explicit replacement availability, but the operator must verify Apple availability, tester access, region and OS/device compatibility. Never link this mutation to automatic build completion.

Use `clientReleases:active` through operator tools to inspect installations seen in the last 30 days. The report is limited to 500 rows and indicates truncation. Clients report at most every six hours per session; the server also limits unchanged writes. Sentry receives native build, API version, channel, OTA update ID, runtime and policy revision for failures. Release reports and Sentry do not prove every installed client has connected recently.

## Service controls

Use [featureFlags](featureFlags.md) for new single-flag operator changes. Current clients receive live flags from one Convex subscription with a persisted offline fallback. Version checks retain their separate refresh and update-lock behavior. The old full-settings mutation remains a compatibility adapter; it writes the same authoritative flag store.

The four original service flags default on because they represent existing features.
`emailSignUp` defaults off and controls new email accounts on the server and in the sign-in screen. New experimental flags must default off. Remove a temporary flag once its release is established and the oldest supported client no longer needs the alternate path.

- `receiptProcessing`: stops new reservations, image uploads, completion and retry. Local capture remains available, with images queued. Work already accepted by the server may finish.
- `productLookup`: stops new catalog requests and queued catalog workers before external calls. Already-running requests may finish. Previously cached product information can remain visible.
- `automaticProductMatching`: stops new matching jobs and automatic/manual enrichment requests. Existing workflows may finish.
- `spendingAnalysis`: stops new product analysis jobs and weekly digests, and hides the analysis screen behind a service message. Existing analysis jobs may finish.

Shared server work stops if either platform's corresponding flag is disabled. Platform-specific native minimums remain independent. The receipt list, editing and account functions remain usable during a service pause.

## Release sequence

1. Deploy additive backend changes that support old and new clients. Test legacy requests and queues, not only regenerated client types. The `Backend contract` CI job reports changes that would break installed clients or queued work; see [quality checks](quality.md#backend-contract).
2. Build and submit with `npm run testflight` or the TestFlight GitHub workflow.
3. Confirm the replacement is available and usable. Test with a real old installation, retained login and queued receipts.
4. Set the recommended version. The notice can be dismissed for three days.
5. If needed, set the minimum native version/build and/or API version separately. Keep bootstrap and error contracts readable by old clients.
6. Remove old contracts only after retirement. Preserve backend data and local migrations needed for users who skip releases.

Build 5 has no update gate or OTA support. Deploying a backend does not add these features to it. It continues under legacy API contract 0 until explicitly retired; it cannot show the new required-update screen. Install a new native build for the foundation implemented here.

## OTA updates

The app uses `expo-updates` with fingerprint runtime compatibility and separate development/TestFlight channels. It checks on launch without delaying startup. Downloaded updates apply on a later launch. Settings also provides an explicit check/download/restart action; it warns the user to finish edits first.

After review, publish compatible JavaScript/assets with:

```sh
npm run update:testflight -- --message 'Describe the change'
```

This deploys the compatible staging backend first, then publishes to the TestFlight channel with the preview EAS environment. The GitHub OTA workflow performs the same sequence. Neither operation changes minimum versions.

Native code, native packages, permissions, plugins or entitlements require a new build. A fingerprint mismatch can correctly produce an update that no existing binary can use; do not force it onto an older runtime. Use EAS update history to republish a known-good compatible update or roll back to the embedded update. Review local data migrations before rollback. OTA does not roll back Convex data or deployment changes.

## Verification

Run the applicable [project checks](quality.md). Focused tests cover numeric version ordering, anonymous policy reads, legacy request compatibility and retirement, stale-policy writes, service pauses, policy history, and actual SQLite migration rollback. Before a public release, additionally test update links, offline startup, returning from the store, an OTA download/restart, and native upgrade with unsent images on a device.

Receipt cache releases use an additive server read model. Deploy the backend,
run its bounded backfill, then release the app as described in
[Convex operating cost](convex-costs.md). Upload queue payloads remain version
1; retry deadlines and disposable receipt caches use separate tables or files.
Cached image Quick Look is an optional native method. Older binaries use the
image sheet. Existing HTTPS preview calls and workflow step arguments remain
supported.
