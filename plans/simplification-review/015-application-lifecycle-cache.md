# Plan 015: Give query lifecycle and cache removal explicit owners

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: DONE
- Priority: P2
- Effort: S–M
- Risk: Medium
- Confidence in finding: High
- Depends on: None
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/features/release-policy.tsx' 'src/features/catalog-query-provider.tsx' 'src/features/session.tsx' 'src/app/_layout.tsx' 'src/features/query-lifecycle.tsx' 'src/lib/query-lifecycle.test.ts' 'src/lib/deployment-storage.test.ts' 'src/lib/releases/policy.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

The release-policy and catalog providers each install an AppState listener that writes to TanStack Query's global focusManager. The global onlineManager is configured only inside the household catalog provider. Catalog provider cleanup also clears its QueryClient and removes the persisted cache on every unmount. That couples ordinary component teardown to deletion of useful cached data.

## Target design

Install one application-level foreground/network bridge above household providers. Keep release-policy and catalog QueryClients separate because their scopes and lifetimes differ. Subscription cleanup removes listeners only. An explicit account/session removal operation owns deletion of private persisted catalog data.

## Current state

Source references:
- `src/features/release-policy.tsx:110`
- `src/features/catalog-query-provider.tsx:30`
- `src/features/catalog-query-provider.tsx:33`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/features/release-policy.tsx:110

```text
110:   useEffect(() => {
111:     focusManager.setFocused(AppState.currentState === "active");
112:     const listener = AppState.addEventListener("change", (state) => {
113:       setActive(state === "active");
114:       focusManager.setFocused(state === "active");
```

### src/features/catalog-query-provider.tsx:30

```text
30:   useEffect(() => {
31:     onlineManager.setOnline(online);
32:   }, [online]);
33:   useEffect(() => {
34:     focusManager.setFocused(AppState.currentState === "active");
```

### src/features/catalog-query-provider.tsx:33

```text
33:   useEffect(() => {
34:     focusManager.setFocused(AppState.currentState === "active");
35:     const subscription = AppState.addEventListener("change", (state) =>
36:       focusManager.setFocused(state === "active"),
37:     );
```

## Repository conventions and product constraints

- This is an Expo Router / React Native app with a Convex backend, TypeScript, Zod, Vitest, and convex-test.
- Read AGENTS.md and https://docs.expo.dev/versions/v57.0.0/ before writing application code. Match existing naming, two-space TypeScript formatting, and the `@/` source alias.
- Use professional, direct names. Keep behavior in its owning layer. Do not introduce a generic form, repository, workflow, or reporting framework.
- Use `src/lib/domain/receipt-review.test.ts` for pure domain test style and `convex/receipts.test.ts` for authenticated backend test style. Use `src/lib/upload-queue.test.ts` for narrow queue collaborators.
- Receipt money is integer øre. Preserve receipt text as evidence. Classification, catalog identity, and purchased quantity are different decisions.
- Fresh or unlisted grocery products must remain valid. Explicit user choices, household isolation, and intentional product separation must survive.
- Category learning comes from human approval. Automatic approval does not teach category memory. Preserve existing approval thresholds.
- Development data is disposable, but local unsent receipt files and upload progress are not. Do not add a historical backfill unless this package needs one.
- Follow docs/releases.md and docs/observability.md when those concerns are touched. Do not emit receipt contents or credentials into new diagnostics.

## Scope

Only these implementation and test files are in scope. Entries marked new are proposed files. Existing tests may be extended, but do not create empty files merely to satisfy a test filter.

- `src/features/release-policy.tsx`
- `src/features/catalog-query-provider.tsx`
- `src/features/session.tsx`
- `src/app/_layout.tsx`
- `src/features/query-lifecycle.tsx` (new)
- `src/lib/query-lifecycle.test.ts` (new)
- `src/lib/deployment-storage.test.ts` (test; create only when specified)
- `src/lib/releases/policy.test.ts` (test; create only when specified)

Convex generated files may change only as the output of the normal code-generation workflow when required. Never edit their contents by hand. Plan status files are also in scope.

Out of scope:
- Other packages in this review unless named as a dependency.
- Unrelated visual changes, provider/model changes, new features, broad dependency upgrades, and unrelated schema cleanup.
- Deployments, OTA publication, builds for distribution, secret changes, or changes to AGENTS.md.

## Commands and expected results

The following baseline commands passed at the audited commit: `npm run typecheck`, `npm run lint`, and `npm test` (148 tests in 31 files).
Focused commands below are the implementation gates; new test files must first contain the cases specified in this plan.

| Command | Expected result |
| --- | --- |
| `npm test -- src/lib/query-lifecycle.test.ts src/lib/deployment-storage.test.ts src/lib/releases/policy.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Extract the shared AppState/network bridge and mount it once above the authenticated subtree. Preserve policy fetch behavior before sign-in. Verify initial focus and connectivity as well as subsequent events.

**Verify:** `npm test -- src/lib/query-lifecycle.test.ts src/lib/deployment-storage.test.ts src/lib/releases/policy.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Separate catalog subscription cleanup from cache removal. Put removal on the explicit sign-out/account-change boundary. Keep household and deployment cache keys unchanged.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Add focused tests around lifecycle subscription and eviction decisions. Use a narrow adapter owned by the app; do not mock TanStack internals. Check restore and sign-out behavior on a development build.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Normal provider unmount/remount retains a valid persisted catalog cache.
- Sign-out removes private cached data according to current account policy; another account cannot restore it.
- One foreground/network event updates each global manager once, including before sign-in.
- Offline startup uses eligible cached policy/catalog data; foreground refresh and feature gates still work.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] Only one application owner installs query lifecycle listeners. Provider teardown cannot delete persisted private data unless the explicit session-removal policy requires it.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not merge the release-policy and catalog QueryClients, weaken account isolation, or change release-policy TTL and update-lock behavior.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/application-lifecycle-cache`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Separate event decisions from native effects

The lifecycle bridge has explicit native subscription effects. Keep those effects visible instead of presenting the bridge as a pure function. Cache eviction decisions can be pure inputs-to-decision operations; the owner performs removal only for that decision. Do not add a broad dependency-injection container to test two event sources.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

When adding a query provider, reuse the application lifecycle bridge. Decide its persistence scope and eviction trigger separately.

## Implementation record

Installed one application foreground/network bridge above sign-in and kept separate policy/catalog clients. Provider teardown now retains catalog persistence. Account changes explicitly remove private catalog entries; this required a narrow scope extension in src/lib/catalog-cache.ts. All 187 tests pass, including lifecycle subscription and eviction decisions. Offline restore and sign-out on a native build remain unverified.

Validation: `npm run typecheck`, `npm run lint`, `npm test`, and `git diff --check` passed. No deployment was performed.
