# Plan 005: Separate review decisions from displayed sentences

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: DONE
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
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'src/lib/domain/receipt.ts' 'src/lib/domain/receipt-review.ts' 'src/lib/domain/category-memory.ts' 'src/lib/domain/receipt-extraction.ts' 'convex/processing.ts' 'convex/aliases.ts' 'convex/catalogMatching.ts' 'src/features/receipt-line-editor.tsx' 'src/app/receipt/[id].tsx' 'src/lib/domain/receipt-review.test.ts' 'src/lib/domain/category-memory.test.ts' 'src/lib/domain/receipt-extraction.test.ts' 'convex/receiptReview.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

Approval and category learning treat Norwegian issue sentences as state. reviewTasks also independently reconstructs much of canAcceptReceipt and identifies financial issues through the words rabatt and pantretur. A wording change can alter application behavior.

## Target design

Use a small ReceiptIssue union and one assessReceipt result. Include stable codes for known issues and reader_issue with uninterpreted message text for arbitrary provider remarks. Derive approval, tasks, counts, and summaries from this result. Keep the current low-friction review policy.

## Current state

Source references:
- `src/lib/domain/receipt.ts:37`
- `src/lib/domain/receipt-review.ts:10`
- `src/lib/domain/receipt-review.ts:115`
- `src/lib/domain/receipt-review.ts:144`
- `src/lib/domain/receipt-review.ts:167`
- `src/lib/domain/category-memory.ts:40`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### src/lib/domain/receipt.ts:37

```text
37:   issues: v.array(v.string()),
38:   manual: v.boolean(),
39:   productKey: nullableString,
40:   receiptName: v.optional(v.string()),
41:   productId: v.optional(v.union(v.id("products"), v.null())),
```

### src/lib/domain/receipt-review.ts:10

```text
10: export const categoryUncertainIssue = "Kategorien er usikker.";
11:
12: /** A category decision resolves category uncertainty, not reading or amount errors. */
13: export function confirmLineCategory(
14:   line: ReceiptLine,
```

### src/lib/domain/receipt-review.ts:115

```text
115: export function canAcceptReceipt(
116:   data: ReceiptData,
117:   unresolvedDuplicate: boolean,
118: ): boolean {
119:   return (
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

- `src/lib/domain/receipt.ts`
- `src/lib/domain/receipt-review.ts`
- `src/lib/domain/category-memory.ts`
- `src/lib/domain/receipt-extraction.ts`
- `convex/processing.ts`
- `convex/aliases.ts`
- `convex/catalogMatching.ts`
- `src/features/receipt-line-editor.tsx`
- `src/app/receipt/[id].tsx`
- `src/lib/domain/receipt-review.test.ts` (test; create only when specified)
- `src/lib/domain/category-memory.test.ts` (test; create only when specified)
- `src/lib/domain/receipt-extraction.test.ts` (test; create only when specified)
- `convex/receiptReview.test.ts` (test; create only when specified)

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
| `npm test -- src/lib/domain/receipt-review.test.ts src/lib/domain/category-memory.test.ts src/lib/domain/receipt-extraction.test.ts convex/receiptReview.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Create a typed assessment and behavior tests covering every current approval blocker. Preserve original reader messages as data.

**Verify:** `npm test -- src/lib/domain/receipt-review.test.ts src/lib/domain/category-memory.test.ts src/lib/domain/receipt-extraction.test.ts convex/receiptReview.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Generate stable issue codes at the parsing/accounting boundary. Map codes to Norwegian text only for display.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Make canAcceptReceipt, quick approval, review tasks, and category confirmation consume the same assessment. Remove business checks based on translated sentences.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Keep category learning limited to human approvals and explicit remember choices; a category confirmation must not dismiss unrelated reading or amount issues.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Each blocking issue produces a visible task and prevents approval.
- Changing translated text does not change approval.
- Confirming a category removes only category uncertainty.
- Automatic approval never teaches category memory.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] No approval or memory rule searches or compares a displayed issue sentence. One assessment supplies both UI tasks and acceptance.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not make minor spelling or missing optional package data block approval. Do not erase free-form provider warnings.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/typed-review-assessment`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Preserve receipt invariants in the parser result

validateReceipt at src/lib/domain/receipt.ts:131 throws on invalid amounts, duplicate IDs, dates, or category IDs but returns no typed evidence. prepareExtraction at src/lib/domain/receipt-extraction.ts:125 validates then returns the same broad ReceiptData; receipts.save at convex/receipts.ts:185 follows the same check-and-continue pattern. Extend this package to return a ParsedReceipt from a checked construction boundary and use it in the domain assessment. ParsedReceipt means structurally safe receipt evidence, not an approved or complete receipt: missing optional fields and unresolved amounts remain representable under current policy. ReceiptReviewAssessment is a separate result with stable issue codes. A branded alias alone is insufficient; only checked constructors and invariant-preserving transformations may produce the semantic type, and raw edits must pass the boundary again. Expected invalid input should have a typed parse outcome; framework adapters can translate it to existing API errors.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Maintenance notes

A new review requirement enters the typed assessment and gets one test covering both approval and display.

## Implementation record

Added typed accounting/review issues, a checked receipt parser, and one assessment for tasks and approval. Category decisions use a stable code. The compatibility parser reads the previous stored category sentence; arbitrary provider warnings retain their text. Confirmation removes only the category issue. The correction recorder and extracted editor were included because they consume the same category decision.

Verification: typecheck, lint, all 169 tests, and diff checks passed. Tests cover malformed input, structural parsing versus approval, reader-warning preservation, category confirmation, and unchanged inputs. Existing transactional tests retain human-only category learning. No backend was deployed.
