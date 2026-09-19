# Plan 001: Give each edit one draft state

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P1
- Effort: M–L
- Risk: Medium
- Confidence in finding: High
- Depends on: None
- Category: correctness and architecture
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/app/receipt/[id].tsx' 'src/features/receipt-line-editor.tsx' 'src/features/budget-settings.tsx' 'src/components/money-field.tsx' 'src/features/receipt-draft.ts' 'src/lib/receipt-draft.test.ts' 'convex/receipts.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

ReceiptEditor is 982 lines inside a 1,117-line route and has 20 useState calls. Draft data, baseline revision, pending product choices, save results, and modal state share one owner. Product selection and exclusion set dirty without clearing approved. After an approval, these edits can leave the footer showing navigation instead of Save. BudgetSettings has a related split: its keyed MoneyField adopts a changed server budget while the value submitted by Save remains in the parent’s older state.

## Target design

Use a receipt draft reducer with baseline, edited values, pending link commands, validation, and an explicit operation state. Keep transient sheet selection outside the draft. Derive footer state from the draft and current operation. Give the entire budget form a single baseline/reset boundary; do not reset only its input.

## Current state

Source references:
- `src/app/receipt/[id].tsx:151`
- `src/app/receipt/[id].tsx:286`
- `src/app/receipt/[id].tsx:602`
- `src/app/receipt/[id].tsx:683`
- `src/app/receipt/[id].tsx:918`
- `src/features/budget-settings.tsx:16`
- `src/features/budget-settings.tsx:39`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/app/receipt/[id].tsx:151

```text
151:   const [data, setData] = useState<ReceiptData | null>(receipt.data);
152:   const [loadedData, setLoadedData] = useState(receipt.data);
153:   const [revision, setRevision] = useState(receipt.revision);
154:   const [duplicateResolved, setDuplicateResolved] = useState(
155:     receipt.duplicateResolved,
```

### src/app/receipt/[id].tsx:286

```text
286:   function reset(current: Receipt) {
287:     setData(current.data);
288:     setLoadedData(current.data);
289:     setRevision(current.revision);
290:     setDuplicateResolved(current.duplicateResolved);
```

### src/app/receipt/[id].tsx:602

```text
602:               onPress={() => {
603:                 setExcluded(!excluded);
604:                 setDirty(true);
605:               }}
606:             >
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

- `src/app/receipt/[id].tsx`
- `src/features/receipt-line-editor.tsx`
- `src/features/budget-settings.tsx`
- `src/components/money-field.tsx`
- `src/features/receipt-draft.ts` (new)
- `src/lib/receipt-draft.test.ts` (new)
- `convex/receipts.test.ts` (test; create only when specified)

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
| `npm test -- src/lib/receipt-draft.test.ts convex/receipts.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Add a pure draft transition module and tests for edit, save-start, save-success, save-failure, remote revision, discard, and delete. Use a discriminated operation state, not another set of booleans. Run the focused draft tests.

**Verify:** `npm test -- src/lib/receipt-draft.test.ts convex/receipts.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Route every receipt edit, including remember, store, product, exclusion, and duplicate decisions, through draft actions. A new edit must clear the previous save result. Preserve dirty drafts when a remote revision arrives; show the existing conflict path. Run typecheck and receipt tests.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Separate the editor controller, line list, toolbar, and footer by responsibility. Keep save and delete transactions unchanged in this package. Remove unused readings prop; do not delete stored extractions. Run lint and all tests.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Make BudgetSettings reset the complete form at an accepted server baseline. Preserve an active local edit or explicitly expose a conflict. The visible value and submitted value must come from one draft. Check the device scenarios below.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Approve, then select a product or toggle exclusion: Save returns and submits the edit.
- A remote receipt revision does not overwrite a dirty draft; discard accepts the new baseline.
- Save acknowledgement and query data can arrive in either order. Only a query snapshot at or beyond the acknowledged revision may establish a persisted baseline, and later local edits must remain intact.
- Delete unmounts the unsaved-change guard before navigation; a missing receipt still shows the current empty state.
- Change the budget from another session while Settings is open: Save never submits a number different from the displayed input.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] No receipt edit path writes independent dirty/approved flags. The route contains composition and routing; the draft module owns reset and transitions. All listed scenarios pass.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not change approval policy, backend link semantics, or navigation behavior to make the reducer easier. If an existing transition cannot be represented, document it before choosing a new behavior.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/receipt-draft-state`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Draft transitions have one explicit result

Define the receipt draft responsibility through reduceReceiptDraft(state, action): ReceiptDraft. Separate save/delete requests from the state transition: the controller performs I/O, then supplies a success or failure event. Pure transitions must not allocate IDs, read the clock, mutate nested caller objects, or fetch server data. Keep optional user input representable in the draft; parsing is a later boundary.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

A new editable field must enter the draft and its reset operation together. Do not create a generic form framework.
