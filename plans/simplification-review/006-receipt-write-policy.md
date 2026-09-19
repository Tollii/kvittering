# Plan 006: Give receipt changes one transaction policy

> Executor instructions: Read this file in full. Implement only this package after the operator selects it. Run each verification gate before proceeding. Update this plan's row in plans/README.md when complete. This is a proposed plan, not a record of completed implementation.

## Status

- Status: TODO
- Priority: P2
- Effort: M
- Risk: Medium–high
- Confidence in finding: High
- Depends on: plans/simplification-review/005-typed-review-assessment.md
- Category: architecture and maintainability
- Planned at: af69fdafc24ae0b2367989e5203f50067b2479d8, 2026-09-19

## Drift check

From the repository root, run:

```sh
git diff --stat af69fdafc24ae0b2367989e5203f50067b2479d8..HEAD -- 'convex/receiptChanges.ts' 'convex/receipts.ts' 'convex/aliases.ts' 'convex/corrections.ts' 'convex/catalogMatching.ts' 'convex/processing.ts' 'convex/receipts.test.ts' 'convex/receiptReview.test.ts' 'convex/corrections.test.ts' 'convex/catalog.test.ts' 'convex/productAnalysis.test.ts'
git status --short
```

The audit baseline was clean. If an in-scope file has changed, compare the evidence below to current source. Dependency plans are expected to change some files: read their completed decisions and adapt symbol locations only. Stop and report if the defect is already fixed, the behavior assumption is false, or the target ownership no longer fits.

## Why this matters

Human save, alias propagation, batch correction, undo, and catalog enrichment separately decide revision increments, history snapshots, status changes, and analysis scheduling. They are already atomic Convex mutations, but their policies differ and are difficult to audit. Batch corrections update data without the same acceptance logic as other paths.

## Target design

Introduce a small ordinary server helper for committing a receipt change, with explicit origin and expected snapshot. Keep each endpoint’s authorization and domain decisions visible. The helper applies the shared revision/history/invalidation work inside the caller’s transaction. Human approval learning remains an explicit human operation, never a default side effect.

## Current state

Source references:
- `convex/receipts.ts:279`
- `convex/aliases.ts:165`
- `convex/corrections.ts:197`
- `convex/corrections.ts:246`
- `convex/catalogMatching.ts:322`
- `convex/catalogMatching.ts:384`

The following short source excerpts are from the audited commit. Read the enclosing function before editing.

### convex/receipts.ts:279

```text
279:     await recordCorrections(ctx, receipt, args.data);
280:     if (args.reviewed)
281:       await learnCategories(
282:         ctx,
283:         member.householdId,
```

### convex/aliases.ts:165

```text
165:       if (changed) {
166:         const autoAccepted =
167:           receipt.status === "needs_review" &&
168:           !receipt.provider.includes("mock") &&
169:           canAcceptReceipt(
```

### convex/corrections.ts:197

```text
197:       await ctx.db.insert("revisions", {
198:         receiptId,
199:         revision: receipt.revision,
200:         data: receipt.data,
201:         editor: "category correction batch",
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

- `convex/receiptChanges.ts` (new)
- `convex/receipts.ts`
- `convex/aliases.ts`
- `convex/corrections.ts`
- `convex/catalogMatching.ts`
- `convex/processing.ts`
- `convex/receipts.test.ts` (test; create only when specified)
- `convex/receiptReview.test.ts` (test; create only when specified)
- `convex/corrections.test.ts` (test; create only when specified)
- `convex/catalog.test.ts` (test; create only when specified)
- `convex/productAnalysis.test.ts` (test; create only when specified)

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
| `npm test -- convex/receipts.test.ts convex/receiptReview.test.ts convex/corrections.test.ts convex/catalog.test.ts convex/productAnalysis.test.ts` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run typecheck` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm run lint` | Exit 0; tests pass, or no type/lint/diff errors |
| `npm test` | Exit 0; tests pass, or no type/lint/diff errors |

## Steps

### Step 1

Write a policy matrix for human save, quick approve, alias, batch apply, undo, catalog, and extraction. Characterize intended status and learning differences in tests.

**Verify:** `npm test -- convex/receipts.test.ts convex/receiptReview.test.ts convex/corrections.test.ts convex/catalog.test.ts convex/productAnalysis.test.ts` must exit 0 before continuing. When adding a defect test, first demonstrate the expected failure on the old path, then make it pass in the same logical change.

### Step 2

Implement commitReceiptChange as an ordinary typed helper using MutationCtx. Use explicit origin/revision information instead of a general bag of boolean switches.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 3

Move common revision and dependent-work decisions into the helper. Keep corrections and category learning in their own domain functions and the same transaction.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

### Step 4

Adopt the helper one writer at a time. Preserve evidence/generation checks for asynchronous results and protect later manual changes.

**Verify:** `npm run typecheck` and `npm run lint` must exit 0 before continuing.

## Test plan

- Stale revisions are rejected without partial data or history changes.
- Human approval learns once through the existing rule; automatic results do not learn.
- Alias, batch apply, undo, and catalog updates schedule analysis for the committed revision.
- Manual decisions remain protected from stale catalog results.

Place pure state/policy tests in the named src/lib test file and transactional behavior tests in the named convex test file. Follow the existing examples above. Do not build a large mock React tree to test a pure decision. Where this plan requires visual or native behavior, record a development-build check separately; unit tests do not prove it.

## Done criteria

- [ ] Shared receipt-change policy is defined once; endpoint-specific authorization and learning intent remain explicit. No extra action-to-mutation round trips are introduced.
- [ ] Every command in the verification table exits 0.
- [ ] The named defect and edge cases have meaningful assertions where automated coverage is feasible.
- [ ] Required native checks are recorded with the build and scenario, or explicitly left unverified.
- [ ] `git diff --check` exits 0.
- [ ] `git diff --name-only` shows only in-scope changes.
- [ ] The plan status in plans/README.md is updated.

## Stop conditions

- Do not claim current writes are non-atomic. Do not merge extraction and user editing into an untyped generic CRUD function. Preserve intentional status differences from the matrix.
- Stop if the source no longer supports the finding, or this work requires an unrelated change outside scope.
- Stop and report the failed assumption if a verification gate still fails after a reasonable fix attempt. Do not remove tests or alter behavior solely to make the gate pass.
- Do not discard another contributor's changes or local queue data.

## Git workflow

Work from the operator's chosen checkout. If a new branch is requested, use `refactor/receipt-write-policy`. Use a direct imperative commit title; recent repository history uses titles such as "Add release controls, OTA updates, and Sentry diagnostics". Do not commit, push, or open a PR unless the operator requests it.



## Function contract acceptance

### Separate receipt decisions from transaction execution

Use a pure decideReceiptChange(input: ReceiptChangeInput): ReceiptChangeDecision for the status/revision/invalidation policy. Read current authority and database facts, compute the decision, and commit it within the same Convex mutation. Keep commitReceiptChange explicitly effectful, with named arguments and a small ReceiptCommitAcknowledgement containing the receipt ID and committed revision. Queries supply the persisted receipt. Pure decisions return their result without modifying the caller's input. Avoid a general-purpose command engine.

- Give exported domain operations narrow, named input and result types. A caller should see units, required evidence, expected failure or absence, and whether the operation writes state. Keep inferred types for small private helpers where the contract is already clear.
- Parse untrusted or persisted input into a semantic value at the trust boundary. Retain checked facts in the returned type. Returning the original broad type after a void check, or casting at each call site, does not meet this requirement. Reparse after serialization or edits that invalidate those facts.
- Keep calculation and decision functions deterministic for explicit inputs. They must not change caller-owned objects or read the clock, generate IDs, access storage, call providers, or write logs. Supply required time and IDs from the caller. Local mutation of newly created accumulators is acceptable.
- Keep read and write paths separate. Mutations return null, an ID, or a small acknowledgement such as an ID and revision; queries return persisted objects. Mounted screens receive persisted changes through their existing reactive query; do not add a manual refetch after each mutation. Background workflows can use a focused read query when they need persisted data. Pure transformations can return complete domain values, but must not change caller-owned inputs. Do not add separate databases or a generic command bus.
- Use domain alternatives for materially different outcomes. A boolean predicate or null for one clear absence is valid. Do not wrap every value in a generic result, introduce classes for all types, or create a generic command/pipeline framework.
- Verify the boundary with focused parser cases, a deterministic pure calculation case, and an input-unchanged assertion where mutation is currently a risk. Preserve authorization, revision/generation checks, and transaction atomicity; static types cannot prove current database authority.

## Read-scope acceptance

### Observe persisted state after a save

The receipt editor currently calls receipts.detail after save (src/app/receipt/[id].tsx:375). Return only a ReceiptCommitAcknowledgement with the receipt ID and committed revision. Obtain persisted data through the existing detail subscription, which updates automatically after the write. Do not add a manual post-save refetch. Accept a query snapshot as the new draft baseline only when it includes the acknowledged revision or a later revision and no later local edit would be overwritten. Acknowledge the save separately from receiving persisted data. Coordinate this with package001. Do not return receipt, image or extraction objects from the mutation.

Required check: A save returns only the ID/revision acknowledgement. The query supplies persisted data in either arrival order, stale snapshots cannot reset the draft, and edits made while saving remain intact.

## Maintenance notes

Every future receipt writer must either use this helper or document a narrow reason it is not a content change.
