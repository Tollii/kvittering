---
name: release-review
description: Review Kvitto native releases, OTA updates, and backend changes for installed-client, persisted-data, and policy compatibility. Use before publishing or assessing breaking changes.
---

# Native release review

Review the proposed change as an upgrade from an installed app. The latest source tree alone is not the compatibility boundary.

Use [backend operations](../../../docs/backend-operations.md) before any authorized deployment or data operation. This review does not itself authorize publication.

## Establish the comparison

- Read `docs/releases.md`, `app.json`, `eas.json`, and the release workflows. Identify the target backend, channel, native runtime, and current API contract.
- Use the user's comparison ref when supplied. Otherwise identify the last shipped build's commit from EAS or release records. A branch's merge base is only a substitute; label that limitation. Include uncommitted changes if they will ship.
- Read the diff and the affected callers. Distinguish newly introduced problems from existing limitations. Never print credentials or receipt contents in findings.
- Read the release policy and active-client report when authorized tools are available. If unavailable, state that minimum versions and adoption were not verified. Do not assume every user runs the latest version.

## Check these compatibility boundaries

**Convex contracts**

- Compare public function names, argument validators, return shapes, union values, enum values, and field meanings with the oldest supported client. Generated TypeScript only checks current clients.
- A required argument or new stored field can break old clients even if current tests pass. In particular, receipt edits submit a document: check that an old editor cannot erase newer fields.
- Public writes must use `clientMutation` in `convex/clientFunctions.ts`. Public actions and HTTP uploads must perform the corresponding server check. Diagnostics are an intentional exception; authentication and ownership still apply.
- Check API-version zero callers until legacy support is explicitly retired. Keep old functions during the transition. A client-supplied version is compatibility information, not authentication.
- A backend deployment precedes the binary in this project. It must remain safe if the build fails, Apple delays release, or the user does not update.

**Local data and retries**

- Check persisted workflow journals as well as database documents. Changes to step arguments can break replay even when validators accept optional fields. Preserve step order and business arguments. Use `unstableArgs` only for deliberate replay-compatible metadata changes, with a comment that explains why.

- Inspect SQLite schema versions, queue payload versions, persisted caches, authentication storage and image paths. An upgrade can skip releases.
- Queue migrations must be transactional, repeatable, and preserve images, reservation IDs, owner/household scope and completed upload steps. Unknown future formats must stop safely; never reset durable data to recover.
- Cached catalog data may be discarded; unsent receipts and edits may not. Check whether an OTA rollback can still read data written by the new update.
- Inspect interrupted uploads and duplicate requests. Test the same reservation retry after a backend or app update.

**Policy and flags**

- Keep the unauthenticated bootstrap query and supported policy schema readable by old clients. Unknown additive flags must not crash them.
- Verify stale cache, offline startup, network timeout, foreground refresh, and a previously confirmed required-update state. A failed refresh must not invent a lock or remove one.
- Cached flags control presentation; server checks protect work. Check scheduled jobs and HTTP routes as well as buttons. State whether already-running work completes.
- Update gates must preserve drafts and pending images, cover deep links, and allow an explicit refresh after returning from the store.
- Raising a minimum requires an available replacement for that platform and channel. Build upload success is insufficient. Check native OS/device support: affected users must actually be able to install the replacement.
- Changes must use the operator mutation with revision checks and history. A rollback is a new policy revision. Build/OTA workflows must not raise minimums automatically.
- Each temporary flag needs a removal condition. New experimental flags default off; old clients may not implement them.

**Native release and OTA**

- Compare native dependencies, Expo SDK, Swift/Kotlin, config plugins, entitlements, permissions, URL schemes and app identifiers. Native changes require a binary.
- Confirm fingerprint runtime compatibility, channel-to-branch mapping, and the EAS environment used for export. An OTA must not change the installed app's backend or storage identity.
- Check native app version/build separately from API version, policy revision and OTA update ID. Do not infer the installed binary version from JavaScript config.
- OTA reloads must not interrupt edits. Check embedded fallback and rollback, source maps/Sentry release metadata, and store update links. Do not bypass Expo's recovery controls.

## Verify and report

Run the applicable [project checks](../../../docs/quality.md) when source changes are in scope. Add focused verification only if implementation is requested. Existing legacy-contract tests are evidence for the current support window, not permission to change their fixtures to make a breaking change pass.

Report:

1. Release assessment: compatible, requires a new native build, requires a compatibility transition, or blocked by a verified defect.
2. Each actionable finding: severity, exact file/line, affected installed version or contract, concrete failure scenario, and smallest corrective action.
3. Required deployment order and any minimum-version change, separately from normal deployment.
4. Checks completed and gaps, including whether an actual old binary, offline upgrade, OTA rollback, and release availability were tested.

Do not claim a runtime fingerprint proves backend or local-data compatibility. Do not claim a source review proves that an update installed successfully on a device. Do not deploy, raise minimum versions, or publish OTA updates solely because this review passed.
