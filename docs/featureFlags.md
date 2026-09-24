# Feature flags

Declare each boolean in `src/lib/featureFlags.ts`. Its name and default are defined once. Existing service switches default to true. A new experimental switch must default to false and must have a documented removal condition. Do not add `legacy: true` to a new switch: that marker preserves the closed response used by older clients.

Use `useFeatureFlag("productLookup")` in a component. The hook reads the shared provider; it does not start a request. The provider uses one public `featureFlags.get` subscription above sign-in and version gates. It saves a validated snapshot in SQLite, scoped by deployment, channel, and platform. Missing known flags use their defaults, unknown future flags are ignored, and malformed known values are rejected. A saved disabled flag does not expire. Live results replace the saved fallback after reconnect.

Use `featureEnabled(ctx, "productLookup")` from `convex/featureFlags.ts` for shared server work. Either platform can stop it. A platform-specific client mutation still declares its service in `clientMutation`; compatibility and current database flags are checked before the write. Actions can call `internal.featureFlags.enabled`. Flags do not replace membership or receipt ownership checks. Work already running can finish under the existing service rules in `docs/releases.md`.

## Operator changes

Read `featureFlags:get` with the platform to obtain the current flag revision. Then call the internal `featureFlags:set` mutation through the dashboard or CLI for the explicitly authorized deployment. Supply one known name, a boolean, the current `expectedRevision`, an operator label, and a reason. For example, these arguments pause lookup:

```json
{
  "platform": "ios",
  "name": "productLookup",
  "enabled": false,
  "expectedRevision": 0,
  "operator": "Andreas",
  "reason": "Pause catalog requests during maintenance"
}
```

This is an example, not an instruction to change a live deployment. The response contains the new flag revision. Reset an override by setting the registry default with a new revision and reason. Stale writes fail. Changes are recorded in `featureFlagHistory`. No public write or separate management screen exists.

The four existing flags are permanent service controls. Remove one only when its service no longer needs an independent stop control and all supported clients can use the replacement behavior. An experimental flag must state its own removal condition when added.

## Compatibility transition

A scope without a `featureFlags` document reads its old `releasePolicies.features` values. Its first operator write copies those values into the new document and removes the old writable fields in the same transaction. This preserves configured false values without a deployment-time data migration. Existing history records remain intact.

Old clients can still call `releasePolicy.get`. That read projects the legacy four values from the same authoritative flag store. A flag change advances the release-policy revision so old clients and stale operator forms can detect it. The old `releasePolicy.configure` operation forwards its supplied legacy flags to the new store; it cannot create a second writable copy. New version reads use `releasePolicy.getVersions` and do not carry flag values. Native minimums and replacement-availability checks remain separate.

On the first offline app start after this upgrade, the flag provider can read the old persisted release-policy flags. Version-cache writes retain the legacy four flags from the shared snapshot. This keeps confirmed update requirements readable by an older client after OTA rollback. This compatibility cache is not a second server configuration source.

## Verification limits

Unit and Convex tests cover defaults, parser failures, legacy transfer, revision conflicts, operator forwarding, and platform/deployment separation. The provider has one subscription by construction. Native offline startup, disconnect/reconnect, resume, and an installed old binary still require device checks before release. No live values are changed by these source changes.

## Email registration

`emailSignUp` defaults to false. It is a permanent account-creation control,
not an experiment. The sign-in screen hides email registration while it is off.
The server checks the current flag on `/sign-up/email`, including requests from
older apps or direct HTTP clients. Existing email accounts can still sign in;
Apple sign-in and account linking are unchanged.

Authentication is shared between platforms. Enable `emailSignUp` for **both
`ios` and `android`** in the selected deployment to allow email registration.
Disabling either platform blocks registration on the server. Read each platform's
revision first, then use `featureFlags:set` with `name: "emailSignUp"` and the
required operator fields. This uses the same revision checks and history as
other flags. No backend deployment or app rebuild is needed to change a live flag.
An offline screen can retain an older value, but it cannot bypass the server.

Enable both flags in the isolated end-to-end backend before account fixtures are
created. Keep the staging flags off unless email registration is needed. Remove
this flag only when email registration is retired or replaced by an account
creation policy that provides equivalent control.
