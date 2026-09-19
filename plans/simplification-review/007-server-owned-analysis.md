# Plan 007: Complete backend scheduling before removing UI workers

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: DONE
- Priority: P2
- Effort: M
- Risk: Medium
- Confidence in finding: High
- Depends on: plans/simplification-review/006-receipt-write-policy.md
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'convex/productAnalysis.ts' 'convex/catalogMatching.ts' 'convex/processing.ts' 'convex/crons.ts' 'src/features/product-analysis-sync.tsx' 'src/features/session.tsx' 'src/app/receipt/[id].tsx' 'related backend tests' 'convex/productAnalysis.test.ts' 'convex/catalog.test.ts' 'convex/receipts.test.ts' 'convex/releasePolicy.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

The phone scans loaded receipts every 30 seconds to repair missing, old, or failed analysis. Opening a receipt also starts missing catalog work. Most backend transitions already schedule analysis, but processing chooses catalog whenever a key exists, while catalog start can return because its feature is paused. That path does not start analysis. Retries after workflow exhaustion and analysis version repair also depend on the phone.

## Target design

Make Convex own enrichment progress and bounded retries. A skipped or failed optional catalog stage must still allow enabled product analysis. Keep a narrow explicit operator backfill command for version changes, and a manual receipt retry. Remove automatic repair polling from the UI only after those paths are covered.

## Current state

Source references:
- `src/features/product-analysis-sync.tsx:19`
- `src/features/product-analysis-sync.tsx:22`
- `src/app/receipt/[id].tsx:200`
- `convex/processing.ts:306`
- `convex/catalogMatching.ts:120`
- `convex/productAnalysis.ts:75`
- `convex/crons.ts:1`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/features/product-analysis-sync.tsx:19

```text
19:   useEffect(() => {
20:     state.current = { receipts, enabled };
21:   }, [receipts, enabled]);
22:   useEffect(() => {
23:     let running = false;
```

### src/features/product-analysis-sync.tsx:22

```text
22:   useEffect(() => {
23:     let running = false;
24:     let disposed = false;
25:     const run = async () => {
26:       if (
```

### src/app/receipt/[id].tsx:200

```text
200:   useEffect(() => {
201:     if (
202:       !online ||
203:       blocked ||
204:       !policy.features.automaticProductMatching ||
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

- `convex/productAnalysis.ts`
- `convex/catalogMatching.ts`
- `convex/processing.ts`
- `convex/crons.ts` (only if a bounded repair sweep is necessary)
- `src/features/product-analysis-sync.tsx`
- `src/features/session.tsx`
- `src/app/receipt/[id].tsx`
- `related backend tests`
- `convex/productAnalysis.test.ts` (test; create only when specified)
- `convex/catalog.test.ts` (test; create only when specified)
- `convex/receipts.test.ts` (test; create only when specified)
- `convex/releasePolicy.test.ts` (test; create only when specified)

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
| `npm test -- convex/productAnalysis.test.ts convex/catalog.test.ts convex/receipts.test.ts convex/releasePolicy.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Test the current trigger matrix: new receipt, edit, catalog disabled, catalog failure, provider exhaustion, and analysis version change.

**Verify:** `npm test -- convex/productAnalysis.test.ts convex/catalog.test.ts convex/receipts.test.ts convex/releasePolicy.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Make skipped catalog work an explicit completion path that schedules analysis when enabled. Keep receipt approval independent of optional enrichment.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Persist bounded retry state or reuse workflow retry facilities; add an explicit paginated repair/backfill operation. Do not implement an unlimited periodic rescan of all receipts.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Delete ProductAnalysisSync and its session mount. Remove the receipt mount enrichment effect after a server/manual recovery path exists. Retain user-initiated catalog refresh.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Analysis completes after upload with the app closed.
- Paused catalog plus enabled analysis still starts analysis.
- Exhausted retries expose an error and a bounded/manual recovery path.
- Repeated triggers do not duplicate current work; stale results cannot overwrite new revisions.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] No recurring client scan is needed for analysis correctness. Opening a receipt is a read operation. Feature flags and failure recovery retain their behavior.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not delete the two client workers before backend recovery tests pass. Do not bypass service flags or create unbounded retry costs.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/server-owned-analysis`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Every pipeline path returns a meaningful state

Give catalog completion, disabled work, and retry eligibility explicit domain meanings in the existing workflow contracts. An early return for skipped catalog work must not silently mean that all enrichment is complete. Workflow coordinators remain effectful; the decision about which stage is next can be pure. Keep known retryable failures distinct from successful absence where the scheduler needs different behavior.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

Analysis version bumps must include the explicit repair procedure, instead of depending on users opening the app.

## Implementation record

Skipped catalog work schedules analysis. The existing workflow owns three bounded provider attempts; exhaustion remains an error until explicit recovery, so automatic triggers cannot create unlimited retries. `productAnalysis.ensure` is the household manual retry. A receipt toolbar action calls it. `productAnalysis.repair` is an internal operator command with household, cursor, and fixed creation-time boundary; it continues in ten-receipt pages. Version changes use this operation.

Removed the recurring phone analysis worker and the detail-mount enrichment effect after backend tests passed. Upload queue synchronization remains unchanged.

Verification: typecheck, lint, all 180 tests, and diff checks passed. Tests cover skipped/paused catalog, repeated start, exhausted error, manual retry, stale results, and version repair. Workflow scheduling is verified locally; actual closed-app provider completion and native controls remain unverified. No repair command or deployment was run against a live backend.
