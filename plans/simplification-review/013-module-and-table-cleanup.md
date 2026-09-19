# Plan 013: Remove dead paths and separate large presentation modules

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P3
- Effort: S–M
- Risk: Low
- Confidence in finding: High
- Depends on: plans/simplification-review/001-receipt-draft-state.md, plans/simplification-review/012-receipt-read-boundaries.md, plans/simplification-review/016-spending-report-selection.md
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'convex/samples.ts' 'convex/schema.ts' 'src/lib/catalog/search.ts' 'src/lib/catalog/search.test.ts' 'src/components/ui.tsx' 'src/components/ui/*' 'src/app/(tabs)/spending.tsx' 'src/features/spending-reports/*' 'README.md' 'docs/architecture.md'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

The samples table and its two endpoints are isolated demonstration code. validateSearchSuggestion and its edit-distance helper have only test callers after model search correction was removed. ui.tsx has 956 lines combining typography, inputs, buttons, sheets, navigation layout, and list rows. Spending is 772 lines with several distinct report presentations.

## Target design

Delete confirmed dead functionality. Split ui.tsx into a small set of cohesive presentation modules, keeping existing styling and behavior. Move report views out of Spending so it selects the active view. Add a short architecture guide and table glossary. Do not split every small utility or introduce a generic reporting framework.

## Current state

Source references:
- `convex/samples.ts:6`
- `convex/schema.ts:186`
- `src/lib/catalog/search.ts:25`
- `src/lib/catalog/search.ts:66`
- `src/components/ui.tsx:28`
- `src/components/ui.tsx:698`
- `src/app/(tabs)/spending.tsx:45`
- `src/lib/domain/receipt.ts:313`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### convex/samples.ts:6

```text
6: export const list = query({
7:   args: {},
8:   returns: v.array(schema.doc("samples")),
9:   handler: async (ctx) => ctx.db.query("samples").withIndex("by_name").take(20),
10: });
```

### convex/schema.ts:186

```text
186:   samples: defineTable({ name: v.string(), description: v.string() }).index(
187:     "by_name",
188:     ["name"],
189:   ),
190:   households: defineTable({
```

### src/lib/catalog/search.ts:25

```text
25: export function validateSearchSuggestion(
26:   original: string,
27:   suggestion: unknown,
28: ): string | null {
29:   if (typeof suggestion !== "string") return null;
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

- `convex/samples.ts`
- `convex/schema.ts`
- `src/lib/catalog/search.ts`
- `src/lib/catalog/search.test.ts`
- `src/components/ui.tsx`
- `src/components/ui/*` (new cohesive modules)
- `src/app/(tabs)/spending.tsx`
- `src/features/spending-reports/*` (new views)
- `README.md`
- `docs/architecture.md` (new)

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
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |
| `git diff --check` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Repeat repository-wide reference checks for samples and validateSearchSuggestion. Delete only those confirmed unused endpoints/helper/tests. Regenerate API types through normal tooling.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Split typography/icons, controls, surfaces/rows, and screen/sheet layout into cohesive modules. A temporary ui.ts export facade is acceptable only to avoid an unrelated import rewrite.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Extract the existing report bodies from Spending using the dispatcher and selection model established in package016. Retain the separate report reducers from package004. Do not introduce another report registry.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Write an architecture guide with the receipt flow, identity vocabulary, table ownership, and where to add an issue/parser/report. Remove stale claims that deleted PWA files still exist. Record revisions table retention as a separate operator decision.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Existing search normalization and catalog matching tests remain.
- Native receipt, spending, light/dark mode, large text, and sheet behavior remain visually unchanged.
- No test is added merely to assert a removed function is absent.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] samples and the unused search-suggestion path are absent; ui and Spending no longer mix unrelated presentation responsibilities. The architecture guide explains the current code, not an ideal future system.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not delete revisions, categoryMemory, productMappings, extractions, generated API source files, or active fixture mode under this cleanup package.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/module-and-table-cleanup`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Preserve readable component contracts during extraction

Component props should expose the data and event callbacks required by that view. Do not move a large mutable session/draft object into every new component. Keep small direct view functions and normal React composition; extracting a file does not justify a generic controller or wrapper layer.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

Use size thresholds as review signals, not a reason to scatter cohesive code. Avoid growing new catch-all files.
