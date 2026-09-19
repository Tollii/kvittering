# Plan 010: Expose stable local receipt snapshots

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P2
- Effort: M
- Risk: Medium
- Confidence in finding: High
- Depends on: None
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/lib/receipt-storage.ts' 'src/lib/receipt-migrations.ts' 'src/lib/upload-queue.ts' 'src/lib/receipt-upload-transport.ts' 'src/features/session.tsx' 'src/lib/upload-queue.test.ts' 'src/lib/receipt-migrations.test.ts' 'src/lib/receipt-storage.test.ts' 'src/lib/deployment-storage.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

The external-store snapshots synchronously read SQLite, parse payloads, stringify the result for stable equality, then parse it again in the component. Storage initialization can also run a migration during that read. All household and queue changes share one listener set. The session component embeds the HTTP upload adapter. LocalReceipt maintains matching images[] and uploaded[] arrays as an invariant checked at runtime.

## Target design

Keep SQLite and the queue roles. Let the storage adapter initialize/parse once and maintain immutable snapshots by owner/household. Notify after committed writes. Move the HTTP transport out of the session component. Represent each queued image with its own upload state when the local payload is next revised, so parallel-array length checks disappear.

## Current state

Source references:
- `src/features/session.tsx:141`
- `src/features/session.tsx:155`
- `src/lib/receipt-storage.ts:21`
- `src/lib/receipt-storage.ts:38`
- `src/lib/receipt-storage.ts:114`
- `src/lib/upload-queue.ts:4`
- `src/features/session.tsx:202`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/features/session.tsx:141

```text
141:   const cachedSnapshot = useSyncExternalStore(
142:     subscribeStorage,
143:     () => JSON.stringify(cachedHousehold(owner)),
144:     () => "null",
145:   );
```

### src/features/session.tsx:155

```text
155:     { initialNumItems: 100 },
156:   );
157:   const queueSnapshot = useSyncExternalStore(
158:     subscribeStorage,
159:     () =>
```

### src/lib/receipt-storage.ts:21

```text
21: function storage() {
22:   if (!database) {
23:     database = openDatabaseSync(`kvitto${storageSuffix}.db`);
24:     database.execSync(
25:       "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS receipt_queue (id TEXT PRIMARY KEY, owner TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS household_cache (owner TEXT PRIMARY KEY, data TEXT NOT NULL);",
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

- `src/lib/receipt-storage.ts`
- `src/lib/receipt-migrations.ts`
- `src/lib/upload-queue.ts`
- `src/lib/receipt-upload-transport.ts` (new)
- `src/features/session.tsx`
- `src/lib/upload-queue.test.ts`
- `src/lib/receipt-migrations.test.ts`
- `src/lib/receipt-storage.test.ts` (new)
- `src/lib/deployment-storage.test.ts` (test; create only when specified)

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
| `npm test -- src/lib/upload-queue.test.ts src/lib/receipt-migrations.test.ts src/lib/receipt-storage.test.ts src/lib/deployment-storage.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Add adapter tests for stable snapshot identity, notification timing, owner separation, and failed writes. Reuse the current SQLite migration test style.

**Verify:** `npm test -- src/lib/upload-queue.test.ts src/lib/receipt-migrations.test.ts src/lib/receipt-storage.test.ts src/lib/deployment-storage.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Initialize and validate persistent state at the storage boundary. Return the same immutable snapshot until a committed mutation changes it; remove render-time JSON round trips.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Extract the narrow UploadTransport implementation from HouseholdProvider. Keep authentication, policy errors, timeouts, and foreground cancellation behavior.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Remove the unused changed callback passed as a no-op to createQueueRunner if storage notifications are canonical. If changing the image payload, add one direct migration preserving reservation IDs and upload progress.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- getSnapshot returns the same reference without a write and a new one after a committed write.
- A failed transaction does not publish uncommitted queue entries.
- Unsent files survive restart, failed upload, final-commit failure, and local schema change.
- Switching account/household does not expose or upload another scope’s queue.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] React snapshots perform no SQLite read or JSON serialization on each render. Storage and transport own their own boundaries; the durable queue remains independently testable.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not replace SQLite with a UI state library or delete upload progress. Do not publish listener changes from inside a transaction before commit.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/local-receipt-store`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Persistent parsing produces a trusted local snapshot

migrateReceipt at src/lib/receipt-migrations.ts:20 already parses unknown input into LocalReceipt and is a useful boundary to keep. cachedHousehold at src/lib/receipt-storage.ts:114 instead uses JSON.parse(row.data) as CachedHousehold. Add a real parser at that read boundary and publish a stable readonly snapshot. Malformed disposable cache data and an unsupported or damaged unsent receipt require different recovery paths; do not represent both as null or silently remove unsent files. Readonly TypeScript types do not freeze objects at runtime, so ownership and immutable updates must enforce the contract.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

Keep raw JSON parsing at the adapter boundary. A cache may be discarded on corruption; unsent receipts must be retained and reported.
