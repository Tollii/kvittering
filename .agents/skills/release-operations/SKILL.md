---
name: release-operations
description: Publish a reviewed Kvitto backend, TestFlight build, or OTA update, or change live release policies and service flags. Use for release execution; use release-review for compatibility assessment.
---

# Kvitto release operations

Use this procedure for the authorized target and operation. A review or code change alone does not authorize publication. Complete [release review](../release-review/SKILL.md) before publishing an affected client or backend contract. Reuse an existing assessment when it covers the exact change to ship.

## Resolve the target and change

Read [package scripts](../../../package.json), [EAS profiles](../../../eas.json), and the applicable [TestFlight](../../../.github/workflows/testflight.yml) or [OTA](../../../.github/workflows/ota.yml) workflow. Derive commands, channels, deployment URLs, and required secret names from those files; do not maintain a second copy here.

Confirm the effective Convex target from command selectors, environment-file selection, and deployment-key scope. Resolve conflicting selectors before acting. Do not infer the target from the branch or an earlier successful command, and do not print secret values. Use installed CLI help for options. Convex's `prod` deployment type also applies to TestFlight staging; it does not establish public production intent.

Identify the exact source revision and included uncommitted changes. A GitHub workflow builds its selected remote ref, not local edits. For an existing build, inspect that build's revision, profile, platform, and completion state. Prepare the selected operation and required checks before seeking any missing authorization; do not ask again for an already authorized target and scope.

## Publish and verify

1. Use the repository checks described in [README](../../../README.md#checks). Follow the reviewed migration sequence when persisted data changes; use [migration rehearsal](../convex-migrate-rehearse/SKILL.md) if the sequence is not yet verified.
2. Follow the reviewed deployment order. Additive backends normally precede dependent clients; the five-image admission transition below requires the recovery client before enforcement. If the selected script or workflow already does this, do not deploy a second time. A backend must remain compatible if the build or publication later fails.
3. Run the selected native or OTA operation. Native dependency, entitlement, plugin, or Swift changes need a binary. For OTA, verify an installed compatible runtime and the explicit EAS environment; local development variables must not select the TestFlight backend.
4. Check the actual result. Native upload completion is not Apple processing or tester availability. OTA publication is not installation on a device. Report these states separately, with the build/update identifier, revision, backend, channel, and verification gaps.
5. Verify source maps from the same build or export. GitHub runner secrets are not automatically forwarded to remote EAS builders. If source-map upload fails after OTA publication, retry it from the same export directory; do not republish the update merely to retry maps.

If a step fails or targets an unexpected deployment, stop dependent work and inspect what succeeded before retrying. Do not repeat publication blindly. An OTA rollback must fit the installed runtime and local data; it does not undo backend data or schema changes. Use a verified compatible update or embedded fallback, not a destructive data restore.

## Native capabilities

Read bundle IDs, Apple team, app groups, and extensions from `app.json`, `eas.json`, and the plugins. For changed capabilities, verify Apple Developer enablement and provisioning for the main app and affected extensions. Regenerated Expo native files are not the source of these settings.

Native Apple identity-token sign-in does not require browser OAuth credentials. Verify registration, repeat login, cancellation, Hide My Email, explicit linking, and retained household/queue access on a signed iPhone when that path changes. Public release also needs the unresolved account-deletion and Apple-revocation work in [open work](../../../plans/README.md).

For remote Live Activity updates, check the credentials read by [liveActivityPush.ts](../../../convex/liveActivityPush.ts). Use an APNs signing key for the app, not an App Store Connect key or Expo notification token. Foreground updates without these credentials do not prove suspended-app delivery. Verify APNs delivery and background transfers on a signed physical iPhone; simulator results cannot establish either.

## Release policies and service flags

For a requested version-policy change, inspect [releasePolicy.ts](../../../convex/releasePolicy.ts); for a service change, inspect [featureFlags.ts](../../../convex/featureFlags.ts) and the affected server guard. Read current state and revision before using the internal operator mutation. Preserve unrelated settings, supply the operator and reason, then verify the returned revision and effective state. Do not bypass history with a direct table edit.

A minimum-version increase needs explicit scope and a replacement that affected users can install on their platform and device. Never attach it automatically to build success. A rollback is another revision. Do not assume recent-client reports include every supported installation.

Email registration is shared across platforms: enabling it requires `emailSignUp` on both iOS and Android. Disabling either stops server registration. Use isolated test deployments with mock extraction for account fixtures; there is no public quota bypass.

## Receipt read model backfill

When a release introduces the receipt read model to an existing deployment, deploy the additive backend first. Run `receiptSync:backfill` with an explicit deployment selector and `{}`; continuations are automatic and reruns resume safely. Check the `receiptReadModel` record named `receipts-v1` for `ready: true`, compare representative totals and digests with receipts, and verify edits and deletion from another household device before releasing the dependent app. Existing clients and bounded reads remain supported during the transition.

## Five-image admission transition

For the initial rollout, deploy the additive read model while retaining eight-image admission, run its backfill, and distribute the client that can recover rejected six-to-eight-image queues. Enforce five-image admission only after that recovery client is available. Existing server reservations keep their persisted capacity; unreserved older queues require explicit user regrouping without loss of images.

The combined source revision needs staged backend deployment. TestFlight and OTA commands check staging readiness but do not deploy a backend. Use the explicit backend stages below. Select the reviewed compatible revisions and verify pending uploads on installed binaries. See the [implementation record](../../../plans/application-risk-review/implementation.md) for the outstanding release checks and correction-history cleanup.


## Enforced release checks

Local and GitHub release commands run `npm run release:check` before building,
publishing an OTA, or submitting an existing build. It reads only the receipt
read-model readiness flag on staging and fails if the backfill is incomplete,
missing, or cannot be read. Release from a clean, committed checkout. This check
does not establish native runtime compatibility or authorize publication.

Backend deployment is separate:

- `npm run backend:staging -- --stage additive` accepts only source retaining
  eight-image admission. Prepare the reviewed additive revision before initial
  deployment; the combined five-image source is refused.
- `npm run backend:staging -- --stage enforcement` accepts five-image source
  only after a live backfill check and a reviewed recovery-client record in
  [staging release evidence](../../../releases/staging.json).

The record starts without a recovery client, so enforcement is blocked. Once
Apple makes the recovery build available, record its native `build`, full
`sourceCommit`, UTC `verifiedAt`, `verifiedBy`, and App Store Connect `evidence`
URL inside `recoveryClient`. Set `availableToTesters` and
`pendingUploadUpgradePassed` only after checking tester access and upgrading an
old installation with pending uploads. Keep the deployment identifier. Review
and commit this evidence; clear it if access is withdrawn. Build completion,
upload success, CI, and a source review do not prove availability.

[The release command](../../../tools/release.mts) validates the selected staging
key and rejects conflicting selectors or credential sources. The installed CLI
gives a deployment-specific key precedence over `.env.local`; the command passes
it only through the child environment. Do not print credentials. Raw provider
CLIs remain operator tools, so these checks do not replace credential access
controls. Ordinary code work must not require deployment credentials.
