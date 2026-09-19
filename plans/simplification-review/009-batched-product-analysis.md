# Plan 009: Batch independent Jev analysis questions

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P2
- Effort: M
- Risk: Medium
- Confidence in finding: High
- Depends on: plans/simplification-review/002-package-evidence.md
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'convex/productAnalysisWorker.ts' 'convex/productAnalysis.ts' 'src/lib/domain/product-attribute-classification.ts' 'src/lib/domain/product-families.ts' 'convex/productAnalysis.test.ts' 'convex/productAnalysisWorker.test.ts' 'src/lib/domain/purchase-quantities.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

Each uncached product runs prepare → Jev → saveProfile → prepare in sequence. Only the later quantity interpretation stage is batched. This serializes independent attribute/package questions and repeats database reads. Family creation can depend on previous choices, so replacing the loop with unbounded Promise.all would be incorrect.

## Target design

Use bounded preparation batches, one question batch for independent package/attribute/family candidate judgments, and a transactional profile commit that deduplicates family creation. Run later dependent quantity interpretation after committed profiles are known. Return saved profile IDs from the mutation, then read the persisted profiles through one bounded query.

## Current state

Source references:
- `convex/productAnalysisWorker.ts:66`
- `convex/productAnalysisWorker.ts:100`
- `convex/productAnalysisWorker.ts:157`
- `convex/productAnalysisWorker.ts:175`
- `convex/productAnalysisWorker.ts:192`
- `convex/productAnalysis.ts:143`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### convex/productAnalysisWorker.ts:66

```text
66:     for (const line of receipt.data.lines.filter(
67:       (line) => line.kind === "product",
68:     )) {
69:       let context = await ctx.runQuery(internal.productAnalysis.prepare, {
70:         ...args,
```

### convex/productAnalysisWorker.ts:100

```text
100:         const response = await client.systemOne({
101:           model: env.TYPESAFE_MODEL ?? "jev-latest",
102:           state: {
103:             product: {
104:               name: line.name,
```

### convex/productAnalysisWorker.ts:157

```text
157:         await ctx.runMutation(internal.productAnalysis.saveProfile, {
158:           ...args,
159:           lineId: line.id,
160:           evidenceKey: purchaseEvidenceKey(line),
161:           family,
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

- `convex/productAnalysisWorker.ts`
- `convex/productAnalysis.ts`
- `src/lib/domain/product-attribute-classification.ts`
- `src/lib/domain/product-families.ts`
- `convex/productAnalysis.test.ts`
- `convex/productAnalysisWorker.test.ts` (new)
- `src/lib/domain/purchase-quantities.test.ts` (test; create only when specified)

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
| `npm test -- convex/productAnalysis.test.ts convex/productAnalysisWorker.test.ts src/lib/domain/purchase-quantities.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Separate question construction and answer decoding from orchestration using typed prepared items. Test construction with deterministic fixtures, not live provider calls.

**Verify:** `npm test -- convex/productAnalysis.test.ts convex/productAnalysisWorker.test.ts src/lib/domain/purchase-quantities.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Prepare bounded groups and group equivalent evidence keys before requesting judgments. Send independent questions in one bounded Jev call.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Commit profile/family decisions in one mutation with generation/revision/evidence guards. Resolve equivalent new-family outcomes atomically and return only profile IDs and any required revision acknowledgement.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Read the saved profiles in one focused, bounded query and use that snapshot for the quantity batch. Delete the second broad prepare query and per-line provider call. Retain revision/evidence checks when applying later results.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Several uncached independent products use one provider batch within the configured batch limit.
- Equivalent new-family decisions create one family; unrelated variants remain separate.
- Partial provider failure and stale receipt revisions do not leave accepted mismatched results.
- Existing cached profiles avoid model work.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] No per-line provider request remains for independent profile questions; family dependencies and batch size limits are explicit.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not assume newly created family choices are independent. Do not increase global workpool parallelism as a substitute for simplifying the request graph.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/batched-product-analysis`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Gather data, decide, then write

Gather the profile/family/evidence snapshot explicitly. A pure preparation function constructs typed questions from that snapshot. Parse provider answers into typed classification decisions at the provider boundary. The workflow coordinates I/O, batching, retries, and commits; it does not require a generic pipeline class. Supply reference time explicitly if question preparation needs it. Return only profile IDs from the write. A focused read query supplies the persisted profiles to the coordinator; it must not repeat candidate discovery or provider preparation.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Read-scope acceptance

### Read evidence once per bounded analysis preparation

Read the receipt snapshot once for a bounded batch of line IDs. Deduplicate profile and catalog lookups by key, and reuse category-family candidates within that preparation step. At convex/productAnalysis.ts:168, family queries run even when a profile already exists; request family candidates only when a profile decision needs them. Return only saved profile IDs from saveProfile and read those profiles with one bounded query instead of repeating the broad prepare query. Do not cache database authority across transactions: every commit must still check current generation, revision, evidence, and household scope. Measure logical reads and request counts separately from provider calls.

Required check: For repeated products in one receipt, preparation does not repeat the same profile/catalog/category lookup for each line; a changed revision is still rejected at commit.

## Maintenance notes

Add new independent attribute questions to the existing batch; retain a separate stage only when its inputs depend on prior answers.
