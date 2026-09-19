# Plan 019: Make featureFlags simple to define and consume

> Proposed work. Execute this package last, after the active simplification work. Read the current source first and preserve completed changes from other packages. This plan does not authorize deployments or changes to live flag values.

## Status

- Status: DONE
- Priority: P2
- Effort: M
- Change risk: Medium
- Finding confidence: High
- Depends on: 015 for shared application lifecycle ownership
- Added: 2026-09-19, during execution of the existing plans

## Finding

A basic flag system exists, but its public owner is named releasePolicy. Four boolean fields are declared in src/lib/releases/policy.ts:28, repeated as defaults at :69, and repeated as an argument union in convex/releasePolicy.ts:92. UI consumers access policy.features; backend guards call featureEnabled or declare a service on clientMutation. Operator changes currently require submitting the full release settings object.

The client reads flags through the release-policy HTTP query and a five-minute refetch interval in src/features/release-policy.tsx. This works, but hides the flag responsibility and adds unnecessary refresh work for data Convex can subscribe to. Adding a flag also changes a closed object schema instead of one definition.

## Target

Name the system featureFlags. Use src/lib/featureFlags.ts for definitions and parsing, convex/featureFlags.ts for persisted reads and writes, and src/features/featureFlags.tsx for the shared subscription and simple hook. Keep app-version requirements in the existing version-control module; do not rename unrelated release checks to featureFlags.

The developer should declare a boolean flag and its default once, then consume it without knowing how it is fetched:

```ts
// Proposed interfaces; not implemented yet.
const enabled = useFeatureFlag("productLookup");
const enabledOnServer = await featureEnabled(ctx, "productLookup");
```

Flag names are inferred from one definition registry. Unknown names fail at development time at typed call sites and at runtime at the operator boundary. New experimental flags default to false. Preserve the current defaults and configured values of the existing four flags.

Use Convex for the storage, query cache, dependency tracking and push updates. Do not add a flag SDK, separate network client, TanStack cache, refresh timer or custom subscription manager.

## Read and write contracts

- featureFlags.get is a small query for the current platform and deployment scope. Use one shared subscription through the existing Convex client. Keep it outside any UI gate that could prevent recovery. Do not require a household login for these public application switches or expose internal operator metadata in the public result.
- useFeatureFlag(name) returns the resolved boolean. It reads the shared snapshot; it does not issue a request, install a timer, or copy individual flags into local state on each call.
- featureFlags.set is an operator-only internal mutation that changes one known flag. Named inputs include platform, name, enabled, expectedRevision, operator and reason. Return only a small revision acknowledgement or null. The query supplies updated values automatically.
- Server guards use the current database state within their transaction. They do not trust the phone's cache or keep an independent process cache. Actions and workflows use an internal read function when needed.
- Retain platform/deployment isolation and the current shared-work rule: either platform can stop shared processing. Do not introduce per-user targeting, experiments or percentage rollout in this package.

## Subscription and cache behavior

An active query subscription needs no TTL. Calling the hook again with the same scope during rendering reads its current result. Convex updates subscribed results when relevant dependencies change and re-establishes subscriptions after reconnection. A valid server query-cache entry can serve repeated requests without database reads; initial requests, invalidated entries and cache misses can still execute. Do not claim every function call is free or apply query-cache guarantees to mutations.

Persist one last-known flag snapshot with the existing SQLite key-value storage for startup and offline use. This is a fallback, not another source of truth. Key it by deployment and platform, parse it on load, and let the live query replace it. Use registry defaults when no valid snapshot exists. Keep known disabled values during a connection failure; an arbitrary expiry must not silently enable a paused feature. Do not add a freshness timer or manual refresh call to feature consumers. A future maximum offline age would be a separate product rule, not a way to keep an online subscription current.

The subscription should remain useful across screen navigation. Reuse the lifecycle owner from 015 if suspension is required when the app backgrounds. Avoid separate AppState/network listeners per flag or screen. Feature flags do not replace authorization, and current server checks remain authoritative.

## Storage and parsing

Keep persisted overrides small and directly named featureFlags. A configuration document per existing platform/deployment scope is sufficient. Keep one authoritative location for each value. Retain revision checks, operator change history and existing history records; use simple configuration/history storage rather than a new audit framework.

Adding a flag must not require another table, schema field, literal union or default map. Derive known names and defaults from the registry. Parse a serialized boolean map at the boundary: default missing known keys and ignore unknown keys from newer clients/servers. Reject malformed known values. The normalizer returns a typed FeatureFlags value without changing its input. Flags are plain boolean configuration, not a general expression language.

Use pure operations for resolving defaults and parsing snapshots. Keep database reads, persistence and writes in their respective adapters. No class hierarchy, command bus or generic provider framework is needed.

## Scope

- src/lib/featureFlags.ts and its focused tests (new)
- src/features/featureFlags.tsx (new)
- convex/featureFlags.ts and its focused tests (new)
- convex/schema.ts
- convex/clientFunctions.ts
- convex/releasePolicy.ts and convex/releasePolicy.test.ts, limited to separation and compatibility
- src/lib/releases/policy.ts, cache.ts and client.ts, limited to the current flag coupling
- src/features/release-policy.tsx and the application provider composition
- Existing UI, mutation, action and workflow flag consumers
- docs/featureFlags.md (new), docs/releases.md and plan status/report entries

Read AGENTS.md, the exact Expo 57 documentation and Convex guidance before implementation. Read the release-review skill before changing the public configuration contract. Do not modify another agent's active source files until that package is complete.

## Steps and verification

1. Inventory current consumers, defaults, configured values, platform behavior and provider order. Identify how version gates read their policy before separating flags. Add focused tests for the current service behavior that must remain.
2. Introduce the single registry and pure snapshot parser. Verify known booleans, missing defaults, unknown future keys, malformed values and unchanged input with focused tests.
3. Add the indexed query and operator-only single-flag mutation. Preserve revision checks and history. Verify unrelated flags and version requirements remain unchanged, stale edits fail, and ordinary app clients cannot write flags.
4. Add one reactive provider using the existing Convex client and the persisted startup/offline fallback. Replace policy.features access with useFeatureFlag. Verify multiple consumers share the subscription, a server change updates them without manual refetch, and reconnect restores current values.
5. Move backend flag checks to featureFlags while preserving transaction authority and the existing shared-platform rule. Remove redundant per-flag declarations and flag-specific HTTP polling. Keep version-gate behavior intact.
6. Define a small transition from existing stored release settings. Preserve configured false values and defaults. Old clients may still read flags from releasePolicy.get: use a temporary read adapter backed by the same authoritative values where required. Do not keep two independently writable flag stores. Review old operator writes and persisted caches as well. Execute any deployment or data transition only with explicit target authorization.
7. Document how to add one flag, consume it in UI/server code, and set/reset an override through Convex operator tools. A separate admin UI is out of scope. Run the full checks and update this plan and the report.

After each source step, run the relevant focused tests and typecheck before proceeding. Final checks:

```sh
npm test -- src/lib/featureFlags.test.ts convex/featureFlags.test.ts convex/releasePolicy.test.ts
npm run typecheck
npm run lint
npm test
git diff --check
```

New test files must contain meaningful behavior tests before being included in those commands. Do not test the Convex cache implementation itself or add tests whose only assertion is that old code was deleted. Native connectivity checks supplement unit tests; record them separately.

## Acceptance

- [ ] Developers add a boolean flag/default in one registry, without changing the database schema or duplicating its name elsewhere.
- [ ] useFeatureFlag hides subscription, startup and offline fallback; it returns the current resolved boolean.
- [ ] A live server change updates mounted consumers without TTL polling, manual invalidation or mutation-response data.
- [ ] Re-rendering or adding another consumer does not add a per-consumer request loop or network client.
- [ ] Cold start, offline startup, disconnect/reconnect and app resume keep coherent values; live results supersede saved snapshots.
- [ ] Unknown future keys and missing keys are safe. Malformed known values cannot silently become enabled.
- [ ] All existing service switches, server enforcement, scopes, operator revision/history behavior and native version gates remain correct.
- [ ] Operator changes return small acknowledgements; query subscriptions deliver values.
- [ ] No new external state library, generic flag engine, targeting system or management screen is introduced.
- [ ] Verification results and any native/release gaps are recorded, and plans/README.md is updated.

## Limits

Do not rename version requirements to featureFlags, remove update locks, or erase existing history. Do not preserve a second flag source after the transition. Do not use a TTL to delay live changes or replace Convex dependency tracking. Do not add queries inside render callbacks or timers that repeatedly call a read endpoint. Do not change live flag values, commit, push or deploy solely because this plan exists.

## References

- [Convex: automatic query caching](https://docs.convex.dev/realtime#automatic-caching)
- [Convex React: subscriptions and reconnection](https://docs.convex.dev/client/react/overview)

These docs establish the platform behavior. The proposed wrapper only supplies named flags, defaults and a persisted startup/offline fallback.

## Implementation record

Added one typed feature flag registry, an indexed public query, and an internal single-flag operator mutation with revision checks and history. A shared Convex subscription above sign-in and version gates supplies the UI and a scoped SQLite fallback. Server guards read current database values. Legacy policy reads and operator writes use the same flag store; the first operator write transfers existing configured values atomically. Version requirements remain separate, and the old persisted policy format remains readable after OTA rollback. A temporary new flag compiled after changing only the registry, then was removed. Final verification also added a mocked provider request-count test, preserved old receipt issue text at the storage boundary, and restored a bounded read for undated receipt coverage. All 201 tests pass in 42 files. See verification.md for the full record and native/release gaps. No live flag values were changed.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, and `git diff --check` passed. No deployment was performed.
