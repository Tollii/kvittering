# Plan 004: Use one purchase projection for reports and price signals

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P1
- Effort: M–L
- Risk: Medium
- Confidence in finding: High
- Depends on: plans/simplification-review/002-package-evidence.md
- Category: correctness and architecture
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/lib/domain/purchase-projection.ts' 'src/lib/domain/insights.ts' 'src/lib/domain/family-insights.ts' 'src/lib/domain/attribute-insights.ts' 'src/lib/domain/spending-analysis.ts' 'src/lib/domain/price-signals.ts' 'src/lib/catalog/insights.ts' 'related insight/price tests' 'src/lib/domain/insights.test.ts' 'src/lib/domain/family-insights.test.ts' 'src/lib/domain/spending-analysis.test.ts' 'src/lib/domain/price-signals.test.ts' 'src/lib/catalog/insights.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

Reports repeat eligibility, reconciliation, freshness, and line lookup rules. Excluded targets can appear in monthly price warnings even though they are excluded from comparison history. Price signals divide by raw receipt quantity rather than interpreted purchase quantity. A local example with identical ten-packs represented as quantity 10 versus 1 produced a ratio of 10. monthPriceSignals also rebuilds all history once per target receipt.

## Target design

Prepare typed purchase contributions once, with an explicit eligibility policy, reconciled amounts, current analysis indexed by line, and quantity coverage. Build price observations with an explicit basis: a known retail package, units, grams, or millilitres. Keep report reducers separate. Overview inclusion of provisional receipts can remain different from comparison reports, but the policy must be named.

## Current state

Source references:
- `src/lib/domain/insights.ts:29`
- `src/lib/domain/family-insights.ts:24`
- `src/lib/domain/attribute-insights.ts:30`
- `src/lib/domain/spending-analysis.ts:62`
- `src/lib/domain/price-signals.ts:27`
- `src/lib/domain/price-signals.ts:103`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/lib/domain/insights.ts:29

```text
29:   const eligible = receipts.filter(
30:     (r) =>
31:       !r.excluded &&
32:       r.data &&
33:       receiptMonth(r) === month &&
```

### src/lib/domain/family-insights.ts:24

```text
24:   for (const receipt of receipts) {
25:     if (!receipt.data || receipt.excluded || receipt.data.currency !== "NOK")
26:       continue;
27:     const analysis = receipt.productAnalysis;
28:     const current =
```

### src/lib/domain/attribute-insights.ts:30

```text
30:   for (const receipt of receipts) {
31:     if (
32:       !receipt.data ||
33:       receipt.excluded ||
34:       receipt.data.currency !== "NOK" ||
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

- `src/lib/domain/purchase-projection.ts` (new)
- `src/lib/domain/insights.ts`
- `src/lib/domain/family-insights.ts`
- `src/lib/domain/attribute-insights.ts`
- `src/lib/domain/spending-analysis.ts`
- `src/lib/domain/price-signals.ts`
- `src/lib/catalog/insights.ts`
- `related insight/price tests`
- `src/lib/domain/insights.test.ts` (test; create only when specified)
- `src/lib/domain/family-insights.test.ts` (test; create only when specified)
- `src/lib/domain/spending-analysis.test.ts` (test; create only when specified)
- `src/lib/domain/price-signals.test.ts` (test; create only when specified)
- `src/lib/catalog/insights.test.ts` (test; create only when specified)

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
| `npm test -- src/lib/domain/insights.test.ts src/lib/domain/family-insights.test.ts src/lib/domain/spending-analysis.test.ts src/lib/domain/price-signals.test.ts src/lib/catalog/insights.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Characterize current report inclusion rules and label deliberate differences. Add focused tests for excluded price targets and equivalent package/unit representations before refactoring.

**Verify:** `npm test -- src/lib/domain/insights.test.ts src/lib/domain/family-insights.test.ts src/lib/domain/spending-analysis.test.ts src/lib/domain/price-signals.test.ts src/lib/catalog/insights.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Introduce preparePurchases with explicit inclusion options. Move analysis currency/revision/generation/evidence checks to a canonical analysis selector outside an individual report.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Convert report reducers to the prepared contributions. Preserve category totals, discounts, deposits, refunds, unknown quantities, and incomplete coverage labels.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Build the price-history index once. Compare only compatible quantity bases from current analysis; leave unknown or stale denominators unreported. Do not silently default to one package.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Excluded receipts never become monthly price-warning targets.
- Same-price ten-packs have the same price basis when extracted as units or packages.
- Foreign currency, duplicate suspicion, provisional receipts, undated receipts, and stale analysis follow explicit report policies.
- Accounting sums stay unchanged for supported fixtures; unknown quantities stay unknown.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] Report-specific eligibility differences are explicit; shared freshness and contribution construction have one owner; price history is prepared once per report.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not change the product budget definition or silently exclude all unreviewed receipts. If a current difference is intentional, preserve it as an explicit option.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/purchase-projection`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Calculations consume a purchase projection

The projection owns receipt eligibility, current-analysis evidence, and quantity basis. Return a typed purchase collection and any completeness/coverage information that the caller needs. Individual report reducers consume that projection, not entire mutable receipt documents with repeated guards. Keep period, currency policy, and provisional-review inclusion explicit. A simple absent analysis value may stay absent when consumers make no distinction between the reasons.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

New reports consume the projection rather than duplicating reconciliation or analysis freshness checks.
