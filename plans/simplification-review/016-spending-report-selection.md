# Plan 016: Keep report selections linked to current data

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P2
- Effort: S–M
- Risk: Low–medium
- Confidence in finding: High
- Depends on: plans/simplification-review/004-purchase-projection.md, plans/simplification-review/012-receipt-read-boundaries.md
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/app/(tabs)/spending.tsx' 'src/app/analysis.tsx' 'src/components/spending-details.tsx' 'src/features/spending-reports/*' 'src/lib/spending-selection.ts' 'src/lib/spending-selection.test.ts' 'src/lib/domain/spending-analysis.test.ts' 'src/lib/domain/insights.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

Spending and Analysis copy a computed SpendingGroup into component state when a detail sheet opens. Convex can then update the receipts while the open sheet keeps the old group. Spending also defines report choices, titles, and content in separate branches, so adding a report requires coordinated edits in several places.

## Target design

Store only a typed selection key and its dimension/period. Derive the selected group from current data. Define a clear fallback when the group no longer exists. Use one small typed report dispatcher so every supported report has a title and renderer. Keep ordinary view components and the existing report calculation functions.

## Current state

Source references:
- `src/app/(tabs)/spending.tsx:69`
- `src/app/(tabs)/spending.tsx:93`
- `src/app/(tabs)/spending.tsx:492`
- `src/app/(tabs)/spending.tsx:572`
- `src/app/(tabs)/spending.tsx:592`
- `src/app/analysis.tsx:42`
- `src/app/(tabs)/history.tsx:32`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/app/(tabs)/spending.tsx:69

```text
69:   const [selected, setSelected] = useState<SpendingGroup | null>(null);
70:   const comparison = comparisonInsights(receipts, month, reviewedOnly);
71:   const totals = comparison.current;
72:   const coverage = receiptCoverage(receipts);
73:   const catalog = catalogInsights(totals.selected);
```

### src/app/(tabs)/spending.tsx:93

```text
93:   const showDetails = (value: SpendingGroup) => {
94:     setReport(null);
95:     setSelected(value);
96:   };
97:   const select = (
```

### src/app/(tabs)/spending.tsx:492

```text
492:             {[
493:               {
494:                 id: "attributes" as const,
495:                 title: "Produktegenskaper",
496:                 icon: "tag" as const,
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

- `src/app/(tabs)/spending.tsx`
- `src/app/analysis.tsx`
- `src/components/spending-details.tsx`
- `src/features/spending-reports/*` (new views if required)
- `src/lib/spending-selection.ts` (new if pure resolver is needed)
- `src/lib/spending-selection.test.ts` (new)
- `src/lib/domain/spending-analysis.test.ts` (test; create only when specified)
- `src/lib/domain/insights.test.ts` (test; create only when specified)

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
| `npm test -- src/lib/spending-selection.test.ts src/lib/domain/spending-analysis.test.ts src/lib/domain/insights.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Replace the copied group with a typed selection value in Spending and Analysis. Derive the current group on each render; use History's selected-key pattern as an existing example.

**Verify:** `npm test -- src/lib/spending-selection.test.ts src/lib/domain/spending-analysis.test.ts src/lib/domain/insights.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Define behavior for receipt edits, deletion, period change, and groups with no remaining purchases. Keep the sheet stable while its data changes; use an empty state or close it only at the explicit selection boundary.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Consolidate report choice, title, and rendering coverage in one exhaustive typed dispatcher. Coordinate extracted views with package013 so both packages do not create competing file structures.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Open a group, edit or delete a contributing receipt, and confirm its displayed total and rows update.
- Changing period cannot retain purchases from the previous period in a selected group.
- Removing the last purchase has a defined empty state and no crash.
- Every report choice has a title and content; existing category/protein/product views remain available.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] Spending and Analysis do not store computed SpendingGroup objects in state. Open detail sheets use current receipt data, and the report dispatcher is exhaustively typed.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not change which purchases belong in each report in this package. Those policies belong to package004. Do not add a general reporting framework.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/spending-report-selection`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Selection is identity; report data is derived

Define the selected group by its dimension, key, and period. A pure selection resolver consumes current report data and returns the current group or one clearly defined absence. Do not copy a mutable computed SpendingGroup into state, and do not use an effect to synchronize the copy.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

Keep selection as identity, calculations as derived data, and transient sheet presentation as local state.
